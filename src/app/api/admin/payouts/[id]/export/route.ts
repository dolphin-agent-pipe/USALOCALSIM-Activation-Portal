import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { formatBrlFromCents } from "@/lib/partner-inventory";
import { netPayableBrlCents } from "@/lib/commission-chargeback-status";

type Ctx = { params: { id: string } };

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batch = await prisma.payoutBatch.findUnique({
    where: { id: ctx.params.id },
    include: {
      partner: { select: { name: true } },
      attempts: { orderBy: { requestedAt: "desc" }, take: 1 },
      commissions: {
        orderBy: { soldAt: "asc" },
        include: {
          voucher: { select: { prepaidCard: { select: { serial: true } } } },
        },
      },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Payout batch not found" }, { status: 404 });
  }

  const attempt = batch.attempts[0];
  const header = [
    "batch_id",
    "payout_date",
    "batch_status",
    "partner_name",
    "wise_transfer_id",
    "wise_quote_id",
    "commission_id",
    "voucher_serial",
    "sale_transaction_id",
    "commission_status",
    "amount_brl",
    "offset_brl",
    "net_payable_brl",
    "sold_at",
  ].join(",");

  const lines = batch.commissions.map((c) => {
    const net = netPayableBrlCents(c.amountBrlCents, c.offsetAppliedBrlCents);
    const serial = c.voucherSerialSnapshot ?? c.voucher.prepaidCard?.serial ?? "";
    return [
      batch.id,
      batch.payoutDate.toISOString().slice(0, 10),
      batch.status,
      batch.partner.name,
      attempt?.wiseTransferId ?? "",
      attempt?.wiseQuoteId ?? "",
      c.id,
      serial,
      c.saleTransactionId,
      c.status,
      formatBrlFromCents(c.amountBrlCents),
      formatBrlFromCents(c.offsetAppliedBrlCents),
      formatBrlFromCents(net),
      c.soldAt.toISOString(),
    ]
      .map(csvEscape)
      .join(",");
  });

  const csv = [header, ...lines].join("\n");
  const filename = `payout-${batch.payoutDate.toISOString().slice(0, 10)}-${batch.id.slice(0, 8)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
