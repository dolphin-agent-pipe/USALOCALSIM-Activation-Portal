import { afterEach, describe, expect, it } from "vitest";
import {
  clearCoreBearerCache,
  coreCreateTransaction,
  coreGetNetworkList,
  coreGetNetworkSku,
  fetchCoreBearerToken,
} from "./client";
import type { CoreConfig } from "./config";
import { coreTransactionPath } from "./config";
import { CORE_FIXTURE_NETWORK_LIST, CORE_FIXTURE_THREE_BUNDLE_SKUS } from "./fixtures";
import { createCoreRefTxnId, isValidCoreRefTxnId } from "./ref-txn-id";
import { resolveCoreSkuMapping, threeUkBundleMapping } from "./sku-map";
import {
  CORE_TOPUP_JOB_STATUS,
  CORE_TXN_STATUS,
  isCoreTopupTerminalStatus,
  mapCoreTxnStatusToJobStatus,
} from "./status";

const simulateConfig: CoreConfig = {
  baseUrl: "https://ctop-api.core-retail.com/api/uat",
  email: "test@example.com",
  apiToken: "api-token",
  useStaticBearer: false,
  simulate: true,
};

afterEach(() => {
  clearCoreBearerCache();
});

describe("coreTransactionPath", () => {
  it("uses uat-transaction for UAT base URL", () => {
    expect(coreTransactionPath("https://ctop-api.core-retail.com/api/uat")).toBe("/uat-transaction");
  });

  it("uses transaction for production base URL", () => {
    expect(coreTransactionPath("https://ctop-api.core-retail.com/api/v1")).toBe("/transaction");
  });
});

describe("createCoreRefTxnId", () => {
  it("meets Core length constraints", () => {
    for (let i = 0; i < 20; i++) {
      const id = createCoreRefTxnId();
      expect(isValidCoreRefTxnId(id)).toBe(true);
      expect(id.startsWith("ct")).toBe(true);
    }
  });
});

describe("mapCoreTxnStatusToJobStatus", () => {
  it("maps Core codes", () => {
    expect(mapCoreTxnStatusToJobStatus(CORE_TXN_STATUS.PROCESSING)).toBe(
      CORE_TOPUP_JOB_STATUS.PROCESSING,
    );
    expect(mapCoreTxnStatusToJobStatus(CORE_TXN_STATUS.SUCCESS)).toBe(CORE_TOPUP_JOB_STATUS.SUCCESS);
    expect(mapCoreTxnStatusToJobStatus(CORE_TXN_STATUS.FAILED)).toBe(CORE_TOPUP_JOB_STATUS.FAILED);
  });

  it("treats SUCCESS/MANUAL as terminal", () => {
    expect(isCoreTopupTerminalStatus(CORE_TOPUP_JOB_STATUS.SUCCESS)).toBe(true);
    expect(isCoreTopupTerminalStatus(CORE_TOPUP_JOB_STATUS.MANUAL)).toBe(true);
    expect(isCoreTopupTerminalStatus(CORE_TOPUP_JOB_STATUS.PROCESSING)).toBe(false);
  });
});

describe("resolveCoreSkuMapping", () => {
  it("returns null until SKU overrides are configured", () => {
    expect(
      resolveCoreSkuMapping({ networkSlug: "three_uk", planSku: "UNKNOWN-SKU", priceCents: 2000 }),
    ).toBeNull();
  });

  it("threeUkBundleMapping builds explicit amount", () => {
    expect(threeUkBundleMapping(20)).toEqual({
      opcode: "3NETWORK",
      typeTxn: "Bundle",
      amountMajor: 20,
    });
  });
});

describe("core client simulate mode", () => {
  it("returns fixture token / network list / sku / transaction", async () => {
    const token = await fetchCoreBearerToken(simulateConfig);
    expect(token).toBe("fixture-bearer-token");

    const networks = await coreGetNetworkList(simulateConfig);
    expect(networks).toEqual(CORE_FIXTURE_NETWORK_LIST);

    const skus = await coreGetNetworkSku(simulateConfig, "3NETWORK", "Bundle");
    expect(skus).toEqual(CORE_FIXTURE_THREE_BUNDLE_SKUS);

    const txn = await coreCreateTransaction(simulateConfig, {
      mobile: "447700900123",
      opcode: "3NETWORK",
      amount: 20,
      type_txn: "Bundle",
      ref_txn_id: createCoreRefTxnId(),
    });
    expect(txn.success).toBe(true);
    expect(txn.status).toBe(CORE_TXN_STATUS.SUCCESS);
    expect(txn.transaction_id).toMatch(/^Core_FIXTURE_/);
  });
});
