export type PixCheckoutInput = {
  cartSessionId: string;
  planId: string;
  prepaidCardId: string;
  customerName: string;
  customerEmail: string;
  /** Charge amount in smallest currency unit (USD cents or BRL centavos depending on provider). */
  payAmountCents: number;
  retailMarket: string;
  planName: string;
  lineItemTitle?: string;
  lineItemDescription?: string;
};

export type PixCheckoutResult =
  | { ok: true; redirectUrl: string; providerRef?: string; mode: "redirect" | "pix_qr" }
  | { ok: false; error: string };

export type PixPaymentApprovedResult = {
  ok: boolean;
  purchaseId?: string;
  skipped?: string;
};

export interface CustomerPixProvider {
  id: string;
  createCheckout(input: PixCheckoutInput): Promise<PixCheckoutResult>;
  processPaymentApproved(externalPaymentId: string): Promise<PixPaymentApprovedResult>;
}
