import { afterEach, describe, expect, it } from "vitest";
import {
  PIX_PROVIDER,
  commissionProviderForPixProvider,
  getConfiguredPixProvider,
  isPixImmediateSettlement,
} from "./pix-provider";

describe("pix-provider", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("defaults to none when no provider configured", () => {
    delete process.env.PIX_PROVIDER;
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    expect(getConfiguredPixProvider()).toBe(PIX_PROVIDER.NONE);
  });

  it("respects explicit PIX_PROVIDER stripe", () => {
    process.env.PIX_PROVIDER = "stripe";
    expect(getConfiguredPixProvider()).toBe(PIX_PROVIDER.STRIPE);
  });

  it("falls back to asaas when Mercado Pago token exists", () => {
    delete process.env.PIX_PROVIDER;
    process.env.MERCADOPAGO_ACCESS_TOKEN = "test-token";
    expect(getConfiguredPixProvider()).toBe(PIX_PROVIDER.ASAAS);
  });

  it("maps provider ids to commission ledger providers", () => {
    expect(commissionProviderForPixProvider(PIX_PROVIDER.STRIPE)).toBe("pix_stripe");
    expect(commissionProviderForPixProvider(PIX_PROVIDER.ASAAS)).toBe("pix_asaas");
  });

  it("treats PIX as immediately settled by default", () => {
    delete process.env.COMMISSION_PIX_IMMEDIATE_SETTLE;
    expect(isPixImmediateSettlement()).toBe(true);
    process.env.COMMISSION_PIX_IMMEDIATE_SETTLE = "false";
    expect(isPixImmediateSettlement()).toBe(false);
  });
});
