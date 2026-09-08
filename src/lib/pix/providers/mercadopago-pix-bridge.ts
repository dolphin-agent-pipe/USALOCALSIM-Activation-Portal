import { createMercadoPagoCartPreference, processMercadoPagoCartPaymentApproved } from "@/lib/mercadopago-cart";
import type { CustomerPixProvider, PixCheckoutInput, PixCheckoutResult } from "@/lib/customer-payment-provider";

/** Legacy Mercado Pago Checkout Pro used as Asaas-bridge until direct Asaas API is configured. */
export const mercadoPagoPixBridgeProvider: CustomerPixProvider = {
  id: "mercadopago_pix_bridge",

  async createCheckout(input: PixCheckoutInput): Promise<PixCheckoutResult> {
    const pref = await createMercadoPagoCartPreference({
      cartSessionId: input.cartSessionId,
      planId: input.planId,
      prepaidCardId: input.prepaidCardId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      payAmountCents: input.payAmountCents,
      retailMarket: input.retailMarket,
      planName: input.planName,
      lineItemTitle: input.lineItemTitle,
      lineItemDescription: input.lineItemDescription,
    });
    if (!pref.ok) return { ok: false, error: pref.error };
    return { ok: true, redirectUrl: pref.initPoint, providerRef: pref.preferenceId, mode: "redirect" };
  },

  async processPaymentApproved(externalPaymentId: string) {
    return processMercadoPagoCartPaymentApproved(externalPaymentId);
  },
};
