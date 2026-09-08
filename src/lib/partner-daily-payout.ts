import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { COMMISSION_STATUS } from "./commission-status";
import { netPayableBrlCents } from "./commission-chargeback-status";
import {
  getWiseConfig,
  isCommissionPayoutsEnabled,
  isWiseSimulateMode,
} from "./wise-config";
import { ensureWiseRecipientForPartner } from "./wise-recipient";
import {
  brlCentsToAmount,
  createWisePayoutQuote,
  createWisePayoutTransfer,
  fundWiseTransfer,
  getWiseTransfer,
} from "./wise-payout";
import {
  PAYOUT_ATTEMPT_STATUS,
  PAYOUT_BATCH_STATUS,
  WISE_TRANSFER_PAID_STATUSES,
  WISE_TRANSFER_PROCESSING_STATUSES,
} from "./payout-status";

type Db = Prisma.TransactionClient;

export const PAYABLE_COMMISSION_STATUSES = [
  COMMISSION_STATUS.ELIGIBLE,
  COMMISSION_STATUS.OFFSET_PARTIAL,
] as const;

export function utcPayoutDate(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function commissionStatusBeforePayout(offsetAppliedBrlCents: number): string {
  return offsetAppliedBrlCents > 0
    ? COMMISSION_STATUS.OFFSET_PARTIAL
    : COMMISSION_STATUS.ELIGIBLE;
}

export function isCommissionPayable(row: {
  status: string;
  amountBrlCents: number;
  offsetAppliedBrlCents: number;
  payoutBatchId: string | null;
}): boolean {
  if (row.payoutBatchId) return false;
  if (!(PAYABLE_COMMISSION_STATUSES as readonly string[]).includes(row.status)) return false;
  return netPayableBrlCents(row.amountBrlCents, row.offsetAppliedBrlCents) > 0;
}

async function appendCommissionStatus(
  tx: Db,
  commissionId: string,
  fromStatus: string,
  toStatus: string,
  note: string,
) {
  await tx.commissionStatusEvent.create({
    data: { commissionId, fromStatus, toStatus, note },
  });
}

async function markCommissionsIncluded(
  tx: Db,
  commissionIds: string[],
  batchId: string,
  attemptId: string,
) {
  for (const id of commissionIds) {
    const row = await tx.commission.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    await tx.commission.update({
      where: { id },
      data: {
        status: COMMISSION_STATUS.INCLUDED_IN_PAYOUT,
        payoutBatchId: batchId,
        payoutAttemptId: attemptId,
      },
    });
    await appendCommissionStatus(
      tx,
      id,
      row.status,
      COMMISSION_STATUS.INCLUDED_IN_PAYOUT,
      "Included in daily payout batch",
    );
  }
}

async function revertCommissionsFromFailedPayout(tx: Db, commissionIds: string[]) {
  for (const id of commissionIds) {
    const row = await tx.commission.findUniqueOrThrow({
      where: { id },
      select: { status: true, offsetAppliedBrlCents: true },
    });
    const restored = commissionStatusBeforePayout(row.offsetAppliedBrlCents);
    await tx.commission.update({
      where: { id },
      data: {
        status: restored,
        payoutBatchId: null,
        payoutAttemptId: null,
      },
    });
    await appendCommissionStatus(
      tx,
      id,
      row.status,
      restored,
      "Payout failed — commission returned to payable queue",
    );
  }
}

async function markCommissionsPaid(tx: Db, commissionIds: string[]) {
  for (const id of commissionIds) {
    const row = await tx.commission.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    await tx.commission.update({
      where: { id },
      data: { status: COMMISSION_STATUS.PAID },
    });
    await appendCommissionStatus(tx, id, row.status, COMMISSION_STATUS.PAID, "Wise payout completed");
  }
}

export type PartnerPayoutRunResult = {
  partnerId: string;
  partnerName: string;
  batchId?: string;
  attemptId?: string;
  status: "skipped" | "created" | "paid" | "processing" | "failed" | "simulated";
  totalBrlCents?: number;
  reason?: string;
  wiseTransferId?: string;
};

export type DailyPayoutRunSummary = {
  enabled: boolean;
  payoutDate: string;
  partners: PartnerPayoutRunResult[];
};

async function loadPayableCommissions(partnerId: string) {
  const rows = await prisma.commission.findMany({
    where: {
      partnerId,
      payoutBatchId: null,
      status: { in: [...PAYABLE_COMMISSION_STATUSES] },
    },
    orderBy: { soldAt: "asc" },
    select: {
      id: true,
      status: true,
      amountBrlCents: true,
      offsetAppliedBrlCents: true,
      payoutBatchId: true,
    },
  });
  return rows.filter(isCommissionPayable);
}

export async function runPartnerDailyPayout(input: {
  partnerId: string;
  partnerName: string;
  payoutDate: Date;
}): Promise<PartnerPayoutRunResult> {
  const { partnerId, partnerName, payoutDate } = input;

  const existingBatch = await prisma.payoutBatch.findUnique({
    where: { partnerId_payoutDate: { partnerId, payoutDate } },
    include: {
      attempts: { orderBy: { requestedAt: "desc" }, take: 1 },
    },
  });

  if (existingBatch?.status === PAYOUT_BATCH_STATUS.PAID) {
    return { partnerId, partnerName, status: "skipped", reason: "already_paid" };
  }
  if (
    existingBatch &&
    (existingBatch.status === PAYOUT_BATCH_STATUS.PROCESSING ||
      existingBatch.status === PAYOUT_BATCH_STATUS.SUBMITTED)
  ) {
    return { partnerId, partnerName, status: "skipped", reason: "in_progress" };
  }

  const payable = await loadPayableCommissions(partnerId);
  if (!payable.length) {
    return { partnerId, partnerName, status: "skipped", reason: "no_payable_commissions" };
  }

  const totalBrlCents = payable.reduce(
    (sum, row) => sum + netPayableBrlCents(row.amountBrlCents, row.offsetAppliedBrlCents),
    0,
  );
  if (totalBrlCents <= 0) {
    return { partnerId, partnerName, status: "skipped", reason: "zero_net_payable" };
  }

  const profile = await prisma.partnerPayoutProfile.findUnique({ where: { partnerId } });
  if (!profile) {
    return { partnerId, partnerName, status: "skipped", reason: "payout_profile_missing" };
  }

  const wiseConfig = getWiseConfig();
  const simulate = isWiseSimulateMode();

  let wiseRecipientId = profile.wiseRecipientId;
  if (!wiseRecipientId && wiseConfig) {
    const recipient = await ensureWiseRecipientForPartner(partnerId);
    if (!recipient.ok) {
      return { partnerId, partnerName, status: "failed", reason: recipient.error };
    }
    wiseRecipientId = recipient.wiseRecipientId;
  }
  if (!wiseRecipientId && !simulate) {
    return { partnerId, partnerName, status: "failed", reason: "wise_recipient_missing" };
  }

  const commissionIds = payable.map((r) => r.id);
  const batch =
    existingBatch ??
    (await prisma.payoutBatch.create({
      data: {
        partnerId,
        payoutDate,
        status: PAYOUT_BATCH_STATUS.CREATED,
        totalBrlCents,
      },
    }));

  const attempt = await prisma.$transaction(async (tx) => {
    if (existingBatch?.status === PAYOUT_BATCH_STATUS.FAILED) {
      await tx.payoutBatch.update({
        where: { id: batch.id },
        data: { status: PAYOUT_BATCH_STATUS.CREATED, totalBrlCents },
      });
    } else if (existingBatch) {
      await tx.payoutBatch.update({
        where: { id: batch.id },
        data: { totalBrlCents },
      });
    }

    const createdAttempt = await tx.payoutAttempt.create({
      data: {
        batchId: batch.id,
        partnerId,
        wiseRecipientId,
        status: PAYOUT_ATTEMPT_STATUS.CREATED,
        amountBrlCents: totalBrlCents,
      },
    });

    await markCommissionsIncluded(tx, commissionIds, batch.id, createdAttempt.id);
    return createdAttempt;
  });

  if (simulate) {
    await prisma.$transaction(async (tx) => {
      await tx.payoutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PAYOUT_ATTEMPT_STATUS.PAID,
          wiseTransferId: `sim-${attempt.id}`,
          wiseStatusMessage: "Simulated payout (COMMISSION_PAYOUTS_SIMULATE=true)",
          completedAt: new Date(),
        },
      });
      await tx.payoutBatch.update({
        where: { id: batch.id },
        data: { status: PAYOUT_BATCH_STATUS.PAID, totalBrlCents },
      });
      await markCommissionsPaid(tx, commissionIds);
    });

    return {
      partnerId,
      partnerName,
      batchId: batch.id,
      attemptId: attempt.id,
      status: "simulated",
      totalBrlCents,
      wiseTransferId: `sim-${attempt.id}`,
    };
  }

  if (!wiseConfig) {
    await prisma.$transaction(async (tx) => {
      await tx.payoutBatch.update({
        where: { id: batch.id },
        data: { status: PAYOUT_BATCH_STATUS.REVIEW },
      });
      await tx.payoutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PAYOUT_ATTEMPT_STATUS.FAILED,
          wiseStatusMessage: "Wise API not configured",
          failedAt: new Date(),
        },
      });
      await revertCommissionsFromFailedPayout(tx, commissionIds);
    });
    return {
      partnerId,
      partnerName,
      batchId: batch.id,
      attemptId: attempt.id,
      status: "failed",
      reason: "wise_not_configured",
      totalBrlCents,
    };
  }

  const correlationId = `payout-${batch.id}-${attempt.id}`;
  const targetAmountBrl = brlCentsToAmount(totalBrlCents);

  try {
    const quote = await createWisePayoutQuote(wiseConfig, {
      targetAmountBrl,
      recipientId: wiseRecipientId!,
      correlationId,
    });

    await prisma.payoutAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PAYOUT_ATTEMPT_STATUS.QUOTED,
        wiseQuoteId: quote.quoteId,
        wiseRate: quote.rate,
        wiseFeeSourceCents: quote.feeSourceCents,
        wiseTransferNature: quote.transferNature,
        wiseRawQuote: quote.rawQuote,
      },
    });

    const transfer = await createWisePayoutTransfer(wiseConfig, {
      quoteId: quote.quoteId,
      recipientId: wiseRecipientId!,
      customerTransactionId: correlationId,
      reference: `Commission ${payoutDate.toISOString().slice(0, 10)}`,
    });

    await fundWiseTransfer(wiseConfig, transfer.transferId, correlationId);

    const finalTransfer = await getWiseTransfer(wiseConfig, transfer.transferId);
    const isPaid = WISE_TRANSFER_PAID_STATUSES.has(finalTransfer.status);
    const isProcessing = WISE_TRANSFER_PROCESSING_STATUSES.has(finalTransfer.status);

    if (isPaid) {
      await prisma.$transaction(async (tx) => {
        await tx.payoutAttempt.update({
          where: { id: attempt.id },
          data: {
            status: PAYOUT_ATTEMPT_STATUS.PAID,
            wiseTransferId: transfer.transferId,
            wiseRawTransfer: finalTransfer.raw,
            wiseStatusMessage: finalTransfer.status,
            completedAt: new Date(),
          },
        });
        await tx.payoutBatch.update({
          where: { id: batch.id },
          data: { status: PAYOUT_BATCH_STATUS.PAID, totalBrlCents },
        });
        await markCommissionsPaid(tx, commissionIds);
      });

      return {
        partnerId,
        partnerName,
        batchId: batch.id,
        attemptId: attempt.id,
        status: "paid",
        totalBrlCents,
        wiseTransferId: transfer.transferId,
      };
    }

    if (isProcessing) {
      await prisma.$transaction(async (tx) => {
        await tx.payoutAttempt.update({
          where: { id: attempt.id },
          data: {
            status: PAYOUT_ATTEMPT_STATUS.PROCESSING,
            wiseTransferId: transfer.transferId,
            wiseRawTransfer: finalTransfer.raw,
            wiseStatusMessage: finalTransfer.status,
          },
        });
        await tx.payoutBatch.update({
          where: { id: batch.id },
          data: { status: PAYOUT_BATCH_STATUS.PROCESSING, totalBrlCents },
        });
      });

      return {
        partnerId,
        partnerName,
        batchId: batch.id,
        attemptId: attempt.id,
        status: "processing",
        totalBrlCents,
        wiseTransferId: transfer.transferId,
      };
    }

    throw new Error(`Unexpected Wise transfer status: ${finalTransfer.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.$transaction(async (tx) => {
      await tx.payoutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PAYOUT_ATTEMPT_STATUS.FAILED,
          wiseStatusMessage: message.slice(0, 4000),
          failedAt: new Date(),
        },
      });
      await tx.payoutBatch.update({
        where: { id: batch.id },
        data: { status: PAYOUT_BATCH_STATUS.FAILED },
      });
      await revertCommissionsFromFailedPayout(tx, commissionIds);
    });

    return {
      partnerId,
      partnerName,
      batchId: batch.id,
      attemptId: attempt.id,
      status: "failed",
      reason: message,
      totalBrlCents,
    };
  }
}

export async function runDailyPartnerPayouts(input?: {
  payoutDate?: Date;
  partnerId?: string;
}): Promise<DailyPayoutRunSummary> {
  const enabled = isCommissionPayoutsEnabled();
  const payoutDate = utcPayoutDate(input?.payoutDate);

  if (!enabled) {
    return {
      enabled: false,
      payoutDate: payoutDate.toISOString().slice(0, 10),
      partners: [],
    };
  }

  const partnerWhere = input?.partnerId
    ? { id: input.partnerId, active: true }
    : { active: true };

  const partners = await prisma.partner.findMany({
    where: partnerWhere,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const results: PartnerPayoutRunResult[] = [];
  for (const partner of partners) {
    results.push(
      await runPartnerDailyPayout({
        partnerId: partner.id,
        partnerName: partner.name,
        payoutDate,
      }),
    );
  }

  return {
    enabled: true,
    payoutDate: payoutDate.toISOString().slice(0, 10),
    partners: results,
  };
}

export async function syncPayoutAttemptFromWise(attemptId: string): Promise<{
  ok: boolean;
  status?: string;
  error?: string;
}> {
  const attempt = await prisma.payoutAttempt.findUnique({
    where: { id: attemptId },
    include: {
      batch: true,
      commissions: { select: { id: true, status: true } },
    },
  });
  if (!attempt) return { ok: false, error: "attempt_not_found" };
  if (!attempt.wiseTransferId || attempt.wiseTransferId.startsWith("sim-")) {
    return { ok: false, error: "no_wise_transfer" };
  }

  const config = getWiseConfig();
  if (!config) return { ok: false, error: "wise_not_configured" };

  const transfer = await getWiseTransfer(config, attempt.wiseTransferId);
  const commissionIds = attempt.commissions.map((c) => c.id);

  if (WISE_TRANSFER_PAID_STATUSES.has(transfer.status)) {
    await prisma.$transaction(async (tx) => {
      await tx.payoutAttempt.update({
        where: { id: attemptId },
        data: {
          status: PAYOUT_ATTEMPT_STATUS.PAID,
          wiseRawTransfer: transfer.raw,
          wiseStatusMessage: transfer.status,
          completedAt: new Date(),
        },
      });
      await tx.payoutBatch.update({
        where: { id: attempt.batchId },
        data: { status: PAYOUT_BATCH_STATUS.PAID },
      });
      await markCommissionsPaid(tx, commissionIds);
    });
    return { ok: true, status: PAYOUT_ATTEMPT_STATUS.PAID };
  }

  if (WISE_TRANSFER_PROCESSING_STATUSES.has(transfer.status)) {
    await prisma.payoutAttempt.update({
      where: { id: attemptId },
      data: {
        status: PAYOUT_ATTEMPT_STATUS.PROCESSING,
        wiseRawTransfer: transfer.raw,
        wiseStatusMessage: transfer.status,
      },
    });
    await prisma.payoutBatch.update({
      where: { id: attempt.batchId },
      data: { status: PAYOUT_BATCH_STATUS.PROCESSING },
    });
    return { ok: true, status: PAYOUT_ATTEMPT_STATUS.PROCESSING };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payoutAttempt.update({
      where: { id: attemptId },
      data: {
        status: PAYOUT_ATTEMPT_STATUS.FAILED,
        wiseRawTransfer: transfer.raw,
        wiseStatusMessage: transfer.status,
        failedAt: new Date(),
      },
    });
    await tx.payoutBatch.update({
      where: { id: attempt.batchId },
      data: { status: PAYOUT_BATCH_STATUS.FAILED },
    });
    await revertCommissionsFromFailedPayout(tx, commissionIds);
  });

  return { ok: true, status: PAYOUT_ATTEMPT_STATUS.FAILED };
}
