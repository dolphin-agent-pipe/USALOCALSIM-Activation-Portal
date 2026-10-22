/** Core C-TOP transaction status codes (PDF § Transaction / Callback). */
export const CORE_TXN_STATUS = {
  PROCESSING: 0,
  SUCCESS: 1,
  FAILED: 2,
} as const;

export type CoreTxnStatusCode = (typeof CORE_TXN_STATUS)[keyof typeof CORE_TXN_STATUS];

/** Portal job lifecycle for CoreTopupJob.status */
export const CORE_TOPUP_JOB_STATUS = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  PROCESSING: "PROCESSING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  MANUAL: "MANUAL",
} as const;

export type CoreTopupJobStatus =
  (typeof CORE_TOPUP_JOB_STATUS)[keyof typeof CORE_TOPUP_JOB_STATUS];

const TERMINAL_JOB_STATUSES: ReadonlySet<string> = new Set([
  CORE_TOPUP_JOB_STATUS.SUCCESS,
  CORE_TOPUP_JOB_STATUS.MANUAL,
]);

export function isCoreTopupTerminalStatus(status: string): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

/** Statuses that already hit Core (or are finished) — do not create/submit again. */
export function isCoreTopupInFlightOrDone(status: string): boolean {
  return (
    status === CORE_TOPUP_JOB_STATUS.SUBMITTED ||
    status === CORE_TOPUP_JOB_STATUS.PROCESSING ||
    isCoreTopupTerminalStatus(status)
  );
}

export function mapCoreTxnStatusToJobStatus(code: number): CoreTopupJobStatus {
  if (code === CORE_TXN_STATUS.SUCCESS) return CORE_TOPUP_JOB_STATUS.SUCCESS;
  if (code === CORE_TXN_STATUS.FAILED) return CORE_TOPUP_JOB_STATUS.FAILED;
  return CORE_TOPUP_JOB_STATUS.PROCESSING;
}
