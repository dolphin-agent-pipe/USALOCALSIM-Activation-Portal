"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/AdminPageChrome";
import { AdminFeedbackBanner } from "@/components/AdminFeedbackBanner";
import { ADMIN_REFRESH_EVENT } from "@/components/AdminPageRefreshButton";
import { formatBrlFromCents, parseBrlToCents } from "@/lib/partner-inventory";

type PartnerRow = {
  id: string;
  name: string;
  countryCode: string;
  email: string | null;
  defaultCommissionCents: number;
  active: boolean;
  createdAt: string;
  payoutProfile: {
    id: string;
    taxIdType: string;
    taxId: string;
    wiseRecipientId: string | null;
    accountHolderName: string;
  } | null;
  _count: { vouchers: number; stores: number; users: number };
};

export function AdminPartnersClient() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [commissionBrl, setCommissionBrl] = useState("60");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/admin/partners")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load partners");
        setPartners(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((e: Error) => {
        setPartners([]);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const cents = parseBrlToCents(commissionBrl);
    if (cents == null) {
      setError("Invalid commission amount.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email || null,
          defaultCommissionCents: cents,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setName("");
      setEmail("");
      setCommissionBrl("60");
      setMessage(`Partner “${data.name}” created.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Partners"
        description="Distributors who earn BRL commission on assigned voucher sales. Default commission is R$60 (configurable)."
      />

      {error ? <AdminFeedbackBanner variant="error" message={error} /> : null}
      {message ? <AdminFeedbackBanner variant="success" message={message} /> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Create partner</h2>
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Name</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Email (optional)</span>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Default commission (BRL)</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={commissionBrl}
              onChange={(e) => setCommissionBrl(e.target.value)}
              placeholder="60"
              required
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create partner"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            All partners {loading ? "" : `(${partners.length})`}
          </h2>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : partners.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No partners yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Commission</th>
                  <th className="px-4 py-3">Vouchers</th>
                  <th className="px-4 py-3">Bank profile</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        {p.countryCode}
                        {p.email ? ` · ${p.email}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatBrlFromCents(p.defaultCommissionCents)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{p._count.vouchers}</td>
                    <td className="px-4 py-3">
                      {p.payoutProfile ? (
                        <span className="text-emerald-700">
                          {p.payoutProfile.taxIdType} on file
                        </span>
                      ) : (
                        <span className="text-amber-700">Missing</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.active ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/partners/${p.id}`}
                        className="font-medium text-brand-purple hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm text-slate-600">
        <Link href="/admin/partners/assign" className="font-medium text-brand-purple hover:underline">
          Assign voucher serials →
        </Link>
      </p>
    </div>
  );
}
