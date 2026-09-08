import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { formatBrlFromCents } from "@/lib/partner-inventory";
import { netPayableBrlCents } from "@/lib/commission-chargeback-status";

export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const partnerId = url.searchParams.get("partnerId");
  const status = url.searchParams.get("status");
  const payoutDate = url.searchParams.get("payoutDate");
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  const rows = await prisma.payoutBatch.findMany({
    where: {
      ...(partnerId ? { partnerId } : {}),
      ...(status ? { status } : {}),
      ...(payoutDate ? { payoutDate: new Date(`${payoutDate}T00:00:00.000Z`) } : {}),
    },
    orderBy: [{ payoutDate: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      partner: { select: { id: true, name: true } },
      attempts: {
        orderBy: { requestedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          wiseTransferId: true,
          wiseQuoteId: true,
          wiseStatusMessage: true,
          requestedAt: true,
          completedAt: true,
          failedAt: true,
        },
      },
      _count: { select: { commissions: true } },
    },
  });

  const summary = await prisma.payoutBatch.groupBy({
    by: ["status"],
    _count: { _all: true },
    _sum: { totalBrlCents: true },
    where: partnerId ? { partnerId } : undefined,
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      payoutDate: r.payoutDate.toISOString().slice(0, 10),
      totalBrlCents: r.totalBrlCents,
      totalBrlFormatted: formatBrlFromCents(r.totalBrlCents),
      commissionCount: r._count.commissions,
      partner: r.partner,
      latestAttempt: r.attempts[0] ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    summary: summary.map((s) => ({
      status: s.status,
      count: s._count._all,
      totalBrlCents: s._sum.totalBrlCents ?? 0,
      totalBrlFormatted: formatBrlFromCents(s._sum.totalBrlCents ?? 0),
    })),
  });
}
