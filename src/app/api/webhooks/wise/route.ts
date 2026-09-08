import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncPayoutAttemptFromWise } from "@/lib/partner-daily-payout";
import { createHmac, timingSafeEqual } from "crypto";

function verifyWiseWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WISE_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-signature") ??
    req.headers.get("x-transferwise-signature") ??
    req.headers.get("x-wise-signature");

  if (!verifyWiseWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { data?: { resource?: { id?: number; type?: string } } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transferId = payload.data?.resource?.id;
  if (!transferId) {
    return NextResponse.json({ ok: true, skipped: "no_transfer_id" });
  }

  const attempt = await prisma.payoutAttempt.findFirst({
    where: { wiseTransferId: String(transferId) },
    select: { id: true },
  });

  if (!attempt) {
    return NextResponse.json({ ok: true, skipped: "attempt_not_found" });
  }

  const result = await syncPayoutAttemptFromWise(attempt.id);
  return NextResponse.json({ ok: result.ok, status: result.status, error: result.error });
}
