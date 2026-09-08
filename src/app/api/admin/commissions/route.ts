import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-server";
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
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

  const rows = await prisma.commission.findMany({
    where: {
      ...(partnerId ? { partnerId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { soldAt: "desc" },
    take: limit,
    include: {
      partner: { select: { id: true, name: true } },
      voucher: {
        select: {
          code: true,
          inventoryStatus: true,
          prepaidCard: { select: { serial: true } },
        },
      },
      cartPurchase: {
        select: {
          id: true,
          paymentSource: true,
          amountPaidCents: true,
          externalPaymentRef: true,
        },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
      },
    },
  });

  const summary = await prisma.commission.groupBy({
    by: ["status"],
    _count: { _all: true },
    _sum: { amountBrlCents: true },
    where: partnerId ? { partnerId } : undefined,
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      amountBrlFormatted: formatBrlFromCents(r.amountBrlCents),
      offsetAppliedBrlFormatted: formatBrlFromCents(r.offsetAppliedBrlCents),
      netPayableBrlCents: netPayableBrlCents(r.amountBrlCents, r.offsetAppliedBrlCents),
      netPayableBrlFormatted: formatBrlFromCents(
        netPayableBrlCents(r.amountBrlCents, r.offsetAppliedBrlCents),
      ),
      serial: r.voucherSerialSnapshot ?? r.voucher.prepaidCard?.serial ?? null,
    })),
    summary: summary.map((s) => ({
      status: s.status,
      count: s._count._all,
      totalBrlCents: s._sum.amountBrlCents ?? 0,
      totalBrlFormatted: formatBrlFromCents(s._sum.amountBrlCents ?? 0),
    })),
  });
}
