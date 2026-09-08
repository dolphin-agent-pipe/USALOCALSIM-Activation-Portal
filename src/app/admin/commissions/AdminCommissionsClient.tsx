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
  paymentProvider: string;
  saleTransactionId: string;
  saleAmountCents: number | null;
  saleCurrency: string | null;
  soldAt: string;
  fundsAvailableAt: string | null;
  eligibleAt: string | null;
  serial: string | null;
  partner: { id: string; name: string };
  voucher: { code: string; inventoryStatus: string };
};

type SummaryRow = {
  status: string;
  count: number;
  totalBrlFormatted: string;
};

const STATUS_OPTIONS = [
  "",
  COMMISSION_STATUS.PENDING_FUNDS,
  COMMISSION_STATUS.ELIGIBLE,
  COMMISSION_STATUS.INCLUDED_IN_PAYOUT,
  COMMISSION_STATUS.PAID,
  COMMISSION_STATUS.CANCELLED,
];

export function AdminCommissionsClient() {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (partnerId) params.set("partnerId", partnerId);
    if (status) params.set("status", status);
    return fetch(`/api/admin/commissions?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load commissions");
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Partners", href: "/admin/partners" }, { label: "Commissions" }]}
        title="Commission ledger"
        description="Original voucher sales only. PENDING_FUNDS until settlement hold elapses, then ELIGIBLE for daily Wise payout (Phase D)."
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
                  <th className="px-4 py-3">Commission</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Sale txn</th>
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
                    <td className="px-4 py-2 tabular-nums font-medium">{r.amountBrlFormatted}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">{r.paymentProvider}</td>
                    <td className="px-4 py-2 font-mono text-xs max-w-[10rem] truncate" title={r.saleTransactionId}>
                      {r.saleTransactionId}
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
