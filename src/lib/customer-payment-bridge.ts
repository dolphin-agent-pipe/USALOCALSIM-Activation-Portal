import type {
  CustomerFundsSettledEvent,
  CustomerPaymentConfirmedEvent,
} from "./customer-payment-events";
import {
  handleFundsSettledForCommission,
  handlePaymentConfirmedForCommission,
} from "./commission-engine";
import { isPixImmediateSettlement } from "./pix-provider";

export const customerPaymentCommissionBridge = {
  async onPaymentConfirmed(event: CustomerPaymentConfirmedEvent): Promise<void> {
    await handlePaymentConfirmedForCommission(event);
  },

  async onFundsSettledAvailable(event: CustomerFundsSettledEvent): Promise<void> {
    await handleFundsSettledForCommission(event);
  },
};

/** After a PIX provider confirms payment, optionally mark commission funds available. */
export async function emitPixFundsSettledIfImmediate(
  saleTransactionId: string,
  note?: string,
): Promise<void> {
  if (!isPixImmediateSettlement()) return;
  await customerPaymentCommissionBridge.onFundsSettledAvailable({
    saleTransactionId,
    settledAt: new Date(),
    note: note ?? "PIX payment confirmed — funds treated as available",
  });
}
