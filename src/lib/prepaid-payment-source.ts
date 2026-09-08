/** How Phase 1 prepaid wallet credit was funded (Path B). */
export const PREPAID_PAYMENT_SOURCES = {
  STRIPE: "stripe",
  MERCADOPAGO: "mercadopago",
  PIX_STRIPE: "pix_stripe",
  PIX_ASAAS: "pix_asaas",
  POS: "pos",
} as const;

export type PrepaidPaymentSource = (typeof PREPAID_PAYMENT_SOURCES)[keyof typeof PREPAID_PAYMENT_SOURCES];

export function isPrepaidPaymentSource(v: string): v is PrepaidPaymentSource {
  return (Object.values(PREPAID_PAYMENT_SOURCES) as string[]).includes(v);
}

/** Stored in `CartPurchase.stripePaymentId` for POS rows (still unique). */
export function posStripePaymentId(externalPaymentId: string): string {
  const id = externalPaymentId.trim();
  return id.startsWith("pos:") ? id : `pos:${id}`;
}
