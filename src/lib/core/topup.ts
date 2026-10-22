import { prisma } from "@/lib/db";
import { coreCreateTransaction, CoreApiError } from "./client";
import { getCoreConfig, isCoreSimulateMode, isCoreTopupsEnabled } from "./config";
import { createCoreRefTxnId, isValidCoreRefTxnId } from "./ref-txn-id";
import { resolveCoreSkuMapping, threeUkBundleMapping, type CoreSkuMapping } from "./sku-map";
import {
  CORE_TOPUP_JOB_STATUS,
  isCoreTopupInFlightOrDone,
  isCoreTopupTerminalStatus,
  mapCoreTxnStatusToJobStatus,
  type CoreTopupJobStatus,
} from "./status";

export type EnqueueCoreTopupInput = {
  mobile: string;
  mapping: CoreSkuMapping;
  cartPurchaseId?: string | null;
  voucherId?: string | null;
  activationRequestId?: string | null;
  /** Optional idempotency: reuse existing in-flight/success job for this purchase. */
  idempotentOnPurchase?: boolean;
};

export type EnqueueCoreTopupResult =
  | { ok: true; jobId: string; refTxnId: string; status: CoreTopupJobStatus; created: boolean }
  | { ok: false; error: string };

export type SubmitCoreTopupResult =
  | {
      ok: true;
      jobId: string;
      status: CoreTopupJobStatus;
      coreTransactionId?: string | null;
      simulated: boolean;
    }
  | { ok: false; jobId: string; error: string; status: CoreTopupJobStatus };

function normalizeMobile(mobile: string): string {
  return mobile.replace(/\D/g, "");
}

/**
 * Create a CoreTopupJob row (does not call Core until `submitCoreTopupJob`).
 */
export async function enqueueCoreTopup(
  input: EnqueueCoreTopupInput,
): Promise<EnqueueCoreTopupResult> {
  if (!isCoreTopupsEnabled() && !isCoreSimulateMode()) {
    return { ok: false, error: "core_topups_disabled" };
  }

  const mobile = normalizeMobile(input.mobile);
  if (mobile.length < 10 || mobile.length > 15) {
    return { ok: false, error: "invalid_mobile" };
  }

  if (input.idempotentOnPurchase && input.cartPurchaseId) {
    const existing = await prisma.coreTopupJob.findFirst({
      where: {
        cartPurchaseId: input.cartPurchaseId,
        status: {
          in: [
            CORE_TOPUP_JOB_STATUS.PENDING,
            CORE_TOPUP_JOB_STATUS.SUBMITTED,
            CORE_TOPUP_JOB_STATUS.PROCESSING,
            CORE_TOPUP_JOB_STATUS.SUCCESS,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, refTxnId: true, status: true },
    });
    if (existing) {
      return {
        ok: true,
        jobId: existing.id,
        refTxnId: existing.refTxnId,
        status: existing.status as CoreTopupJobStatus,
        created: false,
      };
    }
  }

  let refTxnId = createCoreRefTxnId();
  for (let i = 0; i < 5 && !isValidCoreRefTxnId(refTxnId); i++) {
    refTxnId = createCoreRefTxnId();
  }
  if (!isValidCoreRefTxnId(refTxnId)) {
    return { ok: false, error: "ref_txn_id_invalid" };
  }

  try {
    const job = await prisma.coreTopupJob.create({
      data: {
        mobile,
        opcode: input.mapping.opcode,
        typeTxn: input.mapping.typeTxn,
        amountMajor: input.mapping.amountMajor,
        refTxnId,
        status: CORE_TOPUP_JOB_STATUS.PENDING,
        cartPurchaseId: input.cartPurchaseId ?? null,
        voucherId: input.voucherId ?? null,
        activationRequestId: input.activationRequestId ?? null,
      },
      select: { id: true, refTxnId: true, status: true },
    });

    return {
      ok: true,
      jobId: job.id,
      refTxnId: job.refTxnId,
      status: job.status as CoreTopupJobStatus,
      created: true,
    };
  } catch (err) {
    // Concurrent enqueue for same purchase: prefer the existing in-flight row.
    if (input.idempotentOnPurchase && input.cartPurchaseId) {
      const existing = await prisma.coreTopupJob.findFirst({
        where: {
          cartPurchaseId: input.cartPurchaseId,
          status: {
            in: [
              CORE_TOPUP_JOB_STATUS.PENDING,
              CORE_TOPUP_JOB_STATUS.SUBMITTED,
              CORE_TOPUP_JOB_STATUS.PROCESSING,
              CORE_TOPUP_JOB_STATUS.SUCCESS,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, refTxnId: true, status: true },
      });
      if (existing) {
        return {
          ok: true,
          jobId: existing.id,
          refTxnId: existing.refTxnId,
          status: existing.status as CoreTopupJobStatus,
          created: false,
        };
      }
    }
    const message = err instanceof Error ? err.message : "enqueue_failed";
    return { ok: false, error: message };
  }
}

/**
 * Helper: resolve mapping from portal plan fields, then enqueue.
 * Returns mapping_incomplete when SKU map is not filled yet.
 */
export async function enqueueCoreTopupForPlan(input: {
  mobile: string;
  networkSlug: string;
  planSku?: string | null;
  priceCents?: number | null;
  amountMajorOverride?: number;
  cartPurchaseId?: string | null;
  voucherId?: string | null;
  activationRequestId?: string | null;
}): Promise<EnqueueCoreTopupResult | { ok: false; error: "mapping_incomplete" }> {
  let mapping = resolveCoreSkuMapping({
    networkSlug: input.networkSlug,
    planSku: input.planSku,
    priceCents: input.priceCents,
  });

  if (!mapping && input.amountMajorOverride != null && Number.isFinite(input.amountMajorOverride)) {
    const network = input.networkSlug.trim().toLowerCase();
    if (network === "three_uk" || network === "three") {
      mapping = threeUkBundleMapping(input.amountMajorOverride);
    }
  }

  if (!mapping) {
    return { ok: false, error: "mapping_incomplete" };
  }

  return enqueueCoreTopup({
    mobile: input.mobile,
    mapping,
    cartPurchaseId: input.cartPurchaseId,
    voucherId: input.voucherId,
    activationRequestId: input.activationRequestId,
    idempotentOnPurchase: true,
  });
}

/**
 * Claim PENDING → SUBMITTED, then call Core (or simulate).
 * Safe to retry: non-PENDING jobs are not re-sent to Core.
 */
export async function submitCoreTopupJob(jobId: string): Promise<SubmitCoreTopupResult> {
  const config = getCoreConfig();
  if (!config) {
    return { ok: false, jobId, error: "core_not_configured", status: CORE_TOPUP_JOB_STATUS.PENDING };
  }

  const existing = await prisma.coreTopupJob.findUnique({ where: { id: jobId } });
  if (!existing) {
    return { ok: false, jobId, error: "job_not_found", status: CORE_TOPUP_JOB_STATUS.FAILED };
  }

  if (isCoreTopupTerminalStatus(existing.status)) {
    return {
      ok: true,
      jobId,
      status: existing.status as CoreTopupJobStatus,
      coreTransactionId: existing.coreTransactionId,
      simulated: config.simulate,
    };
  }

  if (isCoreTopupInFlightOrDone(existing.status) && existing.status !== CORE_TOPUP_JOB_STATUS.PENDING) {
    // SUBMITTED / PROCESSING — already sent; wait for callback or manual sync.
    return {
      ok: true,
      jobId,
      status: existing.status as CoreTopupJobStatus,
      coreTransactionId: existing.coreTransactionId,
      simulated: config.simulate,
    };
  }

  const claimNow = new Date();
  const claimed = await prisma.coreTopupJob.updateMany({
    where: { id: jobId, status: CORE_TOPUP_JOB_STATUS.PENDING },
    data: {
      status: CORE_TOPUP_JOB_STATUS.SUBMITTED,
      lastAttemptAt: claimNow,
      attemptCount: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    const current = await prisma.coreTopupJob.findUnique({ where: { id: jobId } });
    const status = (current?.status as CoreTopupJobStatus) ?? CORE_TOPUP_JOB_STATUS.FAILED;
    if (status === CORE_TOPUP_JOB_STATUS.FAILED) {
      return { ok: false, jobId, error: "claim_lost", status };
    }
    return {
      ok: true,
      jobId,
      status,
      coreTransactionId: current?.coreTransactionId,
      simulated: config.simulate,
    };
  }

  const job = await prisma.coreTopupJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return { ok: false, jobId, error: "job_not_found", status: CORE_TOPUP_JOB_STATUS.FAILED };
  }

  const requestBody = {
    mobile: job.mobile,
    opcode: job.opcode,
    amount: job.amountMajor,
    type_txn: job.typeTxn,
    ref_txn_id: job.refTxnId,
  };

  try {
    const response = await coreCreateTransaction(config, requestBody);
    const nextStatus = mapCoreTxnStatusToJobStatus(Number(response.status));
    const now = new Date();

    await prisma.coreTopupJob.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        coreTransactionId: response.transaction_id ?? null,
        coreStatus: Number(response.status),
        coreMessage: response.message ?? null,
        requestPayload: JSON.stringify(requestBody),
        responsePayload: JSON.stringify(response),
        completedAt: nextStatus === CORE_TOPUP_JOB_STATUS.SUCCESS ? now : null,
        failedAt: nextStatus === CORE_TOPUP_JOB_STATUS.FAILED ? now : null,
      },
    });

    if (nextStatus === CORE_TOPUP_JOB_STATUS.FAILED) {
      return {
        ok: false,
        jobId,
        error: response.message ?? "core_transaction_failed",
        status: nextStatus,
      };
    }

    return {
      ok: true,
      jobId,
      status: nextStatus,
      coreTransactionId: response.transaction_id,
      simulated: config.simulate,
    };
  } catch (err) {
    const message =
      err instanceof CoreApiError
        ? `${err.message} (${err.status}): ${err.body.slice(0, 500)}`
        : err instanceof Error
          ? err.message
          : "unknown_error";

    await prisma.coreTopupJob.update({
      where: { id: jobId },
      data: {
        status: CORE_TOPUP_JOB_STATUS.FAILED,
        coreMessage: message,
        requestPayload: JSON.stringify(requestBody),
        failedAt: new Date(),
      },
    });

    return {
      ok: false,
      jobId,
      error: message,
      status: CORE_TOPUP_JOB_STATUS.FAILED,
    };
  }
}

/**
 * Apply Core callback (GET query: transaction_id, status, ref_txn_id).
 * Does not downgrade SUCCESS / MANUAL.
 */
export async function applyCoreCallback(input: {
  transactionId?: string | null;
  status?: string | number | null;
  refTxnId?: string | null;
}): Promise<{ ok: boolean; jobId?: string; status?: CoreTopupJobStatus; skipped?: string }> {
  const refTxnId = input.refTxnId?.trim();
  const transactionId = input.transactionId?.trim();

  const job = refTxnId
    ? await prisma.coreTopupJob.findUnique({ where: { refTxnId } })
    : transactionId
      ? await prisma.coreTopupJob.findFirst({ where: { coreTransactionId: transactionId } })
      : null;

  if (!job) {
    return { ok: true, skipped: "job_not_found" };
  }

  const code = Number(input.status);
  if (!Number.isFinite(code)) {
    return { ok: false, jobId: job.id, skipped: "invalid_status" };
  }

  const nextStatus = mapCoreTxnStatusToJobStatus(code);
  const now = new Date();
  const callbackPayload = JSON.stringify({
    transaction_id: transactionId,
    status: code,
    ref_txn_id: refTxnId,
    at: now.toISOString(),
  });

  if (isCoreTopupTerminalStatus(job.status)) {
    // Record callback for audit but do not overwrite a finished job.
    await prisma.coreTopupJob.update({
      where: { id: job.id },
      data: {
        callbackPayload,
        coreTransactionId: transactionId || job.coreTransactionId,
      },
    });
    return {
      ok: true,
      jobId: job.id,
      status: job.status as CoreTopupJobStatus,
      skipped: "terminal_status",
    };
  }

  await prisma.coreTopupJob.update({
    where: { id: job.id },
    data: {
      status: nextStatus,
      coreStatus: code,
      coreTransactionId: transactionId || job.coreTransactionId,
      callbackPayload,
      completedAt: nextStatus === CORE_TOPUP_JOB_STATUS.SUCCESS ? now : job.completedAt,
      failedAt: nextStatus === CORE_TOPUP_JOB_STATUS.FAILED ? now : job.failedAt,
    },
  });

  return { ok: true, jobId: job.id, status: nextStatus };
}

/** Admin / ops: mark fulfilled outside Core (manual top-up). */
export async function markCoreTopupManual(
  jobId: string,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const job = await prisma.coreTopupJob.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return { ok: false, error: "job_not_found" };

  await prisma.coreTopupJob.update({
    where: { id: jobId },
    data: {
      status: CORE_TOPUP_JOB_STATUS.MANUAL,
      coreMessage: note?.trim() || "Marked manual by admin",
      completedAt: new Date(),
    },
  });
  return { ok: true };
}
