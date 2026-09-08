import type { PrepaidPaymentSource } from "./prepaid-payment-source";
import { PREPAID_PAYMENT_SOURCES } from "./prepaid-payment-source";
import { COMMISSION_PAYMENT_PROVIDER } from "./commission-status";

/** Maps internal prepaid payment source to commission ledger provider id. */
export function mapPrepaidSourceToCommissionProvider(
  source: PrepaidPaymentSource,
): string {
  switch (source) {
    case PREPAID_PAYMENT_SOURCES.STRIPE:
      return COMMISSION_PAYMENT_PROVIDER.STRIPE_CARD;
    case PREPAID_PAYMENT_SOURCES.MERCADOPAGO:
      return COMMISSION_PAYMENT_PROVIDER.MERCADOPAGO_PIX;
    case PREPAID_PAYMENT_SOURCES.PIX_STRIPE:
      return COMMISSION_PAYMENT_PROVIDER.PIX_STRIPE;
    case PREPAID_PAYMENT_SOURCES.PIX_ASAAS:
      return COMMISSION_PAYMENT_PROVIDER.PIX_ASAAS;
    case PREPAID_PAYMENT_SOURCES.POS:
      return COMMISSION_PAYMENT_PROVIDER.POS;
    default:
      return source;
  }
}

/**
 * Days after sale before commission funds are treated as available for payout.
 * POS = immediate (cash at retail). Stripe/MP use configurable holds until settlement.
 */
export function settlementHoldDaysForProvider(paymentProvider: string): number {
  if (process.env.COMMISSION_IMMEDIATE_FUNDS_AVAILABLE === "true") {
    return 0;
  }
  if (paymentProvider === COMMISSION_PAYMENT_PROVIDER.POS) {
    return 0;
  }
  if (
    paymentProvider === COMMISSION_PAYMENT_PROVIDER.STRIPE_CARD ||
    paymentProvider === COMMISSION_PAYMENT_PROVIDER.PIX_STRIPE
  ) {
    const days = Number(process.env.COMMISSION_STRIPE_SETTLEMENT_DAYS ?? "2");
    return Number.isFinite(days) && days >= 0 ? days : 2;
  }
  if (
    paymentProvider === COMMISSION_PAYMENT_PROVIDER.MERCADOPAGO_PIX ||
    paymentProvider === COMMISSION_PAYMENT_PROVIDER.PIX_ASAAS
  ) {
    const days = Number(process.env.COMMISSION_MP_SETTLEMENT_DAYS ?? "1");
    return Number.isFinite(days) && days >= 0 ? days : 1;
  }
  const days = Number(process.env.COMMISSION_DEFAULT_SETTLEMENT_DAYS ?? "2");
  return Number.isFinite(days) && days >= 0 ? days : 2;
}

export function addCalendarDays(from: Date, days: number): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isFundsAvailableByHold(soldAt: Date, paymentProvider: string, now = new Date()): boolean {
  const holdDays = settlementHoldDaysForProvider(paymentProvider);
  if (holdDays === 0) return true;
  return addCalendarDays(soldAt, holdDays) <= now;
}
