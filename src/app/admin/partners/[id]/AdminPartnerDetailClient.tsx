"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/AdminPageChrome";
import { AdminFeedbackBanner } from "@/components/AdminFeedbackBanner";
import { ADMIN_REFRESH_EVENT } from "@/components/AdminPageRefreshButton";
import { formatBrlFromCents, parseBrlToCents } from "@/lib/partner-inventory";

type Store = { id: string; name: string; code: string | null; active: boolean };
type LinkedUser = {
  id: string;
  role: string;
  user: { id: string; email: string | null; name: string | null; role: string };
};
type PayoutProfile = {
  legalType: string;
  accountHolderName: string;
  taxId: string;
  taxIdType: string;
  bankCode: string | null;
  branchCode: string | null;
  accountNumber: string | null;
  accountType: string | null;
  addressLine1: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostCode: string | null;
  addressCountry: string | null;
  wiseRecipientId: string | null;
};

type PartnerDetail = {
  id: string;
  name: string;
  countryCode: string;
  email: string | null;
  phoneE164: string | null;
  defaultCommissionCents: number;
  active: boolean;
  payoutProfile: PayoutProfile | null;
  stores: Store[];
  users: LinkedUser[];
  _count: { vouchers: number };
};

type DealerOption = { id: string; email: string | null; name: string | null; role: string };

const emptyProfile = {
  legalType: "PRIVATE" as "PRIVATE" | "BUSINESS",
  accountHolderName: "",
  taxId: "",
  bankCode: "",
  branchCode: "",
  accountNumber: "",
  accountType: "CHECKING",
  addressLine1: "",
  addressCity: "",
  addressState: "",
  addressPostCode: "",
  addressCountry: "BR",
};

export function AdminPartnerDetailClient({ partnerId }: { partnerId: string }) {
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [commissionBrl, setCommissionBrl] = useState("60");
  const [active, setActive] = useState(true);

  const [profile, setProfile] = useState(emptyProfile);
  const [storeName, setStoreName] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [linkUserId, setLinkUserId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      fetch(`/api/admin/partners/${partnerId}`).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load partner");
        return data as PartnerDetail;
      }),
      fetch("/api/admin/users").then(async (res) => {
        const data = await res.json();
        return Array.isArray(data) ? (data as DealerOption[]) : [];
      }),
    ])
      .then(([p, users]) => {
        setPartner(p);
        setName(p.name);
        setEmail(p.email ?? "");
        setPhone(p.phoneE164 ?? "");
        setCommissionBrl(String(p.defaultCommissionCents / 100));
        setActive(p.active);
        if (p.payoutProfile) {
          setProfile({
            legalType: (p.payoutProfile.legalType as "PRIVATE" | "BUSINESS") || "PRIVATE",
            accountHolderName: p.payoutProfile.accountHolderName ?? "",
            taxId: p.payoutProfile.taxId ?? "",
            bankCode: p.payoutProfile.bankCode ?? "",
            branchCode: p.payoutProfile.branchCode ?? "",
            accountNumber: p.payoutProfile.accountNumber ?? "",
            accountType: p.payoutProfile.accountType ?? "CHECKING",
            addressLine1: p.payoutProfile.addressLine1 ?? "",
            addressCity: p.payoutProfile.addressCity ?? "",
            addressState: p.payoutProfile.addressState ?? "",
            addressPostCode: p.payoutProfile.addressPostCode ?? "",
            addressCountry: p.payoutProfile.addressCountry ?? "BR",
          });
        } else {
          setProfile(emptyProfile);
        }
        setDealers(users.filter((u) => u.role === "dealer" || u.role === "admin"));
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [partnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [load]);

  async function savePartner(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const cents = parseBrlToCents(commissionBrl);
    if (cents == null) {
      setError("Invalid commission amount.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email || null,
          phoneE164: phone || null,
          defaultCommissionCents: cents,
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage("Partner updated. Commission changes apply to future sales only.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/payout-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payout profile save failed");
      setMessage(
        "Bank payout profile saved (Wise BR bank — not PIX). Wise recipient will be created in the payout phase.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payout profile save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addStore(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/admin/partners/${partnerId}/stores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: storeName, code: storeCode || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not add store");
      return;
    }
    setStoreName("");
    setStoreCode("");
    setMessage(`Store “${data.name}” added.`);
    await load();
  }

  async function linkUser(e: React.FormEvent) {
    e.preventDefault();
    if (!linkUserId) return;
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/admin/partners/${partnerId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: linkUserId, role: "dealer" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not link user");
      return;
    }
    setLinkUserId("");
    setMessage("Dealer user linked (ops only — payout beneficiary remains the Partner).");
    await load();
  }

  async function unlinkUser(userId: string) {
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/admin/partners/${partnerId}/users`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not unlink user");
      return;
    }
    setMessage("User unlinked.");
    await load();
  }

  if (loading && !partner) {
    return <p className="p-2 text-sm text-slate-500">Loading partner…</p>;
  }

  if (!partner) {
    return (
      <div className="space-y-4">
        <AdminFeedbackBanner variant="error" message={error || "Partner not found"} />
        <Link href="/admin/partners" className="text-sm text-brand-purple hover:underline">
          ← Back to partners
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          { label: "Partners", href: "/admin/partners" },
          { label: partner.name },
        ]}
        title={partner.name}
        description={`${partner._count.vouchers} assigned voucher(s) · default ${formatBrlFromCents(partner.defaultCommissionCents)}`}
      />

      {error ? <AdminFeedbackBanner variant="error" message={error} /> : null}
      {message ? <AdminFeedbackBanner variant="success" message={message} /> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Partner details</h2>
        <form onSubmit={savePartner} className="mt-4 grid gap-3 sm:grid-cols-2">
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
            <span className="mb-1 block text-slate-600">Default commission (BRL)</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={commissionBrl}
              onChange={(e) => setCommissionBrl(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Email</span>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Phone (E.164)</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (inactive partners cannot receive new assignments)
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save partner"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Wise payout profile (Brazilian bank)</h2>
        <p className="mt-1 text-xs text-slate-500">
          PIX keys are not used for partner commission payouts. Collect bank + CPF/CNPJ for Wise API.
        </p>
        <form onSubmit={saveProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Legal type</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.legalType}
              onChange={(e) =>
                setProfile((p) => ({ ...p, legalType: e.target.value as "PRIVATE" | "BUSINESS" }))
              }
            >
              <option value="PRIVATE">Individual (CPF)</option>
              <option value="BUSINESS">Business (CNPJ)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Account holder name</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.accountHolderName}
              onChange={(e) => setProfile((p) => ({ ...p, accountHolderName: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">CPF / CNPJ</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.taxId}
              onChange={(e) => setProfile((p) => ({ ...p, taxId: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Bank code (COMPE)</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.bankCode}
              onChange={(e) => setProfile((p) => ({ ...p, bankCode: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Branch (agência)</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.branchCode}
              onChange={(e) => setProfile((p) => ({ ...p, branchCode: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Account number</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.accountNumber}
              onChange={(e) => setProfile((p) => ({ ...p, accountNumber: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Account type</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.accountType}
              onChange={(e) => setProfile((p) => ({ ...p, accountType: e.target.value }))}
            >
              <option value="CHECKING">Checking</option>
              <option value="SAVINGS">Savings</option>
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Address line</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.addressLine1}
              onChange={(e) => setProfile((p) => ({ ...p, addressLine1: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">City</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.addressCity}
              onChange={(e) => setProfile((p) => ({ ...p, addressCity: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">State (UF)</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.addressState}
              onChange={(e) => setProfile((p) => ({ ...p, addressState: e.target.value }))}
              maxLength={2}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Postcode</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.addressPostCode}
              onChange={(e) => setProfile((p) => ({ ...p, addressPostCode: e.target.value }))}
            />
          </label>
          <div className="sm:col-span-2">
            {partner.payoutProfile?.wiseRecipientId ? (
              <p className="mb-2 text-xs text-slate-500">
                Wise recipient ID: {partner.payoutProfile.wiseRecipientId}
              </p>
            ) : (
              <p className="mb-2 text-xs text-amber-700">
                No Wise recipient ID yet (created automatically in the Wise payout phase).
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save bank profile"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Stores / locations (optional)</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {partner.stores.length === 0 ? (
            <li className="text-slate-500">No stores yet.</li>
          ) : (
            partner.stores.map((s) => (
              <li key={s.id}>
                {s.name}
                {s.code ? ` (${s.code})` : ""}
                {!s.active ? " — inactive" : ""}
              </li>
            ))
          )}
        </ul>
        <form onSubmit={addStore} className="mt-4 flex flex-wrap gap-2">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Store name"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            required
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Code (optional)"
            value={storeCode}
            onChange={(e) => setStoreCode(e.target.value)}
          />
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Add store
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Linked dealer users (ops)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Payouts go to the Partner bank profile, not to these users.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {partner.users.length === 0 ? (
            <li className="text-slate-500">No linked users.</li>
          ) : (
            partner.users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2">
                <span>
                  {u.user.email || u.user.name || u.user.id}
                  <span className="text-slate-500"> · {u.role}</span>
                </span>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => void unlinkUser(u.user.id)}
                >
                  Unlink
                </button>
              </li>
            ))
          )}
        </ul>
        <form onSubmit={linkUser} className="mt-4 flex flex-wrap gap-2">
          <select
            className="min-w-[16rem] rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={linkUserId}
            onChange={(e) => setLinkUserId(e.target.value)}
            required
          >
            <option value="">Select user…</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.email || d.name || d.id}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Link user
          </button>
        </form>
      </section>

      <p className="text-sm">
        <Link href="/admin/partners/assign" className="font-medium text-brand-purple hover:underline">
          Assign serials to this partner →
        </Link>
        {" · "}
        <Link href="/admin/partners" className="text-slate-600 hover:underline">
          All partners
        </Link>
      </p>
    </div>
  );
}
