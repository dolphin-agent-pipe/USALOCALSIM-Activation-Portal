import type { CartPurchase, Plan, PrepaidCard, Voucher } from "@prisma/client";
import { isCreditCheckout } from "@/lib/cart-checkout-variant";
import type { CoverageTier } from "@/lib/coverage-tier";
import { isCoverageTier } from "@/lib/coverage-tier";
import {
  resolveCreditCheckoutProfile,
  type CreditCheckoutProfileId,
} from "@/lib/credit-checkout-profile";
import { creditsFromFaceValueCents } from "@/lib/linkup-exclusive-prepaid";
import {
  displayTransactionId,
  formatInvoiceDate,
  invoiceUrl,
  isSyntheticPosEmail,
  marketCurrencySymbol,
} from "@/lib/invoice";
import { PREPAID_PAYMENT_SOURCES } from "@/lib/prepaid-payment-source";
import {
  receiptProductLabel,
  receiptValueReference,
  receiptVoucherUsage,
} from "@/lib/voucher-receipt-copy";

const NA = "NA";

export type VoucherReceiptData = {
  distributor: string;
  invoiceId: string;
  date: string;
  status: "PAID" | "PENDING";
  billTo: string;
  product: string;
  credits: number;
  valueReference: string;
  voucherUsage: string;
  serialReference: string;
  paymentMethod: string;
  totalCharged: string;
  supportEmail: string;
  redeemHref: string;
};

export type PurchaseForVoucherReceipt = CartPurchase & {
  plan: Plan;
  prepaidCard:
    | (Pick<PrepaidCard, "faceValueCents" | "serial" | "barcodePayload" | "retailMarket"> & {
        voucher: Pick<Voucher, "voucherProductType" | "code"> | null;
        basePlan?: Pick<Plan, "sku" | "coverageTier"> | null;
      })
    | null;
  voucher: Pick<Voucher, "voucherProductType" | "code"> | null;
};

export type CreditCheckoutPurchaseInput = {
  voucher: { voucherProductType: string; code: string };
  faceValueCents: number;
  basePlanSku: string | null | undefined;
  basePlanCoverageTier?: string | null | undefined;
};

function distributorName(): string {
  return process.env.INVOICE_DISTRIBUTOR_NAME?.trim() || "USALOCALSIM";
}

function receiptSupportEmail(): string {
  return (
    process.env.INVOICE_SUPPORT_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "usasimadmin@usalocalsim.com"
  );
}

function receiptPaymentMethod(source: string): string {
  if (source === PREPAID_PAYMENT_SOURCES.STRIPE) return "Card via Stripe";
  if (source === PREPAID_PAYMENT_SOURCES.MERCADOPAGO) return "PIX (Mercado Pago)";
  if (source === PREPAID_PAYMENT_SOURCES.PIX_ASAAS) return "PIX via Asaas";
  if (source === PREPAID_PAYMENT_SOURCES.PIX_STRIPE) return "PIX via Stripe";
  if (source === PREPAID_PAYMENT_SOURCES.POS) return "Retail POS";
  return source.toUpperCase() || NA;
}

function formatChargedTotal(cents: number, market: string): string {
  const symbol = marketCurrencySymbol(market);
  if (symbol === "R$") {
    return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
  }
  return `$${(cents / 100).toFixed(2)} USD`;
}

export function creditCheckoutInputFromPurchase(
  purchase: PurchaseForVoucherReceipt,
): CreditCheckoutPurchaseInput | null {
  const prepaid = purchase.prepaidCard;
  const voucher = prepaid?.voucher ?? purchase.voucher;
  if (!prepaid || !voucher) return null;

  return {
    voucher,
    faceValueCents: prepaid.faceValueCents,
    basePlanSku: prepaid.basePlan?.sku ?? purchase.plan.sku,
    basePlanCoverageTier: prepaid.basePlan?.coverageTier ?? purchase.plan.coverageTier,
  };
}

export function isCreditCheckoutPurchase(purchase: PurchaseForVoucherReceipt): boolean {
  const input = creditCheckoutInputFromPurchase(purchase);
  return input != null && isCreditCheckout(input);
}

export function creditCheckoutProfileIdForPurchase(
  purchase: PurchaseForVoucherReceipt,
): CreditCheckoutProfileId | null {
  const input = creditCheckoutInputFromPurchase(purchase);
  if (!input) return null;
  return resolveCreditCheckoutProfile(input)?.id ?? null;
}

export function receiptUrl(purchaseId: string, accessToken?: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || "http://localhost:3000";
  const path = `/receipt/${encodeURIComponent(purchaseId)}`;
  if (!accessToken?.trim()) return `${base}${path}`;
  return `${base}${path}?access=${encodeURIComponent(accessToken.trim())}`;
}

export function cartPurchasePaidEmailDocumentUrls(
  purchaseId: string,
  accessToken: string,
  creditCheckout: boolean,
): { receiptUrl?: string; invoiceUrl?: string } {
  if (creditCheckout) {
    return { receiptUrl: receiptUrl(purchaseId, accessToken) };
  }
  return { invoiceUrl: invoiceUrl(purchaseId, accessToken) };
}

export function buildVoucherReceiptData(
  purchase: PurchaseForVoucherReceipt,
  redeemHref: string,
): VoucherReceiptData {
  const market = purchase.prepaidCard?.retailMarket ?? purchase.plan.market;
  const faceValueCents = purchase.prepaidCard?.faceValueCents ?? purchase.amountPaidCents;
  const credits = creditsFromFaceValueCents(faceValueCents);
  const creditInput = creditCheckoutInputFromPurchase(purchase);
  const profile = creditInput ? resolveCreditCheckoutProfile(creditInput) : null;
  const profileId = profile?.id ?? null;
  const planTier = purchase.plan.coverageTier;
  const coverageTier: CoverageTier | undefined =
    profile?.coverageTier ?? (planTier && isCoverageTier(planTier) ? planTier : undefined);

  const serial =
    purchase.prepaidCard?.serial?.trim() ||
    purchase.prepaidCard?.barcodePayload?.trim() ||
    NA;

  const chargedMarket = purchase.paymentSource === PREPAID_PAYMENT_SOURCES.MERCADOPAGO ? "br" : market;
  const totalCharged = formatChargedTotal(purchase.amountPaidCents, chargedMarket);

  const email = purchase.customerEmail?.trim() ?? "";
  const billTo =
    email && !isSyntheticPosEmail(email)
      ? purchase.customerName?.trim() || "Guest Customer"
      : "Guest Customer / Authorized Reseller";

  return {
    distributor: distributorName(),
    invoiceId: `#US-${displayTransactionId(purchase)}`,
    date: formatInvoiceDate(purchase.createdAt, market),
    status: purchase.status === "authorized" || purchase.status === "redeemed" ? "PAID" : "PENDING",
    billTo,
    product: receiptProductLabel(profileId),
    credits,
    valueReference: receiptValueReference(profileId, faceValueCents, credits),
    voucherUsage: receiptVoucherUsage(profileId, purchase.plan, coverageTier),
    serialReference: serial,
    paymentMethod: receiptPaymentMethod(purchase.paymentSource),
    totalCharged,
    supportEmail: receiptSupportEmail(),
    redeemHref,
  };
}
