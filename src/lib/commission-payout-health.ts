import { prisma } from "./db";
import { COMMISSION_STATUS } from "./commission-status";
import { PAYOUT_BATCH_STATUS } from "./payout-status";
import {
  getCommissionAlertRecipients,
  alertOnStuckProcessingBatches,
} from "./commission-payout-alerts";
import {
  dailyPayoutLockKey,
  isCronLockHeld,
  PROMOTE_ELIGIBLE_LOCK_KEY,
} from "./cron-lock";
import {
  getWiseConfig,
  isCommissionPayoutsEnabled,
  isWiseConfigured,
  isWiseSimulateMode,
} from "./wise-config";
import { utcPayoutDate } from "./partner-daily-payout";

export type CommissionPayoutHealth = {
  flags: {
    payoutsEnabled: boolean;
    payoutsSimulate: boolean;
    wiseConfigured: boolean;
    alertEmailsConfigured: boolean;
  };
  counts: {
    pendingFunds: number;
    eligible: number;
    offsetPartial: number;
    includedInPayout: number;
    processingBatches: number;
    failedBatchesLast7d: number;
  };
  locks: {
    promoteEligible: boolean;
    dailyPayoutToday: boolean;
  };
  wise: {
    profileId: number | null;
    sourceCurrency: string | null;
    baseUrl: string | null;
  };
};

export async function getCommissionPayoutHealth(): Promise<CommissionPayoutHealth> {
  const payoutDate = utcPayoutDate();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const wise = getWiseConfig();

  const statusCounts = await prisma.commission.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const countFor = (status: string) =>
    statusCounts.find((s) => s.status === status)?._count._all ?? 0;

  const [processingBatches, failedBatchesLast7d] = await Promise.all([
    prisma.payoutBatch.count({ where: { status: PAYOUT_BATCH_STATUS.PROCESSING } }),
    prisma.payoutBatch.count({
      where: { status: PAYOUT_BATCH_STATUS.FAILED, updatedAt: { gte: sevenDaysAgo } },
    }),
  ]);

  return {
    flags: {
      payoutsEnabled: isCommissionPayoutsEnabled(),
      payoutsSimulate: isWiseSimulateMode(),
      wiseConfigured: isWiseConfigured(),
      alertEmailsConfigured: getCommissionAlertRecipients().length > 0,
    },
    counts: {
      pendingFunds: countFor(COMMISSION_STATUS.PENDING_FUNDS),
      eligible: countFor(COMMISSION_STATUS.ELIGIBLE),
      offsetPartial: countFor(COMMISSION_STATUS.OFFSET_PARTIAL),
      includedInPayout: countFor(COMMISSION_STATUS.INCLUDED_IN_PAYOUT),
      processingBatches,
      failedBatchesLast7d,
    },
    locks: {
      promoteEligible: await isCronLockHeld(PROMOTE_ELIGIBLE_LOCK_KEY),
      dailyPayoutToday: await isCronLockHeld(dailyPayoutLockKey(payoutDate)),
    },
    wise: {
      profileId: wise?.profileId ?? null,
      sourceCurrency: wise?.sourceCurrency ?? null,
      baseUrl: wise?.baseUrl ?? null,
    },
  };
}

export async function checkStuckProcessingBatchesAndAlert(): Promise<{ alerted: number }> {
  const hours = Number(process.env.COMMISSION_PAYOUT_STUCK_HOURS ?? "48");
  const threshold = new Date(Date.now() - hours * 60 * 60 * 1000);

  const batches = await prisma.payoutBatch.findMany({
    where: {
      status: PAYOUT_BATCH_STATUS.PROCESSING,
      updatedAt: { lt: threshold },
    },
    include: {
      partner: { select: { name: true } },
      attempts: {
        where: { status: "PROCESSING" },
        orderBy: { requestedAt: "desc" },
        take: 1,
        select: { wiseTransferId: true },
      },
    },
    take: 50,
  });

  if (!batches.length) return { alerted: 0 };

  await alertOnStuckProcessingBatches(
    batches.map((b) => ({
      id: b.id,
      partnerName: b.partner.name,
      payoutDate: b.payoutDate.toISOString().slice(0, 10),
      wiseTransferId: b.attempts[0]?.wiseTransferId ?? null,
    })),
  );

  return { alerted: batches.length };
}
