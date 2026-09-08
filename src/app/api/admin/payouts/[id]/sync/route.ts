import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { syncPayoutAttemptFromWise } from "@/lib/partner-daily-payout";

type Ctx = { params: { id: string } };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batch = await prisma.payoutBatch.findUnique({
    where: { id: ctx.params.id },
    include: {
      attempts: { orderBy: { requestedAt: "desc" }, take: 1 },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Payout batch not found" }, { status: 404 });
  }

  const attempt = batch.attempts[0];
  if (!attempt) {
    return NextResponse.json({ error: "No payout attempt on batch" }, { status: 400 });
  }

  const result = await syncPayoutAttemptFromWise(attempt.id);

  if (session.user?.id) {
    await prisma.auditLog.create({
      data: {
        action: "payout_sync_wise",
        userId: session.user.id,
        metadata: JSON.stringify({ batchId: batch.id, attemptId: attempt.id, result }),
      },
    });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "sync_failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
