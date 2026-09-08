export const PAYOUT_BATCH_STATUS = {
  CREATED: "CREATED",
  SUBMITTED: "SUBMITTED",
  PROCESSING: "PROCESSING",
  PAID: "PAID",
  FAILED: "FAILED",
  REVIEW: "REVIEW",
} as const;

export type PayoutBatchStatus = (typeof PAYOUT_BATCH_STATUS)[keyof typeof PAYOUT_BATCH_STATUS];

export const PAYOUT_ATTEMPT_STATUS = {
  CREATED: "CREATED",
  QUOTED: "QUOTED",
  SUBMITTED: "SUBMITTED",
  PROCESSING: "PROCESSING",
  PAID: "PAID",
  FAILED: "FAILED",
} as const;

export type PayoutAttemptStatus =
  (typeof PAYOUT_ATTEMPT_STATUS)[keyof typeof PAYOUT_ATTEMPT_STATUS];

/** Wise transfer statuses that mean money was delivered. */
export const WISE_TRANSFER_PAID_STATUSES = new Set([
  "outgoing_payment_sent",
  "funds_converted",
  "bounced_back",
]);

/** Wise transfer statuses that mean payout is still in flight. */
export const WISE_TRANSFER_PROCESSING_STATUSES = new Set([
  "incoming_payment_waiting",
  "incoming_payment_initiated",
  "processing",
  "funds_refunded",
  "charged_back",
]);
