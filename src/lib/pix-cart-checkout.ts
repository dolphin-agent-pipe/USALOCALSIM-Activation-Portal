import { z } from "zod";
import { prisma } from "./db";
import { getVerifiedCartSessionByRequest, newCartSessionExpiry } from "./cart-session";
import { loadPrepaidCardClaimedBySession } from "./prepaid-cart";
import { resolveCreditCheckoutProfile } from "./credit-checkout-profile";
import { cartCheckoutLineItem } from "./cart-checkout-product";

export const pixCartCheckoutBodySchema = z.object({
  planId: z.string().min(1),
  email: z.string().email(),
  customerName: z.string().min(2).max(120),
  payAmountCents: z.number().int().positive(),
});

export type PixCartCheckoutBody = z.infer<typeof pixCartCheckoutBodySchema>;

export type ValidatedPixCartCheckout =
  | {
      ok: true;
      cartSessionId: string;
      plan: {
        id: string;
        name: string;
        market: string;
        sku: string | null;
        coverageTier: string | null;
        planType: string;
      };
      prepaid: {
        id: string;
        voucherId: string;
        retailMarket: string;
        faceValueCents: number;
        basePlanId: string;
        voucher: { voucherProductType: string; code: string };
        basePlan: { sku: string | null; coverageTier: string | null } | null;
      };
      body: PixCartCheckoutBody;
      lineItem: { name: string; description: string };
    }
  | { ok: false; status: number; error: string; code?: string };

export async function validatePixCartCheckout(
  req: Request,
  body: PixCartCheckoutBody,
): Promise<ValidatedPixCartCheckout> {
  const cartSession = await getVerifiedCartSessionByRequest(req);
  if (!cartSession) {
    return {
      ok: false,
      status: 401,
      error: "Session expired. Open the QR link from your card again to continue.",
    };
  }

  const plan = await prisma.plan.findFirst({
    where: { id: body.planId, planType: "physical_sim" },
    select: {
      id: true,
      name: true,
      market: true,
      sku: true,
      coverageTier: true,
      planType: true,
    },
  });
  if (!plan) {
    return { ok: false, status: 404, error: "Plan not found." };
  }

  const prepaid = await loadPrepaidCardClaimedBySession(cartSession.id);
  if (!prepaid) {
    return {
      ok: false,
      status: 400,
      error:
        "Physical card checkout requires the QR link from your card. Open that link so your card serial is linked, then try again.",
    };
  }
  if (prepaid.voucher.paymentStatus) {
    return {
      ok: false,
      status: 409,
      error: "This card is already paid. Continue to Redeem with your scratch PIN.",
      code: "ALREADY_PAID",
    };
  }

  const planAllowed =
    plan.id === prepaid.basePlanId ||
    (plan.planType === "physical_sim" && plan.market === prepaid.retailMarket);
  if (!planAllowed) {
    return { ok: false, status: 400, error: "Selected plan does not match this card's market." };
  }

  const creditProfile = resolveCreditCheckoutProfile({
    voucher: prepaid.voucher,
    faceValueCents: prepaid.faceValueCents,
    basePlanSku: prepaid.basePlan?.sku ?? plan.sku,
    basePlanCoverageTier: prepaid.basePlan?.coverageTier ?? plan.coverageTier,
  });

  if (creditProfile) {
    const bundle = creditProfile.validateEntryBundle({
      faceValueCents: prepaid.faceValueCents,
      basePlanSku: prepaid.basePlan?.sku ?? plan.sku,
      basePlanCoverageTier: prepaid.basePlan?.coverageTier ?? plan.coverageTier,
    });
    if (!bundle.ok) {
      return {
        ok: false,
        status: 400,
        error: "This card is not configured for the entry bundle.",
        code: bundle.code,
      };
    }
    if (plan.id !== prepaid.basePlanId) {
      return {
        ok: false,
        status: 400,
        error: "Entry cards must use the bundled base plan at checkout.",
      };
    }
  }

  if (prepaid.faceValueCents > 0 && body.payAmountCents !== prepaid.faceValueCents) {
    return {
      ok: false,
      status: 400,
      error: `This card must be loaded with exactly $${(prepaid.faceValueCents / 100).toFixed(2)}.`,
    };
  }

  await prisma.voucher.update({
    where: { id: prepaid.voucherId },
    data: {
      declaredPayCents: body.payAmountCents,
      customerName: body.customerName.trim(),
      customerEmail: body.email.trim(),
    },
  });

  await prisma.cartSession.update({
    where: { id: cartSession.id },
    data: { expiresAt: newCartSessionExpiry() },
  });

  const lineItem = cartCheckoutLineItem({
    voucher: prepaid.voucher,
    payAmountCents: body.payAmountCents,
    faceValueCents: prepaid.faceValueCents,
    basePlanSku: prepaid.basePlan?.sku ?? plan.sku,
    basePlanCoverageTier: prepaid.basePlan?.coverageTier ?? plan.coverageTier,
  });

  return {
    ok: true,
    cartSessionId: cartSession.id,
    plan,
    prepaid: {
      id: prepaid.id,
      voucherId: prepaid.voucherId,
      retailMarket: prepaid.retailMarket,
      faceValueCents: prepaid.faceValueCents,
      basePlanId: prepaid.basePlanId,
      voucher: prepaid.voucher,
      basePlan: prepaid.basePlan,
    },
    body,
    lineItem,
  };
}
