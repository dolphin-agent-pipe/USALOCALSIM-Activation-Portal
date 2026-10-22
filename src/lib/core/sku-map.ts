import { CORE_OPCODES, CORE_TYPE_TXN, type CoreOpcode, type CoreTypeTxn } from "./types";

/**
 * Portal plan → Core top-up mapping.
 * Fill `amountMajor` / overrides once UAT `networksku` is reachable.
 */
export type CoreSkuMapping = {
  opcode: CoreOpcode;
  typeTxn: CoreTypeTxn;
  /** Core `amount` (major units, e.g. GBP 10) — must match a networksku `value`. */
  amountMajor: number;
};

export type PortalPlanCoreKey = {
  networkSlug: string;
  planSku?: string | null;
  /** Plan price in USD cents (portal). Used only as a fallback hint until SKU map is filled. */
  priceCents?: number | null;
};

/**
 * Static overrides keyed by portal Plan.sku.
 * Empty until client confirms Core offers for Three UK.
 */
const SKU_OVERRIDES: Record<string, CoreSkuMapping> = {
  // Example (do not enable until confirmed against UAT networksku):
  // "3UK-UNL-30D": { opcode: CORE_OPCODES.THREE, typeTxn: CORE_TYPE_TXN.BUNDLE, amountMajor: 20 },
};

/**
 * Resolve Core opcode / delivery / amount for a portal plan.
 * Returns null when mapping is incomplete (caller should leave job PENDING / MANUAL).
 */
export function resolveCoreSkuMapping(input: PortalPlanCoreKey): CoreSkuMapping | null {
  const sku = input.planSku?.trim();
  if (sku && SKU_OVERRIDES[sku]) {
    return SKU_OVERRIDES[sku]!;
  }

  // Require an explicit SKU override until UAT `networksku` + client confirmation.
  return null;
}

/** Default Three UK opcode/type when amount is supplied explicitly (admin / manual). */
export function threeUkBundleMapping(amountMajor: number): CoreSkuMapping {
  return {
    opcode: CORE_OPCODES.THREE,
    typeTxn: CORE_TYPE_TXN.BUNDLE,
    amountMajor,
  };
}
