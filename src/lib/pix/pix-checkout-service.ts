import { emitPixFundsSettledIfImmediate } from "@/lib/customer-payment-bridge";
import { prisma } from "@/lib/db";
import { assertPixCheckoutEnabled } from "./pix-provider-registry";
import type { PixCheckoutInput } from "@/lib/customer-payment-provider";

export async function createPixCheckout(input: PixCheckoutInput) {
  const ready = assertPixCheckoutEnabled();
  if (!ready.ok) return { ok: false as const, error: ready.error };
  return ready.provider.createCheckout(input);
}

export async function processPixPaymentApproved(
  externalPaymentId: string,
  providerId?: string,
) {
  const ready = assertPixCheckoutEnabled();
  if (!ready.ok) return { ok: false, skipped: ready.error };

  const provider = providerId && providerId !== ready.provider.id
    ? null
    : ready.provider;
  if (!provider) {
    return { ok: false, skipped: "provider_mismatch" };
  }

  const result = await provider.processPaymentApproved(externalPaymentId);

  if (result.ok && result.purchaseId && provider.id === "mercadopago_pix_bridge") {
    const purchase = await prisma.cartPurchase.findUnique({
      where: { id: result.purchaseId },
      select: { stripePaymentId: true },
    });
    if (purchase?.stripePaymentId) {
      await emitPixFundsSettledIfImmediate(
        purchase.stripePaymentId,
        "Mercado Pago PIX payment approved",
      );
    }
  }

  return result;
}
