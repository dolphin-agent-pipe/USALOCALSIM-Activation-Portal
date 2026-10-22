import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, recordFailedAttempt, getRateLimitKey } from "@/lib/rate-limit";
import { getRequestClientMeta } from "@/lib/request-meta";
import { getVerifiedCartSessionByRequest } from "@/lib/cart-session";
import { messageIfPinLooksLikePrepaidSerial } from "@/lib/prepaid-cart";
import { ACTIVATION_SCENARIO_CART_VOUCHER } from "@/lib/stripe-cart-flow";
import {
  isRedeemPhoneVerified,
  loadRedeemAuthorizedPurchase,
  redeemPhoneNotVerifiedMessage,
} from "@/lib/redeem-purchase-auth";
import { ensureRedemptionAccessToken, redeemUrlWithAccess } from "@/lib/redemption-access";
import { redeemPathForVoucher } from "@/lib/exclusive-voucher-redeem";
import { maybeQueueCoreTopupAfterActivation } from "@/lib/core/fulfillment";

const bodySchema = z.object({
  purchaseId: z.string().min(1),
  voucherCode: z.string().min(1),
  activationDate: z.string().min(1),
  /** From payment email — same row as `redemptionAccessToken`; no cart session cookie required. */
  accessToken: z.string().optional(),
});

export async function POST(req: Request) {
  const key = getRateLimitKey(req);
  const { allowed } = await checkRateLimit(key);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    await recordFailedAttempt(key);
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const access = body.accessToken?.trim();
  const cartSession = access ? null : await getVerifiedCartSessionByRequest(req);
  if (!access && !cartSession) {
    return NextResponse.json({ error: "Session expired. Open the link from your payment email or start again from the cart." }, { status: 401 });
  }

  const serviceStart = new Date(body.activationDate);
  if (Number.isNaN(serviceStart.getTime())) {
    await recordFailedAttempt(key);
    return NextResponse.json({ error: "Invalid activation date." }, { status: 400 });
  }

  const purchase = await loadRedeemAuthorizedPurchase(req, body.purchaseId, access, cartSession?.id ?? null);

  if (!purchase || purchase.status !== "authorized") {
    await recordFailedAttempt(key);
    return NextResponse.json({ error: "This purchase is not available for redemption." }, { status: 400 });
  }

  if (!isRedeemPhoneVerified(purchase)) {
    const accessForUrl = access || (await ensureRedemptionAccessToken(purchase)).accessToken;
    const voucherRow = purchase.prepaidCard?.voucher ?? purchase.voucher;
    const base = voucherRow ? redeemPathForVoucher(voucherRow) : "/redeem";
    return NextResponse.json(
      {
        error: redeemPhoneNotVerifiedMessage(),
        code: "REDEEM_PHONE_REQUIRED",
        redeemUrl: redeemUrlWithAccess(base, purchase.id, accessForUrl),
      },
      { status: 403 },
    );
  }

  const codeUpper = body.voucherCode.trim().toUpperCase();

  if (purchase.prepaidCard && purchase.prepaidCard.voucher.code.toUpperCase() !== codeUpper) {
    await recordFailedAttempt(key);
    return NextResponse.json({ error: "That PIN does not match this card." }, { status: 400 });
  }

  const voucher = await prisma.voucher.findUnique({
    where: { code: codeUpper },
    include: { plan: true },
  });

  if (!voucher) {
    await recordFailedAttempt(key);
    const serialHint = await messageIfPinLooksLikePrepaidSerial(body.voucherCode);
    return NextResponse.json(
      { error: serialHint ?? "Invalid PIN or voucher code." },
      { status: 400 },
    );
  }

  // Physical cart flow: PIN is neutral at import — plan comes from CartPurchase after payment.
  if (voucher.type !== "top_up" || voucher.plan.planType !== "physical_sim") {
    await recordFailedAttempt(key);
    return NextResponse.json(
      { error: "This code is not valid for physical card activation after cart checkout." },
      { status: 400 },
    );
  }

  // Cart-only: allow scratch inventory as inactive (never dealer-unlocked) or activated (legacy).
  if (voucher.status === "redeemed") {
    await recordFailedAttempt(key);
    return NextResponse.json({ error: "This voucher has already been used." }, { status: 400 });
  }
  if (!["inactive", "eligible", "activated"].includes(voucher.status)) {
    await recordFailedAttempt(key);
    return NextResponse.json({ error: "This voucher cannot be used in the cart flow." }, { status: 400 });
  }

  const phonePart = purchase.redemptionPhoneE164 ?? cartSession?.phoneE164 ?? "direct-link";
  const redeemedBy = `${purchase.customerEmail} · cart · ${phonePart}`;

  const servicePhoneE164 = purchase.redemptionPhoneE164 ?? voucher.customerPhone ?? null;

  let activationId: string;
  try {
    const activation = await prisma.$transaction(async (tx) => {
      const claimed = await tx.voucher.updateMany({
        where: { id: voucher.id, status: { in: ["inactive", "eligible", "activated"] } },
        data: {
          status: "redeemed",
          redeemedAt: new Date(),
          redeemedBy,
          // Align voucher row with the plan paid for on checkout (neutral inventory → sold plan).
          planId: purchase.planId,
          customerPhone: servicePhoneE164 ?? undefined,
        },
      });
      if (claimed.count === 0) {
        const err = new Error("VOUCHER_CLAIM_FAILED");
        err.name = "VOUCHER_CLAIM_FAILED";
        throw err;
      }

      await tx.cartPurchase.update({
        where: { id: purchase.id },
        data: {
          status: "redeemed",
          voucherId: voucher.id,
          serviceStartDate: serviceStart,
          redeemedAt: new Date(),
        },
      });

      return tx.activationRequest.create({
        data: {
          email: purchase.customerEmail,
          scenario: ACTIVATION_SCENARIO_CART_VOUCHER,
          planId: purchase.planId,
          voucherCode: codeUpper,
          voucherId: voucher.id,
          amountPaidCents: purchase.amountPaidCents,
          travelDate: serviceStart,
          status: "scheduled",
          hasPartnerSim: false,
          hardwareDeductionCents: 0,
          shippingDeductionCents: 0,
          customerPhoneE164: servicePhoneE164,
        },
        select: { id: true },
      });
    });
    activationId = activation.id;
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "VOUCHER_CLAIM_FAILED") {
      await recordFailedAttempt(key);
      return NextResponse.json({ error: "This voucher could not be applied. Try again or contact support." }, { status: 409 });
    }
    throw e;
  }

  const { ip, userAgent } = getRequestClientMeta(req);
  await prisma.auditLog.create({
    data: {
      action: "cart_voucher_redeemed",
      metadata: JSON.stringify({
        purchaseId: purchase.id,
        planId: purchase.planId,
        voucherId: voucher.id,
        ip,
        userAgent,
      }),
    },
  });

  const paidPlan = await prisma.plan.findUnique({
    where: { id: purchase.planId },
    include: { network: { select: { slug: true } } },
  });
  await maybeQueueCoreTopupAfterActivation({
    cartPurchaseId: purchase.id,
    voucherId: voucher.id,
    activationRequestId: activationId,
    mobile: servicePhoneE164,
    networkSlug: purchase.redemptionNetworkSlug ?? paidPlan?.network?.slug ?? null,
    planSku: paidPlan?.sku ?? voucher.plan.sku,
    priceCents: paidPlan?.priceCents ?? voucher.plan.priceCents,
  });

  return NextResponse.json({ ok: true });
}
