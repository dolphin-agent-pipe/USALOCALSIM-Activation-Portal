import type { Prisma } from "@prisma/client";
import { COMMISSION_STATUS } from "./commission-status";
import {
  CHARGEBACK_BALANCE_STATUS,
  CHARGEBACK_REASON,
  COMMISSION_UNPAID_STATUSES,
  netPayableBrlCents,
} from "./commission-chargeback-status";
import {
  buildChargebackRecordedNotification,
  buildOffsetAllocationNotification,
} from "./commission-chargeback-notify";
import { prisma } from "./db";

type Db = Prisma.TransactionClient;

export type ApplyOffsetsResult = {
  offsetAppliedBrlCents: number;
  netPayableBrlCents: number;
  finalStatus: string;
  allocations: Array<{
    oldCommissionId: string;
    oldVoucherSerial: string | null;
    amountBrlCents: number;
    balanceSettled: boolean;
  }>;
  notifications: string[];
};

/** Pure offset planner for tests. */
export function planChargebackOffsets(
  grossBrlCents: number,
  openBalances: Array<{ id: string; remainingBrlCents: number; oldCommissionId: string }>,
): Array<{ balanceId: string; oldCommissionId: string; amountBrlCents: number }> {
  let remainingGross = grossBrlCents;
  const plan: Array<{ balanceId: string; oldCommissionId: string; amountBrlCents: number }> = [];

  for (const balance of openBalances) {
    if (remainingGross <= 0) break;
    if (balance.remainingBrlCents <= 0) continue;
    const amount = Math.min(remainingGross, balance.remainingBrlCents);
    if (amount <= 0) continue;
    plan.push({
      balanceId: balance.id,
      oldCommissionId: balance.oldCommissionId,
      amountBrlCents: amount,
    });
    remainingGross -= amount;
  }

  return plan;
}

async function appendStatusEvent(
  tx: Db,
  commissionId: string,
  fromStatus: string | null,
  toStatus: string,
  note?: string,
) {
  await tx.commissionStatusEvent.create({
    data: { commissionId, fromStatus, toStatus, note: note ?? null },
  });
}

/**
 * Apply open chargeback balances (FIFO) against a newly eligible commission.
 * Skips balances in ADMIN_REVIEW (partner irregularity).
 */
export async function applyChargebackOffsetsForCommission(
  tx: Db,
  commissionId: string,
): Promise<ApplyOffsetsResult> {
  const commission = await tx.commission.findUnique({
    where: { id: commissionId },
    include: {
      partner: { select: { name: true } },
    },
  });
  if (!commission) {
    return {
      offsetAppliedBrlCents: 0,
      netPayableBrlCents: 0,
      finalStatus: COMMISSION_STATUS.ELIGIBLE,
      allocations: [],
      notifications: [],
    };
  }

  if (
    commission.status !== COMMISSION_STATUS.ELIGIBLE &&
    commission.status !== COMMISSION_STATUS.OFFSET_PARTIAL
  ) {
    return {
      offsetAppliedBrlCents: commission.offsetAppliedBrlCents,
      netPayableBrlCents: netPayableBrlCents(
        commission.amountBrlCents,
        commission.offsetAppliedBrlCents,
      ),
      finalStatus: commission.status,
      allocations: [],
      notifications: [],
    };
  }

  const openBalances = await tx.partnerChargebackBalance.findMany({
    where: {
      partnerId: commission.partnerId,
      status: CHARGEBACK_BALANCE_STATUS.OPEN,
      remainingBrlCents: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
    include: {
      sourceCommission: {
        select: { id: true, voucherSerialSnapshot: true, amountBrlCents: true },
      },
    },
  });

  let remainingGross = netPayableBrlCents(
    commission.amountBrlCents,
    commission.offsetAppliedBrlCents,
  );
  const allocations: ApplyOffsetsResult["allocations"] = [];
  const notifications: string[] = [];
  let totalNewOffset = 0;

  for (const balance of openBalances) {
    if (remainingGross <= 0) break;
    const apply = Math.min(remainingGross, balance.remainingBrlCents);
    if (apply <= 0) continue;

    await tx.commissionOffsetAllocation.create({
      data: {
        chargebackBalanceId: balance.id,
        oldCommissionId: balance.sourceCommissionId,
        newCommissionId: commission.id,
        amountBrlCents: apply,
      },
    });

    const newRemaining = balance.remainingBrlCents - apply;
    const balanceSettled = newRemaining === 0;
    await tx.partnerChargebackBalance.update({
      where: { id: balance.id },
      data: {
        remainingBrlCents: newRemaining,
        status: balanceSettled ? CHARGEBACK_BALANCE_STATUS.SETTLED : CHARGEBACK_BALANCE_STATUS.OPEN,
      },
    });

    remainingGross -= apply;
    totalNewOffset += apply;

    const oldSerial =
      balance.sourceCommission.voucherSerialSnapshot ?? balance.voucherSerialSnapshot ?? "—";

    allocations.push({
      oldCommissionId: balance.sourceCommissionId,
      oldVoucherSerial: oldSerial,
      amountBrlCents: apply,
      balanceSettled,
    });

    notifications.push(
      buildOffsetAllocationNotification({
        partnerName: commission.partner.name,
        oldVoucherSerial: oldSerial,
        oldCommissionBrlCents: balance.sourceCommission.amountBrlCents,
        newVoucherSerial: commission.voucherSerialSnapshot ?? undefined,
        newCommissionBrlCents: commission.amountBrlCents,
        appliedBrlCents: apply,
        remainingDebtBrlCents: newRemaining,
        netPayableBrlCents: remainingGross,
      }),
    );
  }

  const offsetAppliedBrlCents = commission.offsetAppliedBrlCents + totalNewOffset;
  const net = netPayableBrlCents(commission.amountBrlCents, offsetAppliedBrlCents);

  let finalStatus: string = commission.status;
  if (totalNewOffset > 0) {
    if (net === 0) {
      finalStatus = COMMISSION_STATUS.OFFSET_SETTLED;
    } else {
      finalStatus = COMMISSION_STATUS.OFFSET_PARTIAL;
    }
    await tx.commission.update({
      where: { id: commission.id },
      data: {
        offsetAppliedBrlCents,
        status: finalStatus,
      },
    });
    await appendStatusEvent(
      tx,
      commission.id,
      commission.status,
      finalStatus,
      `Chargeback offset applied: ${totalNewOffset} BRL centavos`,
    );
  }

  return {
    offsetAppliedBrlCents,
    netPayableBrlCents: net,
    finalStatus,
    allocations,
    notifications,
  };
}

export type HandleRefundInput = {
  saleTransactionId?: string;
  commissionId?: string;
  refundExternalRef?: string;
  reason?: string;
  adminReview?: boolean;
};

export type HandleRefundResult =
  | {
      ok: true;
      action: "cancelled" | "chargeback_balance" | "admin_review" | "already_handled";
      commissionId: string;
      notification?: string;
    }
  | { ok: false; error: string };

export async function handleSaleRefundOrChargeback(
  input: HandleRefundInput,
): Promise<HandleRefundResult> {
  return prisma.$transaction(async (tx) => {
    const commission = input.commissionId
      ? await tx.commission.findUnique({
          where: { id: input.commissionId },
          include: { partner: { select: { id: true, name: true, email: true } } },
        })
      : input.saleTransactionId
        ? await tx.commission.findUnique({
            where: { saleTransactionId: input.saleTransactionId },
            include: { partner: { select: { id: true, name: true, email: true } } },
          })
        : null;

    if (!commission) {
      return { ok: false, error: "Commission not found for this sale." };
    }

    const existingBalance = await tx.partnerChargebackBalance.findUnique({
      where: { sourceCommissionId: commission.id },
    });
    if (existingBalance) {
      return {
        ok: true,
        action: "already_handled",
        commissionId: commission.id,
      };
    }

    const reason = input.adminReview
      ? CHARGEBACK_REASON.PARTNER_IRREGULARITY
      : input.reason ?? CHARGEBACK_REASON.CUSTOMER_REFUND;

    if (input.adminReview) {
      await tx.commission.update({
        where: { id: commission.id },
        data: {
          status: COMMISSION_STATUS.ADMIN_REVIEW,
          refundExternalRef: input.refundExternalRef ?? null,
        },
      });
      await appendStatusEvent(
        tx,
        commission.id,
        commission.status,
        COMMISSION_STATUS.ADMIN_REVIEW,
        "Flagged for admin review (partner irregularity)",
      );

      if (commission.status === COMMISSION_STATUS.PAID) {
        await tx.partnerChargebackBalance.create({
          data: {
            partnerId: commission.partnerId,
            sourceCommissionId: commission.id,
            voucherSerialSnapshot: commission.voucherSerialSnapshot,
            remainingBrlCents: commission.amountBrlCents,
            originalBrlCents: commission.amountBrlCents,
            status: CHARGEBACK_BALANCE_STATUS.ADMIN_REVIEW,
            reason,
            refundExternalRef: input.refundExternalRef ?? null,
          },
        });
      }

      return {
        ok: true,
        action: "admin_review",
        commissionId: commission.id,
        notification: `Commission for voucher ${commission.voucherSerialSnapshot ?? commission.id} flagged ADMIN_REVIEW.`,
      };
    }

    if ((COMMISSION_UNPAID_STATUSES as readonly string[]).includes(commission.status)) {
      await tx.commission.update({
        where: { id: commission.id },
        data: {
          status: COMMISSION_STATUS.CANCELLED,
          refundExternalRef: input.refundExternalRef ?? null,
        },
      });
      await appendStatusEvent(
        tx,
        commission.id,
        commission.status,
        COMMISSION_STATUS.CANCELLED,
        `Cancelled due to refund/chargeback (${reason})`,
      );
      return { ok: true, action: "cancelled", commissionId: commission.id };
    }

    if (commission.status === COMMISSION_STATUS.PAID) {
      await tx.commission.update({
        where: { id: commission.id },
        data: {
          status: COMMISSION_STATUS.CHARGEBACK_ADJUSTMENT,
          refundExternalRef: input.refundExternalRef ?? null,
        },
      });
      await appendStatusEvent(
        tx,
        commission.id,
        COMMISSION_STATUS.PAID,
        COMMISSION_STATUS.CHARGEBACK_ADJUSTMENT,
        `Paid commission charged back (${reason})`,
      );

      await tx.partnerChargebackBalance.create({
        data: {
          partnerId: commission.partnerId,
          sourceCommissionId: commission.id,
          voucherSerialSnapshot: commission.voucherSerialSnapshot,
          remainingBrlCents: commission.amountBrlCents,
          originalBrlCents: commission.amountBrlCents,
          status: CHARGEBACK_BALANCE_STATUS.OPEN,
          reason,
          refundExternalRef: input.refundExternalRef ?? null,
        },
      });

      const notification = buildChargebackRecordedNotification({
        partnerName: commission.partner.name,
        oldVoucherSerial: commission.voucherSerialSnapshot ?? commission.id,
        oldCommissionBrlCents: commission.amountBrlCents,
      });

      return {
        ok: true,
        action: "chargeback_balance",
        commissionId: commission.id,
        notification,
      };
    }

    if (
      commission.status === COMMISSION_STATUS.CANCELLED ||
      commission.status === COMMISSION_STATUS.CHARGEBACK_ADJUSTMENT ||
      commission.status === COMMISSION_STATUS.ADMIN_REVIEW
    ) {
      return { ok: true, action: "already_handled", commissionId: commission.id };
    }

    return {
      ok: false,
      error: `Cannot process refund for commission in status ${commission.status}.`,
    };
  });
}

/** Re-apply open chargebacks against existing eligible commissions (e.g. after new chargeback). */
export async function reapplyOffsetsForPartner(partnerId: string): Promise<void> {
  const rows = await prisma.commission.findMany({
    where: {
      partnerId,
      status: {
        in: [COMMISSION_STATUS.ELIGIBLE, COMMISSION_STATUS.OFFSET_PARTIAL],
      },
    },
    select: { id: true, amountBrlCents: true, offsetAppliedBrlCents: true },
    orderBy: { eligibleAt: "asc" },
  });

  for (const row of rows) {
    if (netPayableBrlCents(row.amountBrlCents, row.offsetAppliedBrlCents) <= 0) continue;
    const notifications: string[] = [];
    await prisma.$transaction(async (tx) => {
      const result = await applyChargebackOffsetsForCommission(tx, row.id);
      notifications.push(...result.notifications);
    });
    if (notifications.length) {
      await persistChargebackNotifications(partnerId, row.id, notifications);
    }
  }
}

/** Log partner notifications and optionally email when partner email exists. */
export async function persistChargebackNotifications(
  partnerId: string,
  commissionId: string,
  messages: string[],
  userId?: string | null,
) {
  if (!messages.length) return;
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { email: true, name: true },
  });

  for (const message of messages) {
    await prisma.auditLog.create({
      data: {
        action: "commission_chargeback_notification",
        userId: userId ?? null,
        metadata: JSON.stringify({
          partnerId,
          commissionId,
          message,
          partnerEmail: partner?.email ?? null,
        }),
      },
    });
  }

  if (partner?.email) {
    await sendPartnerNotificationEmail(partner.email, partner.name, messages.join("\n\n"));
  }
}

async function sendPartnerNotificationEmail(to: string, partnerName: string, body: string) {
  const from = process.env.EMAIL_FROM ?? "noreply@usalocalsim.com";
  const subject = `USALOCALSIM commission adjustment – ${partnerName}`;
  const text = `${body}\n\n— USALOCALSIM Partner Commission`;

  if (process.env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, text }),
      });
    } catch {
      // non-blocking
    }
    return;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transport.sendMail({ from, to, subject, text });
    } catch {
      // non-blocking
    }
  }
}
