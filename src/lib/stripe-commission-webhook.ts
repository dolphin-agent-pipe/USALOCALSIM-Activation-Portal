import type Stripe from "stripe";
import { prisma } from "./db";
import {
  handleSaleRefundOrChargeback,
  persistChargebackNotifications,
  reapplyOffsetsForPartner,
} from "./commission-chargeback";

function paymentIntentIdFromChargebackEvent(event: Stripe.Event): {
  paymentIntentId?: string;
  externalRef: string;
} {
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const pi = charge.payment_intent;
    return {
      paymentIntentId: typeof pi === "string" ? pi : pi?.id,
      externalRef: charge.id,
    };
  }
  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const pi = dispute.payment_intent;
    return {
      paymentIntentId: typeof pi === "string" ? pi : pi?.id ?? undefined,
      externalRef: dispute.id,
    };
  }
  return { externalRef: event.id };
}

export async function handleStripeCommissionChargebackEvent(event: Stripe.Event): Promise<void> {
  const { paymentIntentId, externalRef } = paymentIntentIdFromChargebackEvent(event);
  if (!paymentIntentId) return;

  const result = await handleSaleRefundOrChargeback({
    saleTransactionId: paymentIntentId,
    refundExternalRef: externalRef,
  });

  if (!result.ok) return;

  const commission = await prisma.commission.findUnique({
    where: { id: result.commissionId },
    select: { partnerId: true },
  });

  if (result.notification && commission) {
    await persistChargebackNotifications(
      commission.partnerId,
      result.commissionId,
      [result.notification],
      null,
    );
  }

  if (result.action === "chargeback_balance" && commission) {
    await reapplyOffsetsForPartner(commission.partnerId);
  }

  await prisma.auditLog.create({
    data: {
      action: "stripe_commission_chargeback",
      metadata: JSON.stringify({
        eventType: event.type,
        paymentIntentId,
        externalRef,
        commissionId: result.commissionId,
        action: result.action,
      }),
    },
  });
}
