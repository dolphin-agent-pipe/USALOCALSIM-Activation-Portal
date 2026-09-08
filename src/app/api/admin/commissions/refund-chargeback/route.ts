import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-server";
import { getRequestClientMeta } from "@/lib/request-meta";
import {
  handleSaleRefundOrChargeback,
  persistChargebackNotifications,
  reapplyOffsetsForPartner,
} from "@/lib/commission-chargeback";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  commissionId: z.string().optional(),
  saleTransactionId: z.string().optional(),
  refundExternalRef: z.string().optional(),
  adminReview: z.boolean().optional(),
}).refine((b) => Boolean(b.commissionId || b.saleTransactionId), {
  message: "commissionId or saleTransactionId required",
});

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "Invalid body";
    return NextResponse.json({ error: msg ?? "Invalid body" }, { status: 400 });
  }

  const result = await handleSaleRefundOrChargeback({
    commissionId: body.commissionId,
    saleTransactionId: body.saleTransactionId,
    refundExternalRef: body.refundExternalRef,
    adminReview: body.adminReview,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const commission = await prisma.commission.findUnique({
    where: { id: result.commissionId },
    select: { partnerId: true },
  });

  if (result.notification && commission) {
    await persistChargebackNotifications(
      commission.partnerId,
      result.commissionId,
      [result.notification],
      session.user.id,
    );
  }

  if (result.action === "chargeback_balance" && commission) {
    await reapplyOffsetsForPartner(commission.partnerId);
  }

  const { ip, userAgent } = getRequestClientMeta(req);
  await prisma.auditLog.create({
    data: {
      action: body.adminReview ? "commission_admin_review" : "commission_refund_chargeback",
      userId: session.user.id,
      metadata: JSON.stringify({
        commissionId: result.commissionId,
        action: result.action,
        refundExternalRef: body.refundExternalRef,
        ip,
        userAgent,
      }),
    },
  });

  return NextResponse.json(result);
}
