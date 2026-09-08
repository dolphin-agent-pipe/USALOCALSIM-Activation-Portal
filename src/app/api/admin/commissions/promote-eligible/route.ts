import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { promotePendingCommissionsBySettlementHold } from "@/lib/commission-engine";
import { prisma } from "@/lib/db";

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

  const { promoted } = await promotePendingCommissionsBySettlementHold();

  if (session?.user?.id) {
    await prisma.auditLog.create({
      data: {
        action: "commission_promote_eligible",
        userId: session.user.id,
        metadata: JSON.stringify({ promoted }),
      },
    });
  }

  return NextResponse.json({ ok: true, promoted });
}
