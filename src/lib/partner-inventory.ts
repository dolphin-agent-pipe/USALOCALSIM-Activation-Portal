/** Voucher inventory / ownership lifecycle (independent of operational voucher.status). */
export const VOUCHER_INVENTORY_STATUS = {
  UNASSIGNED: "UNASSIGNED",
  ASSIGNED: "ASSIGNED",
  SOLD: "SOLD",
  REDEEMED: "REDEEMED",
  CANCELLED: "CANCELLED",
} as const;

export type VoucherInventoryStatus =
  (typeof VOUCHER_INVENTORY_STATUS)[keyof typeof VOUCHER_INVENTORY_STATUS];

export const VOUCHER_ASSIGNMENT_ACTION = {
  ASSIGNED: "assigned",
  UNASSIGNED: "unassigned",
  REASSIGNED: "reassigned",
} as const;

/** Default partner commission: R$60.00 = 6000 centavos. */
export const DEFAULT_PARTNER_COMMISSION_BRL_CENTS = 6000;

export function formatBrlFromCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** Parse admin input like "60", "60.00", "R$ 60,00" into BRL centavos. */
export function parseBrlToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/[R$\s]/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeTaxId(raw: string): { taxId: string; taxIdType: "CPF" | "CNPJ" } | null {
  const taxId = digitsOnly(raw);
  if (taxId.length === 11) return { taxId, taxIdType: "CPF" };
  if (taxId.length === 14) return { taxId, taxIdType: "CNPJ" };
  return null;
}

/** Inventory states that must not change partner assignment after sale. */
export function isAssignmentLocked(inventoryStatus: string): boolean {
  return (
    inventoryStatus === VOUCHER_INVENTORY_STATUS.SOLD ||
    inventoryStatus === VOUCHER_INVENTORY_STATUS.REDEEMED ||
    inventoryStatus === VOUCHER_INVENTORY_STATUS.CANCELLED
  );
}

/**
 * Inclusive lexicographic serial range on PrepaidCard.serial.
 * Both bounds are trimmed; empty bounds are invalid.
 */
export function serialInRange(serial: string, from: string, to: string): boolean {
  const s = serial.trim();
  const a = from.trim();
  const b = to.trim();
  if (!s || !a || !b) return false;
  const lo = a <= b ? a : b;
  const hi = a <= b ? b : a;
  return s >= lo && s <= hi;
}
