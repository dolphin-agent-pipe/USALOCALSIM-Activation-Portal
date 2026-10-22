import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("./topup", async () => {
  const actual = await vi.importActual<typeof import("./topup")>("./topup");
  return {
    ...actual,
    enqueueCoreTopup: vi.fn(),
    submitCoreTopupJob: vi.fn(),
  };
});

describe("maybeQueueCoreTopupAfterActivation", () => {
  afterEach(() => {
    delete process.env.CORE_TOPUPS_ENABLED;
    delete process.env.CORE_TOPUPS_SIMULATE;
    delete process.env.CORE_API_EMAIL;
    delete process.env.CORE_API_TOKEN;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("skips when Core top-ups disabled and not simulating", async () => {
    process.env.CORE_TOPUPS_ENABLED = "false";
    process.env.CORE_TOPUPS_SIMULATE = "false";
    const { maybeQueueCoreTopupAfterActivation } = await import("./fulfillment");
    const result = await maybeQueueCoreTopupAfterActivation({
      cartPurchaseId: "p1",
      mobile: "+447700900123",
      networkSlug: "three_uk",
      planSku: "3UK-EX-40GB-30D",
    });
    expect(result).toEqual({ triggered: false, reason: "core_topups_disabled" });
  });

  it("skips non-Three networks", async () => {
    process.env.CORE_TOPUPS_SIMULATE = "true";
    const { maybeQueueCoreTopupAfterActivation } = await import("./fulfillment");
    const result = await maybeQueueCoreTopupAfterActivation({
      cartPurchaseId: "p1",
      mobile: "+447700900123",
      networkSlug: "t_mobile",
    });
    expect(result).toEqual({ triggered: false, reason: "network_not_core_eligible" });
  });

  it("skips when mobile missing", async () => {
    process.env.CORE_TOPUPS_SIMULATE = "true";
    const { maybeQueueCoreTopupAfterActivation } = await import("./fulfillment");
    const result = await maybeQueueCoreTopupAfterActivation({
      cartPurchaseId: "p1",
      mobile: null,
      networkSlug: "three_uk",
    });
    expect(result).toEqual({ triggered: false, reason: "missing_mobile" });
  });

  it("enqueues and submits in simulate mode for Three UK", async () => {
    process.env.CORE_TOPUPS_ENABLED = "false";
    process.env.CORE_TOPUPS_SIMULATE = "true";
    process.env.CORE_API_EMAIL = "test@example.com";
    process.env.CORE_API_TOKEN = "token";

    const topup = await import("./topup");
    vi.mocked(topup.enqueueCoreTopup).mockResolvedValue({
      ok: true,
      jobId: "job_1",
      refTxnId: "ctabcdef1234567",
      status: "PENDING",
      created: true,
    });
    vi.mocked(topup.submitCoreTopupJob).mockResolvedValue({
      ok: true,
      jobId: "job_1",
      status: "SUCCESS",
      coreTransactionId: "Core_FIXTURE_ctabcdef1234567",
      simulated: true,
    });

    const { maybeQueueCoreTopupAfterActivation } = await import("./fulfillment");
    const result = await maybeQueueCoreTopupAfterActivation({
      cartPurchaseId: "p1",
      voucherId: "v1",
      activationRequestId: "a1",
      mobile: "+447700900123",
      networkSlug: "three_uk",
      planSku: "3UK-EX-40GB-30D",
    });

    expect(result).toEqual({
      triggered: true,
      jobId: "job_1",
      refTxnId: "ctabcdef1234567",
      status: "SUCCESS",
      submitOk: true,
      simulated: true,
    });
    expect(topup.enqueueCoreTopup).toHaveBeenCalledOnce();
    expect(topup.submitCoreTopupJob).toHaveBeenCalledWith("job_1");
  });
});
