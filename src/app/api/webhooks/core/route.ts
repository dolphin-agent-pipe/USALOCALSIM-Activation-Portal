import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { applyCoreCallback } from "@/lib/core/topup";

/**
 * Core C-TOP callback (PDF § Callback URL).
 * Method: GET with query: transaction_id, status, ref_txn_id
 *
 * Configure this URL in the Core API panel, e.g.
 *   https://<app>/api/webhooks/core?token=<CORE_CALLBACK_SECRET>
 */
function safeEqualToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function authorizeCallback(req: Request): boolean {
  const secret = process.env.CORE_CALLBACK_SECRET?.trim();
  if (!secret) {
    // Open callback only outside production (local UAT wiring before secret is set).
    return process.env.NODE_ENV !== "production";
  }
  const url = new URL(req.url);
  const token =
    url.searchParams.get("token") ??
    req.headers.get("x-core-callback-token") ??
    "";
  return safeEqualToken(token, secret);
}

async function handleCallback(req: Request) {
  if (!authorizeCallback(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const transactionId = url.searchParams.get("transaction_id");
  const status = url.searchParams.get("status");
  const refTxnId = url.searchParams.get("ref_txn_id");

  if (!transactionId && !refTxnId) {
    return NextResponse.json({ error: "Missing transaction_id or ref_txn_id" }, { status: 400 });
  }

  const result = await applyCoreCallback({
    transactionId,
    status,
    refTxnId,
  });

  return NextResponse.json({
    ok: result.ok,
    jobId: result.jobId,
    status: result.status,
    skipped: result.skipped,
  });
}

export async function GET(req: Request) {
  return handleCallback(req);
}

/** Some gateways POST; accept the same query/body fields. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!url.searchParams.get("transaction_id") && !url.searchParams.get("ref_txn_id")) {
    try {
      const body = (await req.json()) as {
        transaction_id?: string;
        status?: string | number;
        ref_txn_id?: string;
      };
      if (body.transaction_id) url.searchParams.set("transaction_id", String(body.transaction_id));
      if (body.status != null) url.searchParams.set("status", String(body.status));
      if (body.ref_txn_id) url.searchParams.set("ref_txn_id", String(body.ref_txn_id));
    } catch {
      // fall through — handleCallback will 400 if params missing
    }
  }
  return handleCallback(new Request(url.toString(), { method: "GET", headers: req.headers }));
}
