import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { authorizePrepaidAfterPayment } from "@/lib/prepaid-authorize";
import { PREPAID_PAYMENT_SOURCES } from "@/lib/prepaid-payment-source";
import { emitPixFundsSettledIfImmediate } from "@/lib/customer-payment-bridge";
import {
  STRIPE_CART_SESSION_METADATA_KEY,
  STRIPE_PIX_CART_CHECKOUT_FLOW,
  STRIPE_PREPAID_CARD_METADATA_KEY,
} from "@/lib/stripe-cart-flow";
import type { CustomerPixProvider, PixCheckoutInput, PixCheckoutResult } from "@/lib/customer-payment-provider";

export const stripePixProvider: CustomerPixProvider = {
  id: "pix_stripe",

  async createCheckout(input: PixCheckoutInput): Promise<PixCheckoutResult> {
    if (!stripe) {
      return { ok: false, error: "Stripe is not configured." };
    }
    if (input.retailMarket !== "br") {
      return { ok: false, error: "Stripe PIX checkout is only available for Brazil (BRL) cards." };
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["pix"],
      currency: "brl",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: input.payAmountCents,
            product_data: {
              name: input.lineItemTitle ?? "USALOCALSIM prepaid credit",
              description: input.lineItemDescription ?? input.planName,
            },
          },
        },
      ],
      customer_email: input.customerEmail,
      success_url: `${appUrl}/cart/checkout/return?pix=1&provider=stripe`,
      cancel_url: `${appUrl}/cart/plans?pix_failed=1`,
      metadata: {
        flow: STRIPE_PIX_CART_CHECKOUT_FLOW,
        [STRIPE_CART_SESSION_METADATA_KEY]: input.cartSessionId,
        planId: input.planId,
        [STRIPE_PREPAID_CARD_METADATA_KEY]: input.prepaidCardId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
      },
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a checkout URL." };
    }

    return {
      ok: true,
      redirectUrl: session.url,
      providerRef: session.id,
      mode: "redirect",
    };
  },

  async processPaymentApproved(sessionId: string) {
    if (!stripe) return { ok: false, skipped: "stripe_not_configured" };

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return { ok: false, skipped: `status_${session.payment_status}` };
    }

    const paymentIntent = session.payment_intent;
    const paymentId =
      typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? session.id;

    const existing = await prisma.cartPurchase.findFirst({
      where: { externalPaymentRef: paymentId },
    });
    if (existing) return { ok: true, purchaseId: existing.id, skipped: "already_processed" };

    const cartSessionId = session.metadata?.[STRIPE_CART_SESSION_METADATA_KEY]?.trim();
    const planId = session.metadata?.planId?.trim();
    const prepaidCardId = session.metadata?.[STRIPE_PREPAID_CARD_METADATA_KEY]?.trim();
    const customerEmail =
      session.metadata?.customerEmail?.trim() ||
      session.customer_email?.trim() ||
      session.customer_details?.email?.trim();
    const customerName = session.metadata?.customerName?.trim() || "";

    if (!cartSessionId || !planId || !prepaidCardId || !customerEmail) {
      return { ok: false, skipped: "invalid_metadata" };
    }

    const amountCents = session.amount_total ?? 0;
    const auth = await authorizePrepaidAfterPayment({
      prepaidCardId,
      planId,
      amountPaidCents: amountCents,
      paymentSource: PREPAID_PAYMENT_SOURCES.PIX_STRIPE,
      externalPaymentRef: paymentId,
      customerEmail,
      customerName,
      cartSessionId,
    });
    if (!auth.ok) return { ok: false, skipped: auth.error };

    await emitPixFundsSettledIfImmediate(paymentId, "Stripe PIX checkout completed");
    return { ok: true, purchaseId: auth.purchaseId };
  },
};
