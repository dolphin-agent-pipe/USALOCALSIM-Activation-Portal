import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-server";
import { formatBrlFromCents } from "@/lib/partner-inventory";

export async function GET(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const partnerId = url.searchParams.get("partnerId");
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

  const rows = await prisma.partnerChargebackBalance.findMany({
    where: {
      ...(partnerId ? { partnerId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      partner: { select: { id: true, name: true } },
      sourceCommission: {
        select: {
          id: true,
          voucherSerialSnapshot: true,
          amountBrlCents: true,
          saleTransactionId: true,
          status: true,
        },
      },
      allocations: {
        orderBy: { createdAt: "asc" },
        include: {
          newCommission: {
            select: {
              id: true,
              voucherSerialSnapshot: true,
              amountBrlCents: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      originalBrlFormatted: formatBrlFromCents(r.originalBrlCents),
      remainingBrlFormatted: formatBrlFromCents(r.remainingBrlCents),
    })),
  });
}
