import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestClientMeta } from "@/lib/request-meta";
import {
  fetchMercadoPagoPayment,
  getMercadoPagoAccessToken,
  processMercadoPagoPaymentApproved,
} from "@/lib/mercadopago-cart";
import { isPixCheckoutEnabled } from "@/lib/pix-provider";
import { processPixPaymentApproved } from "@/lib/pix/pix-checkout-service";

function extractPaymentId(req: Request, body: unknown): string | null {
  const url = new URL(req.url);
  const qId = url.searchParams.get("id") ?? url.searchParams.get("data.id");
  if (qId && /^\d+$/.test(qId)) return qId;

  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const data = b.data as Record<string, unknown> | undefined;
    const fromData = data?.id;
    if (fromData != null && /^\d+$/.test(String(fromData))) return String(fromData);
    if (b.id != null && /^\d+$/.test(String(b.id))) return String(b.id);
  }
  return null;
}

export async function POST(req: Request) {
  if (!getMercadoPagoAccessToken()) {
    return NextResponse.json({ error: "Mercado Pago not configured" }, { status: 503 });
  }

  let body: unknown = null;
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = null;
  }

  const paymentId = extractPaymentId(req, body);
  if (!paymentId) {
    return NextResponse.json({ received: true });
  }

  const result = isPixCheckoutEnabled()
    ? await processPixPaymentApproved(paymentId)
    : await processMercadoPagoPaymentApproved(paymentId);
  const { ip, userAgent } = getRequestClientMeta(req);
  await prisma.auditLog.create({
    data: {
      action: "mercadopago_webhook",
      metadata: JSON.stringify({
        paymentId,
        ok: result.ok,
        purchaseId: result.purchaseId ?? null,
        skipped: result.skipped ?? null,
        ip,
        userAgent,
      }),
    },
  });

  return NextResponse.json({ received: true });
}

/** MP may probe with GET for notification_url validation. */
export async function GET(req: Request) {
  const paymentId = extractPaymentId(req, null);
  if (paymentId) {
    await processMercadoPagoPaymentApproved(paymentId);
  }
  return NextResponse.json({ ok: true });
}
