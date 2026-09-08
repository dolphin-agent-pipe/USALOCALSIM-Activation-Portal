import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { COMMISSION_STATUS } from "./commission-status";
import {
  isFundsAvailableByHold,
  settlementHoldDaysForProvider,
} from "./commission-settlement";
import type {
  CustomerFundsSettledEvent,
  CustomerPaymentConfirmedEvent,
} from "./customer-payment-events";
import { VOUCHER_INVENTORY_STATUS } from "./partner-inventory";
import {
  applyChargebackOffsetsForCommission,
  persistChargebackNotifications,
} from "./commission-chargeback";

type Db = Prisma.TransactionClient;

export type RecordCommissionResult =
  | { ok: true; created: boolean; commissionId: string; status: string }
  | { ok: false; skipped: string };

async function appendStatusEvent(
  tx: Db,
  commissionId: string,
  fromStatus: string | null,
  toStatus: string,
  note?: string,
) {
  await tx.commissionStatusEvent.create({
    data: {
      commissionId,
      fromStatus,
      toStatus,
      note: note ?? null,
    },
  });
}

async function promoteToEligible(
  tx: Db,
  commissionId: string,
  fundsAvailableAt: Date,
  note?: string,
) {
  const row = await tx.commission.findUnique({
    where: { id: commissionId },
    select: { status: true },
  });
  if (!row || row.status !== COMMISSION_STATUS.PENDING_FUNDS) return false;

  await tx.commission.update({
    where: { id: commissionId },
    data: {
      status: COMMISSION_STATUS.ELIGIBLE,
      fundsAvailableAt,
      eligibleAt: fundsAvailableAt,
    },
  });
  await appendStatusEvent(
    tx,
    commissionId,
    COMMISSION_STATUS.PENDING_FUNDS,
    COMMISSION_STATUS.ELIGIBLE,
    note,
  );
  return true;
}

async function finalizeEligibleCommission(tx: Db, commissionId: string) {
  return applyChargebackOffsetsForCommission(tx, commissionId);
}

/**
 * Create commission on original prepaid voucher sale only.
 * Skips when voucher has no assigned partner or commission already exists.
 */
export async function recordCommissionForVoucherSale(
  tx: Db,
  input: CustomerPaymentConfirmedEvent,
): Promise<RecordCommissionResult> {
  const existing = await tx.commission.findFirst({
    where: {
      OR: [{ voucherId: input.voucherId }, { saleTransactionId: input.saleTransactionId }],
    },
    select: { id: true, status: true },
  });
  if (existing) {
    return { ok: true, created: false, commissionId: existing.id, status: existing.status };
  }

  const voucher = await tx.voucher.findUnique({
    where: { id: input.voucherId },
    select: {
      id: true,
      partnerId: true,
      inventoryStatus: true,
      prepaidCard: { select: { serial: true, retailMarket: true } },
    },
  });
  if (!voucher) {
    return { ok: false, skipped: "voucher_not_found" };
  }
  if (!voucher.partnerId) {
    return { ok: false, skipped: "no_assigned_partner" };
  }

  const partner = await tx.partner.findUnique({
    where: { id: voucher.partnerId },
    select: { id: true, defaultCommissionCents: true, active: true },
  });
  if (!partner?.active) {
    return { ok: false, skipped: "partner_inactive" };
  }

  const soldAt = input.soldAt ?? new Date();
  const serialSnapshot = voucher.prepaidCard?.serial ?? null;
  const customerCountry =
    input.customerCountry ??
    (voucher.prepaidCard?.retailMarket === "br" ? "BR" : undefined);

  const commission = await tx.commission.create({
    data: {
      partnerId: partner.id,
      status: COMMISSION_STATUS.PENDING_FUNDS,
      amountBrlCents: partner.defaultCommissionCents,
      currency: "BRL",
      voucherId: voucher.id,
      voucherSerialSnapshot: serialSnapshot,
      cartPurchaseId: input.cartPurchaseId,
      saleTransactionId: input.saleTransactionId,
      paymentProvider: input.paymentProvider,
      saleAmountCents: input.saleAmountCents,
      saleCurrency: input.saleCurrency ?? null,
      customerCountry: customerCountry ?? null,
      soldAt,
    },
  });

  await appendStatusEvent(
    tx,
    commission.id,
    null,
    COMMISSION_STATUS.PENDING_FUNDS,
    "Original voucher sale recorded",
  );

  const nextInventory =
    voucher.inventoryStatus === VOUCHER_INVENTORY_STATUS.REDEEMED
      ? VOUCHER_INVENTORY_STATUS.REDEEMED
      : VOUCHER_INVENTORY_STATUS.SOLD;

  await tx.voucher.update({
    where: { id: voucher.id },
    data: {
      inventoryStatus: nextInventory,
      soldAt,
      saleTransactionId: input.saleTransactionId,
    },
  });

  if (isFundsAvailableByHold(soldAt, input.paymentProvider, soldAt)) {
    await promoteToEligible(
      tx,
      commission.id,
      soldAt,
      settlementHoldDaysForProvider(input.paymentProvider) === 0
        ? "Funds immediately available (POS / zero hold)"
        : "Funds immediately available (COMMISSION_IMMEDIATE_FUNDS_AVAILABLE)",
    );
    await finalizeEligibleCommission(tx, commission.id);
    const refreshed = await tx.commission.findUniqueOrThrow({
      where: { id: commission.id },
      select: { status: true },
    });
    return {
      ok: true,
      created: true,
      commissionId: commission.id,
      status: refreshed.status,
    };
  }

  return {
    ok: true,
    created: true,
    commissionId: commission.id,
    status: COMMISSION_STATUS.PENDING_FUNDS,
  };
}

export async function markCommissionFundsAvailable(
  input: CustomerFundsSettledEvent,
  db: Db | typeof prisma = prisma,
): Promise<{ updated: number }> {
  const settledAt = input.settledAt ?? new Date();
  const commission = await db.commission.findUnique({
    where: { saleTransactionId: input.saleTransactionId },
    select: { id: true, status: true },
  });
  if (!commission || commission.status !== COMMISSION_STATUS.PENDING_FUNDS) {
    return { updated: 0 };
  }

  if ("$transaction" in db) {
    await db.$transaction(async (tx) => {
      const promoted = await promoteToEligible(tx, commission.id, settledAt, input.note);
      if (promoted) await finalizeEligibleCommission(tx, commission.id);
    });
  } else {
    const promoted = await promoteToEligible(db, commission.id, settledAt, input.note);
    if (promoted) await finalizeEligibleCommission(db, commission.id);
  }

  return { updated: 1 };
}

export async function promotePendingCommissionsBySettlementHold(
  db: typeof prisma = prisma,
): Promise<{ promoted: number }> {
  const pending = await db.commission.findMany({
    where: { status: COMMISSION_STATUS.PENDING_FUNDS },
    select: { id: true, soldAt: true, paymentProvider: true, partnerId: true },
    orderBy: { soldAt: "asc" },
    take: 500,
  });

  const now = new Date();
  let promoted = 0;

  for (const row of pending) {
    if (!isFundsAvailableByHold(row.soldAt, row.paymentProvider, now)) continue;
    const notifications: string[] = [];
    const result = await db.$transaction(async (tx) => {
      const ok = await promoteToEligible(
        tx,
        row.id,
        now,
        `Settlement hold elapsed (${settlementHoldDaysForProvider(row.paymentProvider)}d)`,
      );
      if (!ok) return { ok: 0, notifications: [] as string[] };
      const offset = await finalizeEligibleCommission(tx, row.id);
      return { ok: 1, notifications: offset.notifications };
    });
    promoted += result.ok;
    notifications.push(...result.notifications);
    if (notifications.length) {
      await persistChargebackNotifications(row.partnerId, row.id, notifications);
    }
  }

  return { promoted };
}

export async function handlePaymentConfirmedForCommission(
  event: CustomerPaymentConfirmedEvent,
): Promise<RecordCommissionResult> {
  return prisma.$transaction((tx) => recordCommissionForVoucherSale(tx, event));
}

export async function handleFundsSettledForCommission(
  event: CustomerFundsSettledEvent,
): Promise<{ updated: number }> {
  return markCommissionFundsAvailable(event);
}
