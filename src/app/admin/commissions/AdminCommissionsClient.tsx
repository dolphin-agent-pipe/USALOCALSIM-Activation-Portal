"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/AdminPageChrome";
import { AdminFeedbackBanner } from "@/components/AdminFeedbackBanner";
import { ADMIN_REFRESH_EVENT } from "@/components/AdminPageRefreshButton";
import { COMMISSION_STATUS } from "@/lib/commission-status";

type PartnerOption = { id: string; name: string };

type CommissionRow = {
  id: string;
  status: string;
  amountBrlCents: number;
  amountBrlFormatted: string;
  offsetAppliedBrlFormatted?: string;
  netPayableBrlFormatted?: string;
  paymentProvider: string;
  saleTransactionId: string;
  saleAmountCents: number | null;
  saleCurrency: string | null;
  soldAt: string;
  serial: string | null;
  partner: { id: string; name: string };
  voucher: { code: string; inventoryStatus: string };
};

type ChargebackRow = {
  id: string;
  status: string;
  reason: string;
  originalBrlFormatted: string;
  remainingBrlFormatted: string;
  voucherSerialSnapshot: string | null;
  partner: { id: string; name: string };
  sourceCommission: {
    id: string;
    saleTransactionId: string;
    status: string;
  };
  allocations: Array<{
    amountBrlCents: number;
    newCommission: { voucherSerialSnapshot: string | null };
  }>;
};

type SummaryRow = { status: string; count: number; totalBrlFormatted: string };

const STATUS_OPTIONS = [
  "",
  COMMISSION_STATUS.PENDING_FUNDS,
  COMMISSION_STATUS.ELIGIBLE,
  COMMISSION_STATUS.OFFSET_PARTIAL,
  COMMISSION_STATUS.OFFSET_SETTLED,
  COMMISSION_STATUS.INCLUDED_IN_PAYOUT,
  COMMISSION_STATUS.PAID,
  COMMISSION_STATUS.CANCELLED,
  COMMISSION_STATUS.CHARGEBACK_ADJUSTMENT,
  COMMISSION_STATUS.ADMIN_REVIEW,
];

const REFUNDABLE = new Set([
  COMMISSION_STATUS.PENDING_FUNDS,
  COMMISSION_STATUS.ELIGIBLE,
  COMMISSION_STATUS.OFFSET_PARTIAL,
  COMMISSION_STATUS.INCLUDED_IN_PAYOUT,
  COMMISSION_STATUS.PAID,
]);

export function AdminCommissionsClient() {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [chargebacks, setChargebacks] = useState<ChargebackRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (partnerId) params.set("partnerId", partnerId);
    if (status) params.set("status", status);
    const cbParams = new URLSearchParams();
    if (partnerId) cbParams.set("partnerId", partnerId);

    return Promise.all([
      fetch(`/api/admin/commissions?${params.toString()}`).then((res) => res.json()),
      fetch(`/api/admin/commissions/chargebacks?${cbParams.toString()}`).then((res) => res.json()),
    ])
      .then(([commData, cbData]) => {
        if (commData.error) throw new Error(commData.error);
        setRows(commData.rows ?? []);
        setSummary(commData.summary ?? []);
        setChargebacks(cbData.rows ?? []);
        setError(null);
      })
      .catch((e: Error) => {
        setRows([]);
        setSummary([]);
        setChargebacks([]);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [partnerId, status]);

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
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [load]);

  async function handlePromote() {
    setPromoting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/commissions/promote-eligible", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Promote failed");
      setMessage(`Promoted ${data.promoted ?? 0} commission(s) to ELIGIBLE.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setPromoting(false);
    }
  }

  async function handleRefund(commissionId: string, adminReview = false) {
    setRefundingId(commissionId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/commissions/refund-chargeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionId, adminReview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refund/chargeback failed");
      setMessage(
        adminReview
          ? "Commission flagged for admin review."
          : `Processed: ${data.action}${data.notification ? ` — ${data.notification}` : ""}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund/chargeback failed");
    } finally {
      setRefundingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Partners", href: "/admin/partners" }, { label: "Commissions" }]}
        title="Commission ledger"
        description="Refunds cancel unpaid commissions; paid commissions create chargeback balances offset against future sales."
        rightActions={
          <button
            type="button"
            onClick={() => void handlePromote()}
            disabled={promoting}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {promoting ? "Promoting…" : "Run settlement promotion"}
          </button>
        }
      />

      {error ? <AdminFeedbackBanner variant="error" message={error} /> : null}
      {message ? <AdminFeedbackBanner variant="success" message={message} /> : null}

      {summary.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {summary.map((s) => (
            <span
              key={s.status}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
            >
              {s.status}: {s.count} · {s.totalBrlFormatted}
            </span>
          ))}
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Partner</span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
            >
              <option value="">All</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Status</span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s || "all"} value={s}>{s || "All"}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No commission records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Sold</th>
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3">Serial</th>
                  <th className="px-4 py-3">Gross</th>
                  <th className="px-4 py-3">Net payable</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {new Date(r.soldAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/partners/${r.partner.id}`}
                        className="text-brand-purple hover:underline"
                      >
                        {r.partner.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.serial ?? r.voucher.code}</td>
                    <td className="px-4 py-2 tabular-nums">{r.amountBrlFormatted}</td>
                    <td className="px-4 py-2 tabular-nums font-medium">
                      {r.netPayableBrlFormatted ?? r.amountBrlFormatted}
                      {r.offsetAppliedBrlFormatted && r.offsetAppliedBrlFormatted !== "R$ 0,00" ? (
                        <span className="block text-xs text-slate-500">
                          offset {r.offsetAppliedBrlFormatted}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{r.status}</span>
                    </td>
                    <td className="px-4 py-2">
                      {(REFUNDABLE as Set<string>).has(r.status) ? (
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={refundingId === r.id}
                            className="text-xs text-red-700 hover:underline disabled:opacity-50"
                            onClick={() => void handleRefund(r.id)}
                          >
                            Refund
                          </button>
                          <button
                            type="button"
                            disabled={refundingId === r.id}
                            className="text-xs text-amber-700 hover:underline disabled:opacity-50"
                            onClick={() => void handleRefund(r.id, true)}
                          >
                            Admin review
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Chargeback balances</h2>
          <p className="text-xs text-slate-500">
            Open balances are offset automatically when new commissions become eligible.
          </p>
        </div>
        {chargebacks.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No chargeback balances.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3">Old voucher</th>
                  <th className="px-4 py-3">Original</th>
                  <th className="px-4 py-3">Remaining</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Offsets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {chargebacks.map((cb) => (
                  <tr key={cb.id}>
                    <td className="px-4 py-2">{cb.partner.name}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {cb.voucherSerialSnapshot ?? "—"}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{cb.originalBrlFormatted}</td>
                    <td className="px-4 py-2 tabular-nums font-medium">{cb.remainingBrlFormatted}</td>
                    <td className="px-4 py-2 text-xs">{cb.status}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {cb.allocations.length === 0
                        ? "—"
                        : cb.allocations
                            .map(
                              (a) =>
                                `${a.newCommission.voucherSerialSnapshot ?? "?"} (${(a.amountBrlCents / 100).toFixed(2)})`,
                            )
                            .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
