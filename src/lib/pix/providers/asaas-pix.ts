import { prisma } from "@/lib/db";
import { authorizePrepaidAfterPayment } from "@/lib/prepaid-authorize";
import { PREPAID_PAYMENT_SOURCES } from "@/lib/prepaid-payment-source";
import { getAsaasApiBaseUrl, getAsaasApiKey } from "@/lib/asaas-config";
import { emitPixFundsSettledIfImmediate } from "@/lib/customer-payment-bridge";
import {
  buildMercadoPagoCartMetadata,
  readMercadoPagoCartMetadata,
} from "@/lib/mercadopago-metadata";
import { mercadoPagoPixBridgeProvider } from "@/lib/pix/providers/mercadopago-pix-bridge";
import type { CustomerPixProvider, PixCheckoutInput, PixCheckoutResult } from "@/lib/customer-payment-provider";

type AsaasPayment = {
  id?: string;
  status?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  value?: number;
  externalReference?: string;
};

type AsaasPixQr = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
};

async function asaasRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getAsaasApiKey();
  if (!key) throw new Error("asaas_not_configured");

  const res = await fetch(`${getAsaasApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: key,
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Asaas ${path} failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

const asaasDirectProvider: CustomerPixProvider = {
  id: "pix_asaas",

  async createCheckout(input: PixCheckoutInput): Promise<PixCheckoutResult> {
    const metadata = buildMercadoPagoCartMetadata({
      cartSessionId: input.cartSessionId,
      planId: input.planId,
      prepaidCardId: input.prepaidCardId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      payAmountCents: input.payAmountCents,
    });

    const payment = await asaasRequest<AsaasPayment>("/v3/payments", {
      method: "POST",
      body: JSON.stringify({
        billingType: "PIX",
        customer: input.customerEmail,
        value: input.payAmountCents / 100,
        dueDate: new Date().toISOString().slice(0, 10),
        description: input.lineItemTitle ?? "USALOCALSIM prepaid credit",
        externalReference: JSON.stringify(metadata),
      }),
    });

    if (!payment.id) {
      return { ok: false, error: "Asaas did not return a payment id." };
    }

    const qr = await asaasRequest<AsaasPixQr>(`/v3/payments/${payment.id}/pixQrCode`);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

    if (qr.payload) {
      return {
        ok: true,
        redirectUrl: `${appUrl}/cart/checkout/pix?paymentId=${encodeURIComponent(payment.id)}`,
        providerRef: payment.id,
        mode: "pix_qr",
      };
    }

    const redirect = payment.invoiceUrl ?? payment.bankSlipUrl;
    if (!redirect) {
      return { ok: false, error: "Asaas did not return PIX checkout details." };
    }

    return { ok: true, redirectUrl: redirect, providerRef: payment.id, mode: "redirect" };
  },

  async processPaymentApproved(paymentId: string) {
    const payment = await asaasRequest<AsaasPayment>(`/v3/payments/${encodeURIComponent(paymentId)}`);
    if (!payment.id) return { ok: false, skipped: "payment_not_found" };
    if (payment.status !== "RECEIVED" && payment.status !== "CONFIRMED") {
      return { ok: false, skipped: `status_${payment.status ?? "unknown"}` };
    }

    let meta: ReturnType<typeof readMercadoPagoCartMetadata> = null;
    try {
      const parsed = JSON.parse(String(payment.externalReference ?? "{}")) as Record<string, unknown>;
      meta = readMercadoPagoCartMetadata(parsed);
    } catch {
      meta = null;
    }
    if (!meta) return { ok: false, skipped: "invalid_metadata" };

    const externalRef = `asaas:${payment.id}`;
    const existing = await prisma.cartPurchase.findFirst({ where: { externalPaymentRef: externalRef } });
    if (existing) return { ok: true, purchaseId: existing.id, skipped: "already_processed" };

    const prepaidId = meta.prepaidCardId?.trim();
    if (!prepaidId) return { ok: false, skipped: "missing_prepaid_card" };

    const amountCents = Math.round((payment.value ?? 0) * 100);
    const auth = await authorizePrepaidAfterPayment({
      prepaidCardId: prepaidId,
      planId: meta.planId,
      amountPaidCents: amountCents,
      paymentSource: PREPAID_PAYMENT_SOURCES.PIX_ASAAS,
      externalPaymentRef: externalRef,
      customerEmail: meta.customerEmail,
      customerName: meta.customerName || null,
      cartSessionId: meta.cartSessionId,
    });
    if (!auth.ok) return { ok: false, skipped: auth.error };

    const saleTxn = `asaas:${payment.id}`;
    await emitPixFundsSettledIfImmediate(saleTxn, "Asaas PIX payment confirmed");
    return { ok: true, purchaseId: auth.purchaseId };
  },
};

export function resolveAsaasPixProvider(): CustomerPixProvider {
  if (getAsaasApiKey()) return asaasDirectProvider;
  return mercadoPagoPixBridgeProvider;
}
