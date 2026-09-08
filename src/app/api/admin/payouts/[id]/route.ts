import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { formatBrlFromCents } from "@/lib/partner-inventory";
import { netPayableBrlCents } from "@/lib/commission-chargeback-status";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batch = await prisma.payoutBatch.findUnique({
    where: { id: ctx.params.id },
    include: {
      partner: { select: { id: true, name: true, email: true } },
      attempts: { orderBy: { requestedAt: "desc" } },
      commissions: {
        orderBy: { soldAt: "asc" },
        include: {
          voucher: {
            select: {
              code: true,
              prepaidCard: { select: { serial: true } },
            },
          },
        },
      },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Payout batch not found" }, { status: 404 });
  }

  return NextResponse.json({
    batch: {
      id: batch.id,
      status: batch.status,
      payoutDate: batch.payoutDate.toISOString().slice(0, 10),
      totalBrlCents: batch.totalBrlCents,
      totalBrlFormatted: formatBrlFromCents(batch.totalBrlCents),
      partner: batch.partner,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    },
    attempts: batch.attempts.map((a) => ({
      id: a.id,
      status: a.status,
      amountBrlCents: a.amountBrlCents,
      amountBrlFormatted: formatBrlFromCents(a.amountBrlCents),
      wiseRecipientId: a.wiseRecipientId,
      wiseQuoteId: a.wiseQuoteId,
      wiseTransferId: a.wiseTransferId,
      wiseRate: a.wiseRate,
      wiseTransferNature: a.wiseTransferNature,
      wiseStatusMessage: a.wiseStatusMessage,
      requestedAt: a.requestedAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
      failedAt: a.failedAt?.toISOString() ?? null,
    })),
    commissions: batch.commissions.map((c) => ({
      id: c.id,
      status: c.status,
      amountBrlCents: c.amountBrlCents,
      amountBrlFormatted: formatBrlFromCents(c.amountBrlCents),
      offsetAppliedBrlCents: c.offsetAppliedBrlCents,
      offsetAppliedBrlFormatted: formatBrlFromCents(c.offsetAppliedBrlCents),
      netPayableBrlCents: netPayableBrlCents(c.amountBrlCents, c.offsetAppliedBrlCents),
      netPayableBrlFormatted: formatBrlFromCents(
        netPayableBrlCents(c.amountBrlCents, c.offsetAppliedBrlCents),
      ),
      saleTransactionId: c.saleTransactionId,
      soldAt: c.soldAt.toISOString(),
      serial: c.voucherSerialSnapshot ?? c.voucher.prepaidCard?.serial ?? null,
      voucherCode: c.voucher.code,
    })),
  });
}
