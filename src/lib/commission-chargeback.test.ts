import { describe, expect, it } from "vitest";
import { planChargebackOffsets } from "./commission-chargeback";
import { netPayableBrlCents } from "./commission-chargeback-status";
import { buildOffsetAllocationNotification } from "./commission-chargeback-notify";

describe("commission chargeback offsets", () => {
  it("full offset: PDF example 1 (R$60 chargeback, R$60 new commission)", () => {
    const plan = planChargebackOffsets(6000, [
      { id: "bal1", remainingBrlCents: 6000, oldCommissionId: "old1" },
    ]);
    expect(plan).toEqual([
      { balanceId: "bal1", oldCommissionId: "old1", amountBrlCents: 6000 },
    ]);
    expect(netPayableBrlCents(6000, 6000)).toBe(0);
  });

  it("partial/multiple offsets: PDF example 2 (R$70 debt, R$50 then R$60)", () => {
    const balances = [{ id: "bal1", remainingBrlCents: 7000, oldCommissionId: "old1" }];

    const planA = planChargebackOffsets(5000, balances);
    expect(planA).toEqual([
      { balanceId: "bal1", oldCommissionId: "old1", amountBrlCents: 5000 },
    ]);
    const remainingAfterA = 7000 - 5000;

    const planB = planChargebackOffsets(6000, [
      { id: "bal1", remainingBrlCents: remainingAfterA, oldCommissionId: "old1" },
    ]);
    expect(planB).toEqual([
      { balanceId: "bal1", oldCommissionId: "old1", amountBrlCents: 2000 },
    ]);
    expect(netPayableBrlCents(6000, 2000)).toBe(4000);
  });

  it("builds client notification copy for offset", () => {
    const msg = buildOffsetAllocationNotification({
      partnerName: "João",
      oldVoucherSerial: "#000125",
      oldCommissionBrlCents: 6000,
      newVoucherSerial: "#001487",
      newCommissionBrlCents: 6000,
      appliedBrlCents: 6000,
      remainingDebtBrlCents: 0,
      netPayableBrlCents: 0,
    });
    expect(msg).toContain("#000125");
    expect(msg).toContain("#001487");
    expect(msg).toContain("charged back");
  });
});
