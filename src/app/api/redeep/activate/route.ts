import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getVerifiedCartSessionByRequest } from "@/lib/cart-session";
import { isRedeemPhoneVerified, loadRedeemAuthorizedPurchase, redeemPhoneNotVerifiedMessage } from "@/lib/redeem-purchase-auth";
import { ACTIVATION_SCENARIO_CART_VOUCHER } from "@/lib/stripe-cart-flow";
import { REDEMPTION_FULFILLMENT_TYPES } from "@/lib/redemption-fulfillment";
import { resolveVoucherForRedeem } from "@/lib/redeem-voucher-resolve";
import {
  validateRedeemPlanForSelections,
  validateRedeemWizardSelections,
} from "@/lib/redeem-selection-guards";
import {
  effectiveRedeemFulfillmentType,
  parseRedeemEsimDeviceIds,
  redeemFlowRequiresEsimDeviceIds,
} from "@/lib/redeem-esim-device";
import { maybeQueueCoreTopupAfterActivation } from "@/lib/core/fulfillment";

const bodySchema = z.object({
  purchaseId: z.string().min(1),
  voucherCode: z.string().optional(),
  activationDate: z.string().min(1),
  accessToken: z.string().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const access = body.accessToken?.trim();
  const cartSession = access ? null : await getVerifiedCartSessionByRequest(req);
  if (!access && !cartSession) {
    return NextResponse.json(
      { error: "Session expired. Open /cart from your card QR or use the access link from your payment email." },
      { status: 401 },
    );
  }

  const serviceStart = new Date(body.activationDate);
  if (Number.isNaN(serviceStart.getTime())) {
    return NextResponse.json({ error: "Invalid activation date." }, { status: 400 });
  }

  const purchase = await loadRedeemAuthorizedPurchase(req, body.purchaseId, access, cartSession?.id ?? null);
  if (!purchase) {
    return NextResponse.json({ error: "Purchase is not available for activation." }, { status: 400 });
  }
  if (!isRedeemPhoneVerified(purchase)) {
    return NextResponse.json({ error: redeemPhoneNotVerifiedMessage() }, { status: 403 });
  }

  const voucherResult = await resolveVoucherForRedeem(purchase, body.voucherCode);
  if (!voucherResult.ok) {
    return NextResponse.json(
      { error: voucherResult.error, code: voucherResult.code },
      { status: voucherResult.status },
    );
  }
  const voucher = voucherResult.voucher;
  const voucherCode = voucher.code.toUpperCase();
  if (voucher.status === "redeemed") {
    return NextResponse.json({ error: "Invalid or already redeemed PIN." }, { status: 400 });
  }

  if (!purchase.planId) {
    return NextResponse.json({ error: "Select a plan before activation." }, { status: 400 });
  }

  const wizardSel = await validateRedeemWizardSelections(purchase, voucher);
  if (!wizardSel.ok) {
    return NextResponse.json(
      { error: wizardSel.error, code: wizardSel.code },
      { status: wizardSel.status },
    );
  }

  const plan = await prisma.plan.findUnique({
    where: { id: purchase.planId },
    include: { network: { select: { slug: true } } },
  });
  if (!plan) {
    return NextResponse.json({ error: "Selected plan is no longer available." }, { status: 400 });
  }

  const fulfillmentType = purchase.redemptionFulfillmentType;
  if (!fulfillmentType) {
    return NextResponse.json({ error: "Choose how customer connects before activation." }, { status: 400 });
  }

  const effectiveFulfillment = effectiveRedeemFulfillmentType({
    fulfillmentType,
    planType: plan.planType,
    ultraEsimOnly: wizardSel.ultraEsimOnly,
  });

  const planErr = validateRedeemPlanForSelections({
    plan,
    selections: wizardSel,
    fulfillmentType: effectiveFulfillment,
  });
  if (planErr) {
    return NextResponse.json({ error: planErr.error, code: planErr.code }, { status: planErr.status });
  }
  if (fulfillmentType === REDEMPTION_FULFILLMENT_TYPES.EXISTING_SIM && !purchase.redemptionIccid?.trim()) {
    return NextResponse.json({ error: "ICCID is required for existing physical SIM." }, { status: 400 });
  }
  if (
    fulfillmentType === REDEMPTION_FULFILLMENT_TYPES.NEW_SIM_SHIPPING &&
    !purchase.redemptionShippingAddress?.trim()
  ) {
    return NextResponse.json({ error: "Shipping address is required for physical SIM delivery." }, { status: 400 });
  }

  const needsEsimDevice = redeemFlowRequiresEsimDeviceIds({
    fulfillmentType: effectiveFulfillment,
    planType: plan.planType,
    ultraEsimOnly: wizardSel.ultraEsimOnly,
  });
  const parsedEsimDevice = needsEsimDevice
    ? parseRedeemEsimDeviceIds(purchase.redemptionDeviceImei, purchase.redemptionDeviceEid)
    : null;
  if (parsedEsimDevice && !parsedEsimDevice.ok) {
    return NextResponse.json({ error: parsedEsimDevice.error }, { status: 400 });
  }

  const paidTowardRedemption = purchase.redemptionCreditAppliedCents + purchase.redemptionExtraPaidCents;
  if (purchase.redemptionFinalTotalCents > paidTowardRedemption) {
    return NextResponse.json({ error: "Remaining balance must be paid before activation." }, { status: 400 });
  }

  const servicePhoneE164 = purchase.redemptionPhoneE164 ?? voucher.customerPhone ?? null;

  const activation = await prisma.$transaction(async (tx) => {
    const claimed = await tx.voucher.updateMany({
      where: { id: voucher.id, status: { in: ["inactive", "eligible", "activated"] } },
      data: {
        status: "redeemed",
        redeemedAt: new Date(),
        redeemedBy: `${purchase.customerEmail} · cart-redeem`,
        paymentStatus: true,
        isVerified: true,
        customerName: purchase.customerName ?? voucher.customerName,
        customerEmail: purchase.customerEmail,
        customerPhone: purchase.redemptionPhoneE164 ?? voucher.customerPhone,
        linkedIccid: purchase.redemptionIccid?.trim() || null,
        fulfillmentType: effectiveFulfillment,
      },
    });
    if (claimed.count === 0) throw new Error("VOUCHER_CLAIM_FAILED");

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
        voucherCode: voucherCode,
        voucherId: voucher.id,
        amountPaidCents: purchase.redemptionFinalTotalCents,
        travelDate: serviceStart,
        status: "scheduled",
        iccid: purchase.redemptionIccid?.trim() || null,
        hasPartnerSim: effectiveFulfillment === REDEMPTION_FULFILLMENT_TYPES.EXISTING_SIM,
        hardwareDeductionCents: 0,
        shippingDeductionCents: purchase.redemptionShippingCents,
        customerPhoneE164: servicePhoneE164,
        deviceImei: parsedEsimDevice?.ok ? parsedEsimDevice.imei : null,
        deviceEid: parsedEsimDevice?.ok ? parsedEsimDevice.eid : null,
      },
      select: { id: true },
    });
  });

  const networkSlug =
    purchase.redemptionNetworkSlug?.trim() || plan.network?.slug || null;

  // Core top-up after commit (simulate or live). Errors are swallowed inside helper.
  await maybeQueueCoreTopupAfterActivation({
    cartPurchaseId: purchase.id,
    voucherId: voucher.id,
    activationRequestId: activation.id,
    mobile: servicePhoneE164,
    networkSlug,
    planSku: plan.sku,
    priceCents: plan.priceCents,
  });

  return NextResponse.json({ ok: true });
}
