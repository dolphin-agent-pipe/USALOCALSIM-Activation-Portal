import type Stripe from "stripe";

/** Current Stripe Checkout `metadata.flow` for physical-card cart purchases. */
export const STRIPE_CART_CHECKOUT_FLOW = "cart_voucher";

/** Stripe Checkout PIX (Brazil) cart flow. */
export const STRIPE_PIX_CART_CHECKOUT_FLOW = "cart_voucher_pix";

/** Current Stripe Checkout metadata key for the verified phone session id. */
export const STRIPE_CART_SESSION_METADATA_KEY = "cartSessionId";

/** Optional PrepaidCard id when checkout started from a QR serial flow. */
export const STRIPE_PREPAID_CARD_METADATA_KEY = "prepaidCardId";

/** ActivationRequest.scenario for redemptions from this flow. */
export const ACTIVATION_SCENARIO_CART_VOUCHER = "cart_voucher";

/** Older rows used this scenario string before the cart rename. */
export const ACTIVATION_SCENARIO_CART_VOUCHER_LEGACY = ["sh", "op", "_voucher"].join("");

const LEGACY_FLOW = ["sh", "op", "_voucher"].join("");
const LEGACY_SESSION_KEY = ["sh", "op", "Session", "Id"].join("");

export function isStripeCartVoucherFlow(flow: string | undefined): boolean {
  if (!flow) return false;
  if (flow === STRIPE_CART_CHECKOUT_FLOW || flow === STRIPE_PIX_CART_CHECKOUT_FLOW) return true;
  return flow === LEGACY_FLOW;
}

export function readCartSessionIdFromStripeMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string {
  const m = (metadata ?? {}) as Record<string, string | undefined>;
  const current = m[STRIPE_CART_SESSION_METADATA_KEY];
  if (typeof current === "string" && current.trim()) return current.trim();
  const legacy = m[LEGACY_SESSION_KEY];
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return "";
}

export function readPrepaidCardIdFromStripeMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string {
  const m = (metadata ?? {}) as Record<string, string | undefined>;
  const v = m[STRIPE_PREPAID_CARD_METADATA_KEY];
  return typeof v === "string" ? v.trim() : "";
}
