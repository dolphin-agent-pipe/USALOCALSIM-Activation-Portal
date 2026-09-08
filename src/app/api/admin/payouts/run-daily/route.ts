import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { runDailyPartnerPayouts } from "@/lib/partner-daily-payout";
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
  const payoutDate = payoutDateRaw ? new Date(`${payoutDateRaw}T00:00:00.000Z`) : undefined;

  const summary = await runDailyPartnerPayouts({ partnerId, payoutDate });

  if (session?.user?.id) {
    await prisma.auditLog.create({
      data: {
        action: "payout_run_daily",
        userId: session.user.id,
        metadata: JSON.stringify({
          enabled: summary.enabled,
          payoutDate: summary.payoutDate,
          partnerId,
          results: summary.partners,
        }),
      },
    });
  }

  return NextResponse.json({
    ok: true,
    payoutsEnabled: isCommissionPayoutsEnabled(),
    ...summary,
  });
}
