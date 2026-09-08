import {
  PIX_PROVIDER,
  getConfiguredPixProvider,
  isPixCheckoutEnabled,
  type PixProviderId,
} from "@/lib/pix-provider";
import type { CustomerPixProvider } from "@/lib/customer-payment-provider";
import { resolveAsaasPixProvider } from "./providers/asaas-pix";
import { stripePixProvider } from "./providers/stripe-pix";

export function getActivePixProvider(): CustomerPixProvider | null {
  const id = getConfiguredPixProvider();
  if (id === PIX_PROVIDER.NONE) return null;

  switch (id) {
    case PIX_PROVIDER.STRIPE:
      return stripePixProvider;
    case PIX_PROVIDER.ASAAS:
      return resolveAsaasPixProvider();
    default:
      return null;
  }
}

export function assertPixCheckoutEnabled(): { ok: true; provider: CustomerPixProvider } | { ok: false; error: string } {
  if (!isPixCheckoutEnabled()) {
    return { ok: false, error: "PIX checkout is not enabled for this deployment." };
  }
  const provider = getActivePixProvider();
  if (!provider) {
    return { ok: false, error: "PIX provider is not configured." };
  }
  return { ok: true, provider };
}

export function activePixProviderId(): PixProviderId {
  return getConfiguredPixProvider();
}
