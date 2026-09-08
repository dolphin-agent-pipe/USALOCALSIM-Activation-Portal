/**
 * Payment module boundary for commission engine (Phase B).
 * Checkout providers emit these events; commission logic stays provider-agnostic.
 */
export type CustomerPaymentConfirmedEvent = {
  saleTransactionId: string;
  paymentProvider: string;
  cartPurchaseId: string;
  voucherId: string;
  saleAmountCents: number;
  saleCurrency?: string;
  customerCountry?: string;
  soldAt?: Date;
};

export type CustomerFundsSettledEvent = {
  saleTransactionId: string;
  settledAt?: Date;
  note?: string;
};

export interface CustomerPaymentCommissionBridge {
  onPaymentConfirmed(event: CustomerPaymentConfirmedEvent): Promise<void>;
  onFundsSettledAvailable(event: CustomerFundsSettledEvent): Promise<void>;
}
