import { getMercadoPagoAccessToken } from "./mercadopago-config";
import { getAsaasApiKey } from "./asaas-config";

export const PIX_PROVIDER = {
  NONE: "none",
  STRIPE: "stripe",
  ASAAS: "asaas",
} as const;

export type PixProviderId = (typeof PIX_PROVIDER)[keyof typeof PIX_PROVIDER];

/** Resolved runtime PIX provider (server). */
export function getConfiguredPixProvider(): PixProviderId {
  const raw = process.env.PIX_PROVIDER?.trim().toLowerCase();
  if (raw === PIX_PROVIDER.STRIPE) return PIX_PROVIDER.STRIPE;
  if (raw === PIX_PROVIDER.ASAAS) return PIX_PROVIDER.ASAAS;
  if (raw === PIX_PROVIDER.NONE) return PIX_PROVIDER.NONE;

  // Legacy deployments: Mercado Pago token implies Asaas-bridge PIX until client switches.
  if (getMercadoPagoAccessToken()) return PIX_PROVIDER.ASAAS;
  return PIX_PROVIDER.NONE;
}

export function isPixProviderConfigured(provider: PixProviderId): boolean {
  if (provider === PIX_PROVIDER.NONE) return false;
  if (provider === PIX_PROVIDER.STRIPE) {
    return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  }
  if (provider === PIX_PROVIDER.ASAAS) {
    return Boolean(getAsaasApiKey() || getMercadoPagoAccessToken());
  }
  return false;
}

export function isPixCheckoutEnabled(): boolean {
  const provider = getConfiguredPixProvider();
  return provider !== PIX_PROVIDER.NONE && isPixProviderConfigured(provider);
}

/** Client-safe PIX UI flag (`NEXT_PUBLIC_PIX_PROVIDER` overrides legacy MP flag). */
export function isPixCheckoutUiEnabled(): boolean {
  const publicFlag = process.env.NEXT_PUBLIC_PIX_PROVIDER?.trim().toLowerCase();
  if (publicFlag === PIX_PROVIDER.NONE || publicFlag === "false" || publicFlag === "0") {
    return false;
  }
  if (publicFlag === PIX_PROVIDER.STRIPE || publicFlag === PIX_PROVIDER.ASAAS) {
    return true;
  }
  return Boolean(process.env.NEXT_PUBLIC_CART_MERCADOPAGO_ENABLED?.trim());
}

/** PIX sales can promote to ELIGIBLE immediately after provider confirmation. */
export function isPixImmediateSettlement(): boolean {
  return process.env.COMMISSION_PIX_IMMEDIATE_SETTLE !== "false";
}

export function commissionProviderForPixProvider(provider: PixProviderId): string {
  return provider === PIX_PROVIDER.STRIPE ? "pix_stripe" : "pix_asaas";
}
