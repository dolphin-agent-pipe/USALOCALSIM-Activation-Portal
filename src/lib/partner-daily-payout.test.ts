import { describe, expect, it } from "vitest";
import {
  commissionStatusBeforePayout,
  isCommissionPayable,
  utcPayoutDate,
} from "./partner-daily-payout";
import { COMMISSION_STATUS } from "./commission-status";
import { brlCentsToAmount } from "./wise-payout";

describe("partner-daily-payout helpers", () => {
  it("normalizes payout date to UTC midnight", () => {
    const d = utcPayoutDate(new Date("2026-09-08T15:30:00-03:00"));
    expect(d.toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });

  it("restores OFFSET_PARTIAL when offsets were applied", () => {
    expect(commissionStatusBeforePayout(1000)).toBe(COMMISSION_STATUS.OFFSET_PARTIAL);
    expect(commissionStatusBeforePayout(0)).toBe(COMMISSION_STATUS.ELIGIBLE);
  });

  it("only includes payable eligible commissions with positive net", () => {
    expect(
      isCommissionPayable({
        status: COMMISSION_STATUS.ELIGIBLE,
        amountBrlCents: 6000,
        offsetAppliedBrlCents: 0,
        payoutBatchId: null,
      }),
    ).toBe(true);

    expect(
      isCommissionPayable({
        status: COMMISSION_STATUS.OFFSET_PARTIAL,
        amountBrlCents: 6000,
        offsetAppliedBrlCents: 2000,
        payoutBatchId: null,
      }),
    ).toBe(true);

    expect(
      isCommissionPayable({
        status: COMMISSION_STATUS.OFFSET_SETTLED,
        amountBrlCents: 6000,
        offsetAppliedBrlCents: 6000,
        payoutBatchId: null,
      }),
    ).toBe(false);

    expect(
      isCommissionPayable({
        status: COMMISSION_STATUS.ELIGIBLE,
        amountBrlCents: 6000,
        offsetAppliedBrlCents: 0,
        payoutBatchId: "batch-1",
      }),
    ).toBe(false);
  });

  it("converts BRL centavos to decimal amount", () => {
    expect(brlCentsToAmount(6000)).toBe(60);
    expect(brlCentsToAmount(6050)).toBe(60.5);
  });
});
