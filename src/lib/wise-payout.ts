import type { WiseConfig } from "./wise-config";
import { wiseRequest } from "./wise-client";

type WiseQuote = {
  id: string;
  rate?: number;
  paymentOptions?: Array<{
    payIn: string;
    payOut: string;
    fee?: { total?: number };
    sourceAmount?: number;
    targetAmount?: number;
    sourceCurrency?: string;
    targetCurrency?: string;
    disabled?: boolean;
  }>;
};

type WiseTransfer = {
  id: number;
  status: string;
  quoteUuid?: string;
  [key: string]: unknown;
};

export type WisePayoutQuoteResult = {
  quoteId: string;
  rawQuote: string;
  rate: string | null;
  feeSourceCents: number | null;
  transferNature: string;
};

export type WisePayoutTransferResult = {
  transferId: string;
  status: string;
  rawTransfer: string;
};

function pickPaymentOption(quote: WiseQuote) {
  const options = quote.paymentOptions ?? [];
  const enabled = options.filter((o) => !o.disabled);
  return enabled.find((o) => o.payOut === "BANK_TRANSFER") ?? enabled[0] ?? null;
}

export async function createWisePayoutQuote(
  config: WiseConfig,
  input: {
    targetAmountBrl: number;
    recipientId: string;
    correlationId: string;
  },
): Promise<WisePayoutQuoteResult> {
  const quote = await wiseRequest<WiseQuote>(config, {
    method: "POST",
    path: `/v3/profiles/${config.profileId}/quotes`,
    body: {
      sourceCurrency: config.sourceCurrency,
      targetCurrency: "BRL",
      targetAmount: input.targetAmountBrl,
      targetAccount: Number(input.recipientId),
      payOut: "BANK_TRANSFER",
      paymentMetadata: {
        transferNature: config.transferNature,
      },
    },
    correlationId: input.correlationId,
  });

  const option = pickPaymentOption(quote);
  const fee = option?.fee?.total;
  const feeSourceCents =
    fee !== undefined && fee !== null ? Math.round(Number(fee) * 100) : null;

  return {
    quoteId: quote.id,
    rawQuote: JSON.stringify(quote),
    rate: quote.rate !== undefined ? String(quote.rate) : null,
    feeSourceCents,
    transferNature: config.transferNature,
  };
}

export async function createWisePayoutTransfer(
  config: WiseConfig,
  input: {
    quoteId: string;
    recipientId: string;
    customerTransactionId: string;
    reference?: string;
  },
): Promise<WisePayoutTransferResult> {
  const transfer = await wiseRequest<WiseTransfer>(config, {
    method: "POST",
    path: "/v1/transfers",
    body: {
      targetAccount: Number(input.recipientId),
      quoteUuid: input.quoteId,
      customerTransactionId: input.customerTransactionId,
      details: {
        reference: input.reference ?? "Partner commission payout",
      },
    },
    correlationId: input.customerTransactionId,
  });

  return {
    transferId: String(transfer.id),
    status: transfer.status,
    rawTransfer: JSON.stringify(transfer),
  };
}

export async function fundWiseTransfer(
  config: WiseConfig,
  transferId: string,
  correlationId: string,
): Promise<{ status: string; raw: string }> {
  const payment = await wiseRequest<{ status?: string; [key: string]: unknown }>(config, {
    method: "POST",
    path: `/v3/profiles/${config.profileId}/transfers/${transferId}/payments`,
    body: { type: "BALANCE" },
    correlationId,
  });

  return {
    status: payment.status ?? "unknown",
    raw: JSON.stringify(payment),
  };
}

export async function getWiseTransfer(
  config: WiseConfig,
  transferId: string,
): Promise<{ status: string; raw: string }> {
  const transfer = await wiseRequest<WiseTransfer>(config, {
    method: "GET",
    path: `/v1/transfers/${transferId}`,
  });

  return {
    status: transfer.status,
    raw: JSON.stringify(transfer),
  };
}

export function brlCentsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}
