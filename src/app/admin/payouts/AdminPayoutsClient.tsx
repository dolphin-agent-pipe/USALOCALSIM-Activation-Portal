"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/AdminPageChrome";
import { AdminFeedbackBanner } from "@/components/AdminFeedbackBanner";
import { ADMIN_REFRESH_EVENT } from "@/components/AdminPageRefreshButton";
import { PAYOUT_BATCH_STATUS } from "@/lib/payout-status";

type PartnerOption = { id: string; name: string };

type PayoutRow = {
  id: string;
  status: string;
  payoutDate: string;
  totalBrlFormatted: string;
  commissionCount: number;
  partner: { id: string; name: string };
  latestAttempt: {
    id: string;
    status: string;
    wiseTransferId: string | null;
    wiseQuoteId: string | null;
    wiseStatusMessage: string | null;
  } | null;
};

type CommissionLine = {
  id: string;
  status: string;
  serial: string | null;
  saleTransactionId: string;
  netPayableBrlFormatted: string;
  soldAt: string;
};

type BatchDetail = {
  batch: {
    id: string;
    status: string;
    payoutDate: string;
    totalBrlFormatted: string;
    partner: { id: string; name: string };
  };
  attempts: Array<{
    id: string;
    status: string;
    wiseTransferId: string | null;
    wiseQuoteId: string | null;
    wiseStatusMessage: string | null;
  }>;
  commissions: CommissionLine[];
};

type SummaryRow = { status: string; count: number; totalBrlFormatted: string };

type HealthSnapshot = {
  flags: {
    payoutsEnabled: boolean;
    payoutsSimulate: boolean;
    wiseConfigured: boolean;
    alertEmailsConfigured: boolean;
  };
  counts: {
    eligible: number;
    processingBatches: number;
    failedBatchesLast7d: number;
  };
  locks: {
    dailyPayoutToday: boolean;
  };
};

const STATUS_OPTIONS = ["", ...Object.values(PAYOUT_BATCH_STATUS)];

export function AdminPayoutsClient() {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (partnerId) params.set("partnerId", partnerId);
    if (status) params.set("status", status);

    return fetch(`/api/admin/payouts?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows ?? []);
        setSummary(data.summary ?? []);
        setError(null);
      })
      .catch((e: Error) => {
        setRows([]);
        setSummary([]);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [partnerId, status]);

  const loadHealth = useCallback(() => {
    return fetch("/api/admin/payouts/health")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setHealth(data as HealthSnapshot);
      })
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    void fetch("/api/admin/partners")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPartners(data.map((p: PartnerOption) => ({ id: p.id, name: p.name })));
        }
      })
      .catch(() => setPartners([]));
  }, []);

  useEffect(() => {
    void load();
    void loadHealth();
  }, [load, loadHealth]);

  useEffect(() => {
    const onRefresh = () => {
      void load();
      void loadHealth();
    };
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [load]);

  async function loadDetail(batchId: string) {
    const res = await fetch(`/api/admin/payouts/${batchId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load batch");
    setDetail(data as BatchDetail);
  }

  async function toggleExpand(batchId: string) {
    if (expandedId === batchId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(batchId);
    try {
      await loadDetail(batchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load batch");
    }
  }

  async function handleRunDaily() {
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (partnerId) params.set("partnerId", partnerId);
      const res = await fetch(`/api/admin/payouts/run-daily?${params.toString()}`, { method: "POST" });
      const data = await res.json();
      if (res.status === 409 && data.locked) {
        setMessage("Daily payout already running (cron lock held). Try again later.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Daily payout failed");
      if (!data.enabled) {
        setMessage("Payouts are disabled (set COMMISSION_PAYOUTS_ENABLED=true).");
      } else {
        const paid = (data.partners ?? []).filter((p: { status: string }) =>
          ["paid", "simulated", "processing"].includes(p.status),
        ).length;
        const failed = (data.partners ?? []).filter((p: { status: string }) => p.status === "failed").length;
        setMessage(`Daily run for ${data.payoutDate}: ${paid} sent/processing, ${failed} failed.`);
      }
      await load();
      await loadHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Daily payout failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleSync(batchId: string) {
    setSyncingId(batchId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payouts/${batchId}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMessage(`Wise sync: ${data.status}`);
      if (expandedId === batchId) await loadDetail(batchId);
      await load();
      await loadHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Partners", href: "/admin/partners" }, { label: "Payouts" }]}
        title="Daily payout batches"
        description="Consolidated Wise BRL transfers per partner per UTC day. Commissions are marked PAID only after Wise confirms delivery."
        rightActions={
          <button
            type="button"
            onClick={() => void handleRunDaily()}
            disabled={running}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {running ? "Running…" : "Run daily payouts"}
          </button>
        }
      />

      {error ? <AdminFeedbackBanner variant="error" message={error} /> : null}
      {message ? <AdminFeedbackBanner variant="success" message={message} /> : null}

      {health ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span className="font-medium">System health:</span> payouts{" "}
          {health.flags.payoutsEnabled ? "enabled" : "disabled"}
          {health.flags.payoutsSimulate ? " (simulate)" : ""} · Wise{" "}
          {health.flags.wiseConfigured ? "configured" : "not configured"} ·{" "}
          {health.counts.eligible} eligible · {health.counts.processingBatches} processing ·{" "}
          {health.counts.failedBatchesLast7d} failed (7d)
          {health.locks.dailyPayoutToday ? " · daily cron lock active" : ""}
        </div>
      ) : null}

      {summary.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {summary.map((s) => (
            <span
              key={s.status}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {s.status}: {s.count} ({s.totalBrlFormatted})
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Partner</span>
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5"
          >
            <option value="">All partners</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || "all"} value={s}>{s || "All statuses"}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Vouchers</th>
              <th className="px-4 py-3">Wise transfer</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No payout batches yet.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">{row.payoutDate}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/partners/${row.partner.id}`} className="text-blue-600 hover:underline">
                        {row.partner.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">{row.status}</td>
                    <td className="px-4 py-3">{row.totalBrlFormatted}</td>
                    <td className="px-4 py-3">{row.commissionCount}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.latestAttempt?.wiseTransferId ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleExpand(row.id)}
                          className="text-blue-600 hover:underline"
                        >
                          {expandedId === row.id ? "Hide" : "Details"}
                        </button>
                        <a
                          href={`/api/admin/payouts/${row.id}/export`}
                          className="text-blue-600 hover:underline"
                        >
                          Export
                        </a>
                        {row.status === PAYOUT_BATCH_STATUS.PROCESSING ? (
                          <button
                            type="button"
                            disabled={syncingId === row.id}
                            onClick={() => void handleSync(row.id)}
                            className="text-blue-600 hover:underline disabled:opacity-60"
                          >
                            {syncingId === row.id ? "Syncing…" : "Sync Wise"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expandedId === row.id && detail?.batch.id === row.id ? (
                    <tr key={`${row.id}-detail`} className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="space-y-3">
                          <p className="text-xs text-slate-600">
                            Quote: {detail.attempts[0]?.wiseQuoteId ?? "—"} · Attempt status:{" "}
                            {detail.attempts[0]?.status ?? "—"}
                            {detail.attempts[0]?.wiseStatusMessage
                              ? ` · ${detail.attempts[0].wiseStatusMessage}`
                              : ""}
                          </p>
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-slate-600">
                                <th className="py-1 pr-4 text-left">Serial</th>
                                <th className="py-1 pr-4 text-left">Sale ID</th>
                                <th className="py-1 pr-4 text-left">Net BRL</th>
                                <th className="py-1 pr-4 text-left">Status</th>
                                <th className="py-1 text-left">Sold</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.commissions.map((c) => (
                                <tr key={c.id}>
                                  <td className="py-1 pr-4 font-mono">{c.serial ?? "—"}</td>
                                  <td className="py-1 pr-4 font-mono">{c.saleTransactionId}</td>
                                  <td className="py-1 pr-4">{c.netPayableBrlFormatted}</td>
                                  <td className="py-1 pr-4">{c.status}</td>
                                  <td className="py-1">{new Date(c.soldAt).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
