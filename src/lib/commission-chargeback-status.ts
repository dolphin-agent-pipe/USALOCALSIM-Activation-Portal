export const CHARGEBACK_BALANCE_STATUS = {
  OPEN: "OPEN",
  SETTLED: "SETTLED",
  ADMIN_REVIEW: "ADMIN_REVIEW",
} as const;

export const CHARGEBACK_REASON = {
  CUSTOMER_REFUND: "customer_refund",
  PARTNER_IRREGULARITY: "partner_irregularity",
} as const;

/** Commission statuses that can be cancelled on refund before payout. */
export const COMMISSION_UNPAID_STATUSES = [
  "PENDING_FUNDS",
  "ELIGIBLE",
  "OFFSET_PARTIAL",
  "INCLUDED_IN_PAYOUT",
] as const;

export function netPayableBrlCents(amountBrlCents: number, offsetAppliedBrlCents: number): number {
  return Math.max(0, amountBrlCents - offsetAppliedBrlCents);
}
