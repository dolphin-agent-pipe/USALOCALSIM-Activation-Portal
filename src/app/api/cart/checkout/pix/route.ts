import { NextResponse } from "next/server";
import { z } from "zod";
import { pixCartCheckoutBodySchema, validatePixCartCheckout } from "@/lib/pix-cart-checkout";
import { createPixCheckout } from "@/lib/pix/pix-checkout-service";
import { activePixProviderId } from "@/lib/pix/pix-provider-registry";
import { isPixCheckoutEnabled } from "@/lib/pix-provider";

/** Unified PIX checkout — routes to Stripe PIX or Asaas (direct / Mercado Pago bridge). */
export async function POST(req: Request) {
  if (!isPixCheckoutEnabled()) {
    return NextResponse.json({ error: "PIX checkout is not enabled for this deployment." }, { status: 404 });
  }

  let body: z.infer<typeof pixCartCheckoutBodySchema>;
  try {
    body = pixCartCheckoutBodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request: planId, name, email, and payAmountCents required." },
      { status: 400 },
    );
  }

  const validated = await validatePixCartCheckout(req, body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error, code: validated.code },
      { status: validated.status },
    );
  }

  const checkout = await createPixCheckout({
    cartSessionId: validated.cartSessionId,
    planId: validated.plan.id,
    prepaidCardId: validated.prepaid.id,
    customerName: validated.body.customerName.trim(),
    customerEmail: validated.body.email.trim(),
    payAmountCents: validated.body.payAmountCents,
    retailMarket: validated.prepaid.retailMarket,
    planName: validated.plan.name,
    lineItemTitle: validated.lineItem.name,
    lineItemDescription: validated.lineItem.description,
  });

  if (!checkout.ok) {
    return NextResponse.json({ error: checkout.error }, { status: 503 });
  }

  return NextResponse.json({
    url: checkout.redirectUrl,
    mode: checkout.mode,
    provider: activePixProviderId(),
    providerRef: checkout.providerRef,
  });
}
