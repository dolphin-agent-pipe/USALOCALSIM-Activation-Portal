"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/AdminPageChrome";
import { AdminFeedbackBanner } from "@/components/AdminFeedbackBanner";
import { ADMIN_REFRESH_EVENT } from "@/components/AdminPageRefreshButton";

type PartnerOption = { id: string; name: string; active: boolean };
type StoreOption = { id: string; name: string; code: string | null; active: boolean };
type AssignmentRow = {
  id: string;
  action: string;
  batchLabel: string | null;
  serialFrom: string | null;
  serialTo: string | null;
  createdAt: string;
  partner: { id: string; name: string } | null;
  voucher: {
    id: string;
    code: string;
    inventoryStatus: string;
    prepaidCard: { serial: string } | null;
  };
};

export function AdminPartnerAssignClient() {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [history, setHistory] = useState<AssignmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [mode, setMode] = useState<"assign" | "unassign">("assign");
  const [partnerId, setPartnerId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [serialFrom, setSerialFrom] = useState("");
  const [serialTo, setSerialTo] = useState("");
  const [serialList, setSerialList] = useState("");
  const [batchLabel, setBatchLabel] = useState("");
  const [note, setNote] = useState("");

  const loadPartners = useCallback(() => {
    return fetch("/api/admin/partners")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPartners(
            data.map((p: PartnerOption) => ({
              id: p.id,
              name: p.name,
              active: p.active,
            })),
          );
        }
      })
      .catch(() => setPartners([]));
  }, []);

  const loadHistory = useCallback(() => {
    return fetch("/api/admin/partners/assign?limit=40")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setHistory(data);
      })
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    void loadPartners();
    void loadHistory();
  }, [loadPartners, loadHistory]);

  useEffect(() => {
    const onRefresh = () => {
      void loadPartners();
      void loadHistory();
    };
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [loadPartners, loadHistory]);

  useEffect(() => {
    if (!partnerId) {
      setStores([]);
      setStoreId("");
      return;
    }
    void fetch(`/api/admin/partners/${partnerId}/stores`)
      .then((res) => res.json())
      .then((data) => {
        setStores(Array.isArray(data) ? data : []);
        setStoreId("");
      })
      .catch(() => setStores([]));
  }, [partnerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const serials = serialList
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!serials.length && (!serialFrom.trim() || !serialTo.trim())) {
      setError("Enter a serial range or a list of serials.");
      return;
    }

    if (mode === "assign" && !partnerId) {
      setError("Select a partner to assign.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/partners/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: mode === "assign" ? partnerId : null,
          storeId: mode === "assign" && storeId ? storeId : null,
          serialFrom: serialFrom.trim() || null,
          serialTo: serialTo.trim() || null,
          serials: serials.length ? serials : undefined,
          batchLabel: batchLabel.trim() || null,
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assignment failed");

      setMessage(
        `${mode === "assign" ? "Assigned" : "Unassigned"} ${data.updated} of ${data.matched} matched card(s).` +
          (data.skippedLocked ? ` Skipped locked (sold/redeemed): ${data.skippedLocked}.` : "") +
          (data.skippedMissing ? ` Missing serials: ${data.skippedMissing}.` : ""),
      );
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          { label: "Partners", href: "/admin/partners" },
          { label: "Assign serials" },
        ]}
        title="Assign voucher serials"
        description="Vouchers start UNASSIGNED. Assign by prepaid card serial range or list. Sold/redeemed vouchers cannot be reassigned."
      />

      {error ? <AdminFeedbackBanner variant="error" message={error} /> : null}
      {message ? <AdminFeedbackBanner variant="success" message={message} /> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === "assign"}
                onChange={() => setMode("assign")}
              />
              Assign to partner
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === "unassign"}
                onChange={() => setMode("unassign")}
              />
              Return to UNASSIGNED
            </label>
          </div>

          {mode === "assign" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Partner</span>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {partners
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Store (optional)</span>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  disabled={!partnerId}
                >
                  <option value="">None</option>
                  {stores
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.code ? ` (${s.code})` : ""}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Serial from</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                value={serialFrom}
                onChange={(e) => setSerialFrom(e.target.value)}
                placeholder="USALO000001"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Serial to</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                value={serialTo}
                onChange={(e) => setSerialTo(e.target.value)}
                placeholder="USALO000050"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">
              Or paste serials (one per line or comma-separated)
            </span>
            <textarea
              className="min-h-[6rem] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              value={serialList}
              onChange={(e) => setSerialList(e.target.value)}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Batch label (optional)</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={batchLabel}
                onChange={(e) => setBatchLabel(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Note (optional)</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Working…" : mode === "assign" ? "Assign serials" : "Unassign serials"}
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Recent assignment history</h2>
        </div>
        {history.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No assignments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3">Serial</th>
                  <th className="px-4 py-3">Inventory</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{row.action}</td>
                    <td className="px-4 py-2">
                      {row.partner ? (
                        <Link
                          href={`/admin/partners/${row.partner.id}`}
                          className="text-brand-purple hover:underline"
                        >
                          {row.partner.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {row.voucher.prepaidCard?.serial || row.voucher.code}
                    </td>
                    <td className="px-4 py-2 text-xs">{row.voucher.inventoryStatus}</td>
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
