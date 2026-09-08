import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { alertOnDailyPayoutRun } from "@/lib/commission-payout-alerts";
import { checkStuckProcessingBatchesAndAlert } from "@/lib/commission-payout-health";
import { acquireCronLock, dailyPayoutLockKey, releaseCronLock } from "@/lib/cron-lock";
import { runDailyPartnerPayouts, utcPayoutDate } from "@/lib/partner-daily-payout";
import { isCommissionPayoutsEnabled } from "@/lib/wise-config";

function authorizeCron(req: Request): boolean {
  const secret = process.env.COMMISSION_PAYOUT_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret");
  const url = new URL(req.url);
  const query = url.searchParams.get("secret");
  return header === secret || query === secret;
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session && !authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const partnerId = url.searchParams.get("partnerId") ?? undefined;
  const payoutDateRaw = url.searchParams.get("payoutDate");
  const payoutDate = utcPayoutDate(
    payoutDateRaw ? new Date(`${payoutDateRaw}T00:00:00.000Z`) : undefined,
  );

  const lock = await acquireCronLock(dailyPayoutLockKey(payoutDate));
  if (!lock.acquired) {
    return NextResponse.json(
      {
        ok: false,
        locked: true,
        lockReason: "daily_payout_in_progress",
        payoutDate: payoutDate.toISOString().slice(0, 10),
        expiresAt: lock.expiresAt?.toISOString() ?? null,
      },
      { status: 409 },
    );
  }

  try {
    const summary = await runDailyPartnerPayouts({ partnerId, payoutDate });
    await alertOnDailyPayoutRun(summary);
    const stuck = await checkStuckProcessingBatchesAndAlert();

    if (session?.user?.id) {
      await prisma.auditLog.create({
        data: {
          action: "payout_run_daily",
          userId: session.user.id,
          metadata: JSON.stringify({
            enabled: summary.enabled,
            payoutDate: summary.payoutDate,
            partnerId,
            stuckAlerted: stuck.alerted,
            results: summary.partners,
          }),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      payoutsEnabled: isCommissionPayoutsEnabled(),
      stuckAlerted: stuck.alerted,
      ...summary,
    });
  } finally {
    await releaseCronLock(dailyPayoutLockKey(payoutDate), lock.ownerToken);
  }
}
