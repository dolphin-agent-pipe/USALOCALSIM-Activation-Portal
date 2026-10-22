import { randomBytes } from "crypto";

/**
 * Core `ref_txn_id` must be length > 8 and < 20 (PDF Transaction API).
 * Format: `ct` + 14 hex chars = 16 characters.
 */
export function createCoreRefTxnId(): string {
  return `ct${randomBytes(7).toString("hex")}`;
}

export function isValidCoreRefTxnId(id: string): boolean {
  return id.length > 8 && id.length < 20;
}
