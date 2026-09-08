import { describe, expect, it } from "vitest";
import {
  commissionStatusBeforePayout,
  isCommissionPayable,
  shouldSkipExistingBatch,
  utcPayoutDate,
} from "./partner-daily-payout";
import { COMMISSION_STATUS } from "./commission-status";
import { PAYOUT_ATTEMPT_STATUS, PAYOUT_BATCH_STATUS } from "./payout-status";
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

  it("skips batches that are paid or in progress", () => {
    expect(shouldSkipExistingBatch(PAYOUT_BATCH_STATUS.PAID)).toEqual({
      skip: true,
      reason: "already_paid",
    });
    expect(shouldSkipExistingBatch(PAYOUT_BATCH_STATUS.PROCESSING)).toEqual({
      skip: true,
      reason: "in_progress",
    });
    expect(
      shouldSkipExistingBatch(PAYOUT_BATCH_STATUS.CREATED, PAYOUT_ATTEMPT_STATUS.QUOTED),
    ).toEqual({ skip: true, reason: "in_progress" });
    expect(
      shouldSkipExistingBatch(PAYOUT_BATCH_STATUS.FAILED, PAYOUT_ATTEMPT_STATUS.FAILED),
    ).toEqual({ skip: false });
  });
});
