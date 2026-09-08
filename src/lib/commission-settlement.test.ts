import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  isFundsAvailableByHold,
  mapPrepaidSourceToCommissionProvider,
  settlementHoldDaysForProvider,
} from "./commission-settlement";
import { COMMISSION_PAYMENT_PROVIDER } from "./commission-status";
import { PREPAID_PAYMENT_SOURCES } from "./prepaid-payment-source";

describe("commission-settlement", () => {
  it("maps prepaid sources to commission providers", () => {
    expect(mapPrepaidSourceToCommissionProvider(PREPAID_PAYMENT_SOURCES.STRIPE)).toBe(
      COMMISSION_PAYMENT_PROVIDER.STRIPE_CARD,
    );
    expect(mapPrepaidSourceToCommissionProvider(PREPAID_PAYMENT_SOURCES.MERCADOPAGO)).toBe(
      COMMISSION_PAYMENT_PROVIDER.MERCADOPAGO_PIX,
    );
    expect(mapPrepaidSourceToCommissionProvider(PREPAID_PAYMENT_SOURCES.POS)).toBe(
      COMMISSION_PAYMENT_PROVIDER.POS,
    );
  });

  it("POS has zero settlement hold", () => {
    expect(settlementHoldDaysForProvider(COMMISSION_PAYMENT_PROVIDER.POS)).toBe(0);
    const soldAt = new Date("2026-01-01T12:00:00Z");
    expect(isFundsAvailableByHold(soldAt, COMMISSION_PAYMENT_PROVIDER.POS, soldAt)).toBe(true);
  });

  it("adds calendar days for hold checks", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const plus2 = addCalendarDays(from, 2);
    expect(plus2.toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });
});
