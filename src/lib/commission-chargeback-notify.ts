import { formatBrlFromCents } from "./partner-inventory";

export type ChargebackNotificationInput = {
  partnerName: string;
  oldVoucherSerial: string;
  oldCommissionBrlCents: number;
  newVoucherSerial?: string;
  newCommissionBrlCents?: number;
  appliedBrlCents?: number;
  remainingDebtBrlCents?: number;
  netPayableBrlCents?: number;
};

/** Client-suggested notification copy for offset allocations. */
export function buildOffsetAllocationNotification(input: ChargebackNotificationInput): string {
  const oldAmt = formatBrlFromCents(input.oldCommissionBrlCents);
  if (input.newVoucherSerial && input.appliedBrlCents != null) {
    const applied = formatBrlFromCents(input.appliedBrlCents);
    const newAmt =
      input.newCommissionBrlCents != null
        ? formatBrlFromCents(input.newCommissionBrlCents)
        : applied;
    let msg =
      `Commission adjustment: the commission from Voucher ${input.newVoucherSerial} (${newAmt}) ` +
      `was applied to offset the previously paid commission from Voucher ${input.oldVoucherSerial} (${oldAmt}), ` +
      `which was subsequently charged back.`;
    if (input.remainingDebtBrlCents != null && input.remainingDebtBrlCents > 0) {
      msg += ` Remaining chargeback balance: ${formatBrlFromCents(input.remainingDebtBrlCents)}.`;
    }
    if (input.netPayableBrlCents != null) {
      msg += ` Net payable from Voucher ${input.newVoucherSerial}: ${formatBrlFromCents(input.netPayableBrlCents)}.`;
    }
    return msg;
  }

  return (
    `Commission chargeback recorded for Voucher ${input.oldVoucherSerial} (${oldAmt}). ` +
    `This amount will be offset against future eligible commissions for ${input.partnerName}.`
  );
}

export function buildChargebackRecordedNotification(input: ChargebackNotificationInput): string {
  return buildOffsetAllocationNotification(input);
}
