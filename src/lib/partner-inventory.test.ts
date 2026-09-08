import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  formatBrlFromCents,
  isAssignmentLocked,
  normalizeTaxId,
  parseBrlToCents,
  serialInRange,
  VOUCHER_INVENTORY_STATUS,
} from "./partner-inventory";

describe("partner-inventory helpers", () => {
  it("formats and parses BRL commission amounts", () => {
    expect(formatBrlFromCents(6000)).toMatch(/60/);
    expect(parseBrlToCents("60")).toBe(6000);
    expect(parseBrlToCents("60,00")).toBe(6000);
    expect(parseBrlToCents("R$ 70.50")).toBe(7050);
    expect(parseBrlToCents("")).toBeNull();
  });

  it("normalizes CPF/CNPJ", () => {
    expect(normalizeTaxId("123.456.789-09")).toEqual({
      taxId: "12345678909",
      taxIdType: "CPF",
    });
    expect(normalizeTaxId("12.345.678/0001-90")).toEqual({
      taxId: "12345678000190",
      taxIdType: "CNPJ",
    });
    expect(normalizeTaxId("123")).toBeNull();
    expect(digitsOnly("a1b2")).toBe("12");
  });

  it("locks sold/redeemed inventory", () => {
    expect(isAssignmentLocked(VOUCHER_INVENTORY_STATUS.UNASSIGNED)).toBe(false);
    expect(isAssignmentLocked(VOUCHER_INVENTORY_STATUS.ASSIGNED)).toBe(false);
    expect(isAssignmentLocked(VOUCHER_INVENTORY_STATUS.SOLD)).toBe(true);
    expect(isAssignmentLocked(VOUCHER_INVENTORY_STATUS.REDEEMED)).toBe(true);
  });

  it("matches inclusive serial ranges", () => {
    expect(serialInRange("USALO000010", "USALO000001", "USALO000050")).toBe(true);
    expect(serialInRange("USALO000051", "USALO000001", "USALO000050")).toBe(false);
    expect(serialInRange("B", "C", "A")).toBe(true);
  });
});
