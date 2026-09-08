import { describe, expect, it } from "vitest";
import {
  dailyPayoutLockKey,
  partnerPayoutLockKey,
  PROMOTE_ELIGIBLE_LOCK_KEY,
} from "./cron-lock";

describe("cron-lock keys", () => {
  it("builds stable daily payout lock keys in UTC", () => {
    const date = new Date("2026-09-08T15:30:00-03:00");
    expect(dailyPayoutLockKey(date)).toBe("daily_payout:2026-09-08");
  });

  it("builds partner payout lock keys", () => {
    const date = new Date("2026-09-08T00:00:00.000Z");
    expect(partnerPayoutLockKey("partner-1", date)).toBe(
      "partner_payout:partner-1:2026-09-08",
    );
  });

  it("uses a fixed promote-eligible lock key", () => {
    expect(PROMOTE_ELIGIBLE_LOCK_KEY).toBe("promote_eligible_commissions");
  });
});
