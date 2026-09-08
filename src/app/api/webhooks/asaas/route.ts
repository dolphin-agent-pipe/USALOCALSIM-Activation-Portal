import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { processPixPaymentApproved } from "@/lib/pix/pix-checkout-service";
import { isAsaasDirectConfigured } from "@/lib/asaas-config";

function verifyAsaasWebhookToken(header: string | null): boolean {
  const secret = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!secret || !header) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(secret));
  } catch {
    return false;
  }
}

type AsaasWebhookPayload = {
  event?: string;
  payment?: { id?: string; status?: string };
};

export async function POST(req: Request) {
  if (!isAsaasDirectConfigured()) {
    return NextResponse.json({ error: "Asaas not configured" }, { status: 404 });
  }

  const rawBody = await req.text();
  const token = req.headers.get("asaas-access-token");
  if (!verifyAsaasWebhookToken(token)) {
    return NextResponse.json({ error: "Invalid webhook token" }, { status: 401 });
  }

  let payload: AsaasWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as AsaasWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paymentId = payload.payment?.id;
  if (!paymentId) {
    return NextResponse.json({ ok: true, skipped: "no_payment_id" });
  }

  const result = await processPixPaymentApproved(paymentId);

  await prisma.auditLog.create({
    data: {
      action: "asaas_webhook",
      metadata: JSON.stringify({ event: payload.event, paymentId, result }),
    },
  });

  return NextResponse.json({ ok: true, result });
}
