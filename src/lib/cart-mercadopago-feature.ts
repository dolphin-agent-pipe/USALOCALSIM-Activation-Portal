import { isPixCheckoutEnabled, isPixCheckoutUiEnabled } from "./pix-provider";

/**
 * PIX checkout via configured provider (Asaas direct or Mercado Pago bridge).
 * Kept as `isCartMercadoPago*` for backward-compatible imports.
 */
export function isCartMercadoPagoEnabled(): boolean {
  return isPixCheckoutEnabled();
}

export function isCartMercadoPagoUiEnabled(): boolean {
  return isPixCheckoutUiEnabled();
}
