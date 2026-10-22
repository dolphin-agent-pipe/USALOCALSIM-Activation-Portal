import { prisma } from "@/lib/db";
import { getCoreConfig, isCoreSimulateMode, isCoreTopupsEnabled } from "./config";
import { resolveCoreSkuMapping, threeUkBundleMapping } from "./sku-map";
import { CORE_TOPUP_JOB_STATUS } from "./status";
import { enqueueCoreTopup, submitCoreTopupJob } from "./topup";

export type CoreFulfillmentTriggerInput = {
  cartPurchaseId: string;
  voucherId?: string | null;
  activationRequestId?: string | null;
  /** E.164 or digits — Core needs MSISDN (Three: 12 digits with country code). */
  mobile: string | null | undefined;
  networkSlug: string | null | undefined;
  planSku?: string | null;
  priceCents?: number | null;
  /** Optional explicit Core amount (major units). */
  amountMajorOverride?: number | null;
};

export type CoreFulfillmentTriggerResult =
  | { triggered: false; reason: string }
  | {
      triggered: true;
      jobId: string;
      refTxnId: string;
      status: string;
      submitOk: boolean;
      simulated: boolean;
      error?: string;
    };

function isCoreEligibleNetwork(slug: string | null | undefined): boolean {
  const s = slug?.trim().toLowerCase() ?? "";
  return s === "three_uk" || s === "three";
}

function simulateAmountMajor(): number {
  const raw = Number(process.env.CORE_SIMULATE_AMOUNT_MAJOR ?? "10");
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

/**
 * After Phase 2 activation: enqueue + submit a Core top-up for Three UK when configured.
 * Never throws — failures are audited; redeem/activate must not fail because of Core.
 */
export async function maybeQueueCoreTopupAfterActivation(
  input: CoreFulfillmentTriggerInput,
): Promise<CoreFulfillmentTriggerResult> {
  const enabled = isCoreTopupsEnabled();
  const simulate = isCoreSimulateMode();
  if (!enabled && !simulate) {
    return { triggered: false, reason: "core_topups_disabled" };
  }

  if (!isCoreEligibleNetwork(input.networkSlug)) {
    return { triggered: false, reason: "network_not_core_eligible" };
  }

  const mobile = input.mobile?.trim();
  if (!mobile) {
    await safeAudit("core_topup_skipped", {
      reason: "missing_mobile",
      cartPurchaseId: input.cartPurchaseId,
    });
    return { triggered: false, reason: "missing_mobile" };
  }

  const config = getCoreConfig();
  if (!config) {
    return { triggered: false, reason: "core_not_configured" };
  }

  let mapping = resolveCoreSkuMapping({
    networkSlug: input.networkSlug!,
    planSku: input.planSku,
    priceCents: input.priceCents,
  });

  if (!mapping && input.amountMajorOverride != null && Number.isFinite(input.amountMajorOverride)) {
    mapping = threeUkBundleMapping(input.amountMajorOverride);
  }

  // Invent amount only in pure offline simulate (live flag off). Never invent when ENABLED.
  if (!mapping && simulate && !enabled) {
    mapping = threeUkBundleMapping(simulateAmountMajor());
  }

  if (!mapping) {
    await safeAudit("core_topup_skipped", {
      reason: "mapping_incomplete",
      cartPurchaseId: input.cartPurchaseId,
      planSku: input.planSku,
      networkSlug: input.networkSlug,
    });
    return { triggered: false, reason: "mapping_incomplete" };
  }

  try {
    const enqueued = await enqueueCoreTopup({
      mobile,
      mapping,
      cartPurchaseId: input.cartPurchaseId,
      voucherId: input.voucherId,
      activationRequestId: input.activationRequestId,
      idempotentOnPurchase: true,
    });

    if (!enqueued.ok) {
      await safeAudit("core_topup_enqueue_failed", {
        cartPurchaseId: input.cartPurchaseId,
        error: enqueued.error,
      });
      return { triggered: false, reason: enqueued.error };
    }

    // Already past PENDING — do not call Core again (idempotent activate retries).
    if (enqueued.status !== CORE_TOPUP_JOB_STATUS.PENDING) {
      return {
        triggered: true,
        jobId: enqueued.jobId,
        refTxnId: enqueued.refTxnId,
        status: enqueued.status,
        submitOk: enqueued.status !== CORE_TOPUP_JOB_STATUS.FAILED,
        simulated: config.simulate,
      };
    }

    const submitted = await submitCoreTopupJob(enqueued.jobId);
    await safeAudit("core_topup_submitted", {
      cartPurchaseId: input.cartPurchaseId,
      jobId: enqueued.jobId,
      refTxnId: enqueued.refTxnId,
      status: submitted.status,
      submitOk: submitted.ok,
      simulated: config.simulate,
      error: submitted.ok ? undefined : submitted.error,
    });

    return {
      triggered: true,
      jobId: enqueued.jobId,
      refTxnId: enqueued.refTxnId,
      status: submitted.status,
      submitOk: submitted.ok,
      simulated: config.simulate,
      error: submitted.ok ? undefined : submitted.error,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    await safeAudit("core_topup_error", {
      cartPurchaseId: input.cartPurchaseId,
      error: message,
    });
    return { triggered: false, reason: message };
  }
}

async function safeAudit(action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        metadata: JSON.stringify(metadata),
      },
    });
  } catch {
    // ignore audit failures
  }
}
