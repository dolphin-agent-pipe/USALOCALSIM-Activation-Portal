import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { newCartSessionExpiry } from "./cart-session";
import { generateOpaqueResumeToken, newResumeTokenExpiresAt } from "./cart-resume";
import {
  PREPAID_PAYMENT_SOURCES,
  type PrepaidPaymentSource,
  posStripePaymentId,
} from "./prepaid-payment-source";
import { VOUCHER_STATUS } from "./voucher-status";
import { ensurePrepaidVoucherEligible } from "./voucher-retail-activation";
import { recordCommissionForVoucherSale } from "./commission-engine";
import { mapPrepaidSourceToCommissionProvider } from "./commission-settlement";

export type AuthorizePrepaidInput = {
  prepaidCardId: string;
  planId: string;
  amountPaidCents: number;
  paymentSource: PrepaidPaymentSource;
  /** Unique payment id (Stripe PI, MP id, POS txn). Used for idempotency. */
  externalPaymentRef: string;
  customerEmail: string;
  customerName?: string | null;
  customerPhone?: string | null;
  /** D2C: browser cart session. POS: omit — a dedicated session is created. */
  cartSessionId?: string | null;
};

export type AuthorizePrepaidResult =
  | {
      ok: true;
      created: boolean;
      purchaseId: string;
      redemptionAccessToken: string;
      resumeToken: string;
    }
  | { ok: false; error: string; code?: "ALREADY_PAID" | "INVALID_CARD" };

type Db = Prisma.TransactionClient;

function paymentIdForSource(source: PrepaidPaymentSource, externalPaymentRef: string): string {
  const ref = externalPaymentRef.trim();
  if (source === PREPAID_PAYMENT_SOURCES.POS) {
    return posStripePaymentId(ref);
  }
  if (source === PREPAID_PAYMENT_SOURCES.MERCADOPAGO) {
    return ref.startsWith("mp:") ? ref : `mp:${ref}`;
  }
  return ref;
}

async function ensureCartSessionId(tx: Db, cartSessionId: string | null | undefined): Promise<string> {
  if (cartSessionId?.trim()) {
    const existing = await tx.cartSession.findFirst({
      where: { id: cartSessionId.trim(), expiresAt: { gt: new Date() } },
    });
    if (existing) return existing.id;
  }
  const row = await tx.cartSession.create({
    data: {
      phoneE164: null,
      verifiedAt: null,
      expiresAt: newCartSessionExpiry(),
    },
  });
  return row.id;
}

function saleCurrencyForPrepaid(retailMarket: string, source: PrepaidPaymentSource): string {
  if (source === PREPAID_PAYMENT_SOURCES.MERCADOPAGO) return "BRL";
  return retailMarket === "br" ? "BRL" : "USD";
}

async function authorizeInTransaction(
  tx: Db,
  input: AuthorizePrepaidInput,
): Promise<AuthorizePrepaidResult> {
  const externalRef = input.externalPaymentRef.trim();
  if (!externalRef) {
    return { ok: false, error: "Missing payment reference." };
  }

  const existingByRef = await tx.cartPurchase.findFirst({
    where: { externalPaymentRef: externalRef },
    select: {
      id: true,
      prepaidCardId: true,
      redemptionAccessToken: true,
      resumeToken: { select: { token: true } },
    },
  });
  if (existingByRef) {
    if (existingByRef.prepaidCardId !== input.prepaidCardId) {
      return { ok: false, error: "Payment reference already used for another card." };
    }
    const access = existingByRef.redemptionAccessToken?.trim();
    const resume = existingByRef.resumeToken?.token;
    if (!access || !resume) {
      return { ok: false, error: "Existing purchase is missing redemption tokens." };
    }
    return {
      ok: true,
      created: false,
      purchaseId: existingByRef.id,
      redemptionAccessToken: access,
      resumeToken: resume,
    };
  }

  const prepaid = await tx.prepaidCard.findUnique({
    where: { id: input.prepaidCardId },
    include: { voucher: true },
  });
  if (!prepaid?.voucher) {
    return { ok: false, error: "Card not found.", code: "INVALID_CARD" };
  }
  if (prepaid.voucher.status === "redeemed") {
    return { ok: false, error: "This card has already been redeemed.", code: "ALREADY_PAID" };
  }

  const existingByCard = await tx.cartPurchase.findFirst({
    where: { prepaidCardId: prepaid.id, status: "authorized" },
    include: { resumeToken: { select: { token: true } } },
  });
  if (existingByCard) {
    await ensurePrepaidVoucherEligible(prepaid.voucher.id, tx);
    const access = existingByCard.redemptionAccessToken?.trim();
    const resume = existingByCard.resumeToken?.token;
    if (!access || !resume) {
      return { ok: false, error: "Card already has a purchase without redemption link.", code: "ALREADY_PAID" };
    }
    return {
      ok: true,
      created: false,
      purchaseId: existingByCard.id,
      redemptionAccessToken: access,
      resumeToken: resume,
    };
  }

  if (prepaid.voucher.paymentStatus) {
    await ensurePrepaidVoucherEligible(prepaid.voucher.id, tx);
    return {
      ok: false,
      error: "This card is already paid. Continue to redemption.",
      code: "ALREADY_PAID",
    };
  }

  const paidCents = input.amountPaidCents;
  if (!Number.isFinite(paidCents) || paidCents <= 0) {
    return { ok: false, error: "Invalid payment amount." };
  }

  const sessionId = await ensureCartSessionId(tx, input.cartSessionId);
  const stripePaymentId = paymentIdForSource(input.paymentSource, externalRef);
  const resumeToken = generateOpaqueResumeToken();
  const redemptionAccessToken = generateOpaqueResumeToken();
  const redemptionAccessExpiresAt = newResumeTokenExpiresAt();
  const email = input.customerEmail.trim();
  const declared = prepaid.voucher.declaredPayCents;

  const purchase = await tx.cartPurchase.create({
    data: {
      cartSessionId: sessionId,
      planId: input.planId,
      stripePaymentId,
      paymentSource: input.paymentSource,
      externalPaymentRef: externalRef,
      amountPaidCents: paidCents,
      customerName: input.customerName?.trim() || null,
      customerEmail: email,
      status: "authorized",
      prepaidCardId: prepaid.id,
      voucherId: prepaid.voucherId,
      redemptionAccessToken,
      redemptionAccessExpiresAt,
    },
  });

  await tx.cartPurchaseResumeToken.create({
    data: {
      token: resumeToken,
      cartPurchaseId: purchase.id,
      phoneE164: input.customerPhone?.trim() || null,
      expiresAt: newResumeTokenExpiresAt(),
    },
  });

  const creditCents =
    prepaid.faceValueCents > 0 && input.paymentSource === PREPAID_PAYMENT_SOURCES.POS
      ? prepaid.faceValueCents
      : paidCents > 0
        ? paidCents
        : prepaid.voucher.creditAmountCents;

  if (declared != null && declared !== paidCents) {
    await tx.auditLog.create({
      data: {
        action: "prepaid_declared_pay_vs_settled",
        metadata: JSON.stringify({
          voucherId: prepaid.voucher.id,
          declared,
          paidCents,
          paymentSource: input.paymentSource,
          externalPaymentRef: externalRef,
        }),
      },
    });
  }

  await tx.voucher.update({
    where: { id: prepaid.voucher.id },
    data: {
      status: VOUCHER_STATUS.ELIGIBLE,
      paymentStatus: true,
      isVerified: false,
      customerEmail: email,
      customerName: input.customerName?.trim() || prepaid.voucher.customerName,
      customerPhone: input.customerPhone?.trim() || prepaid.voucher.customerPhone,
      declaredPayCents: paidCents,
      creditAmountCents: creditCents > 0 ? creditCents : prepaid.voucher.creditAmountCents,
    },
  });

  await recordCommissionForVoucherSale(tx, {
    saleTransactionId: stripePaymentId,
    paymentProvider: mapPrepaidSourceToCommissionProvider(input.paymentSource),
    cartPurchaseId: purchase.id,
    voucherId: prepaid.voucher.id,
    saleAmountCents: paidCents,
    saleCurrency: saleCurrencyForPrepaid(prepaid.retailMarket, input.paymentSource),
    customerCountry: prepaid.retailMarket === "br" ? "BR" : undefined,
    soldAt: new Date(),
  });

  return {
    ok: true,
    created: true,
    purchaseId: purchase.id,
    redemptionAccessToken,
    resumeToken,
  };
}

/**
 * After POS or D2C payment: create authorized CartPurchase, resume/access tokens, lock voucher wallet credit.
 */
export async function authorizePrepaidAfterPayment(
  input: AuthorizePrepaidInput,
): Promise<AuthorizePrepaidResult> {
  return prisma.$transaction((tx) => authorizeInTransaction(tx, input));
}
