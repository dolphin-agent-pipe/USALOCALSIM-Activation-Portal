"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CartNotice } from "@/components/CartNotice";
import { CartPhase1StepNav } from "@/components/CartPhase1StepNav";
import {
  CART_FLOW_CLASS,
  CART_PANEL_CLASS,
  CART_PRIMARY_BUTTON_CLASS,
  CART_SECONDARY_BUTTON_CLASS,
  CART_TEXT_INPUT_CLASS,
} from "@/lib/cart-panel";
import { isPixCheckoutUiEnabled } from "@/lib/pix-provider";

export type CartPlanRow = {
  id: string;
  name: string;
  dataAllowance: string;
  durationDays: number;
  priceCents: number;
  market: string;
};

const DEFAULT_BUNDLED_PACK_PAY_DOLLARS = "50.00";

function centsToUsdInput(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return DEFAULT_BUNDLED_PACK_PAY_DOLLARS;
  return (cents / 100).toFixed(2);
}

function parseUsdInputToCents(raw: string): number | null {
  let t = raw.trim().replace(/\s/g, "");
  if (t === "") return null;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  if (hasComma && !hasDot) {
    t = t.replace(",", ".");
  } else if (hasComma && hasDot) {
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) {
      t = t.replace(/\./g, "").replace(",", ".");
    } else {
      t = t.replace(/,/g, "");
    }
  } else {
    t = t.replace(/,/g, "");
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents;
}

function formatUsdDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Prepaid cart: name, email, USD pay amount, then Stripe / Mercado Pago. */
export function CartRegistrationAndPayment({
  plans,
  defaultPayCents,
  lockPayAmountCents,
}: {
  plans: CartPlanRow[];
  defaultPayCents?: number;
  lockPayAmountCents?: number;
}) {
  const t = useTranslations("cart");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [payDollars, setPayDollars] = useState(() => centsToUsdInput(defaultPayCents ?? 0));
  const [planId, setPlanId] = useState<string | null>(plans[0]?.id ?? null);
  const [loading, setLoading] = useState<"stripe" | "pix" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const parsedPayCents = useMemo(() => parseUsdInputToCents(payDollars), [payDollars]);
  const payAmountValid = parsedPayCents !== null && parsedPayCents > 0;
  const pixCheckoutEnabled = isPixCheckoutUiEnabled();
  const amountLocked = lockPayAmountCents != null && lockPayAmountCents > 0;
  const displayCents = amountLocked ? lockPayAmountCents : (parsedPayCents ?? defaultPayCents ?? 0);

  useEffect(() => {
    const id = plans[0]?.id ?? null;
    if (id) setPlanId(id);
  }, [plans]);

  async function checkoutStripe() {
    if (!planId) return;
    const cents = parseUsdInputToCents(payDollars);
    if (cents == null || cents <= 0) {
      setError(t("cartPayAmountInvalid"));
      return;
    }
    setError(null);
    setLoading("stripe");
    try {
      const res = await fetch("/api/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, email, customerName, payAmountCents: cents }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || !data.url) {
        setError(typeof data.error === "string" ? data.error : t("errorGeneric"));
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  }

  async function checkoutPix() {
    if (!planId) return;
    const cents = parseUsdInputToCents(payDollars);
    if (cents == null || cents <= 0) {
      setError(t("cartPayAmountInvalid"));
      return;
    }
    setError(null);
    setLoading("pix");
    try {
      const res = await fetch("/api/cart/checkout/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, email, customerName, payAmountCents: cents }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (res.status === 404) {
        setError(t("mercadopagoUnavailable"));
        return;
      }
      if (!res.ok || !data.url) {
        setError(typeof data.error === "string" ? data.error : t("errorGeneric"));
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  }

  const formReady = Boolean(customerName.trim() && email.trim() && planId && payAmountValid);

  return (
    <div className={CART_FLOW_CLASS}>
      <div className={`${CART_PANEL_CLASS} cart-flow-panel--checkout`}>
        <CartPhase1StepNav currentStep={2} embedded variant="compact" />

        <header className="cart-flow-header cart-flow-header--plain">
          <h1 className="cart-flow-title">{t("registerPayTitle")}</h1>
          <p className="cart-flow-subtitle">{t("registerPaySubtitle")}</p>
        </header>

        <div className="cart-flow-body">
          {selectedPlan ? (
            <section className="cart-flow-order-compact" aria-label={t("registerPaymentHeading")}>
              <div className="cart-flow-order-compact-main">
                <p className="cart-flow-plan-name">{selectedPlan.name}</p>
                <p className="cart-flow-order-compact-meta">
                  {selectedPlan.dataAllowance}
                  <span aria-hidden> · </span>
                  {t("registerPackDurationDays", { days: selectedPlan.durationDays })}
                </p>
              </div>
              {amountLocked ? (
                <p className="cart-flow-order-compact-total">{formatUsdDisplay(displayCents)}</p>
              ) : (
                <div className="cart-flow-field cart-flow-order-compact-amount">
                  <label className="cart-flow-field-label" htmlFor="cart-pay-usd">
                    {t("cartPayAmountLabel")}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                      $
                    </span>
                    <input
                      id="cart-pay-usd"
                      type="text"
                      inputMode="decimal"
                      autoComplete="transaction-amount"
                      value={payDollars}
                      onChange={(e) => setPayDollars(e.target.value)}
                      className={`${CART_TEXT_INPUT_CLASS} py-2 pl-7 pr-3 font-semibold tabular-nums`}
                      placeholder={DEFAULT_BUNDLED_PACK_PAY_DOLLARS}
                    />
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <div className="cart-flow-fields-row">
            <div className="cart-flow-field">
              <label className="cart-flow-field-label" htmlFor="cart-name">
                {t("customerNameLabel")}
              </label>
              <input
                id="cart-name"
                type="text"
                autoComplete="name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={CART_TEXT_INPUT_CLASS}
              />
            </div>
            <div className="cart-flow-field">
              <label className="cart-flow-field-label" htmlFor="cart-email">
                {t("emailLabel")}
              </label>
              <input
                id="cart-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={CART_TEXT_INPUT_CLASS}
              />
            </div>
          </div>

          {error ? <CartNotice variant="error">{error}</CartNotice> : null}

          <div className="cart-flow-pay-block">
            <button
              type="button"
              className={CART_PRIMARY_BUTTON_CLASS}
              disabled={loading !== null || !formReady}
              onClick={() => void checkoutStripe()}
            >
              {loading === "stripe" ? t("paying") : t("payWithStripe")}
            </button>
            {pixCheckoutEnabled ? (
              <button
                type="button"
                className={CART_SECONDARY_BUTTON_CLASS}
                disabled={loading !== null || !formReady}
                onClick={() => void checkoutPix()}
              >
                {loading === "pix" ? t("paying") : t("payWithMercadoPago")}
              </button>
            ) : null}
            <p className="cart-flow-pay-methods-note">{t("registerSecurePayHint")}</p>
          </div>
        </div>

        <footer className="cart-flow-footer">
          <Link href="/cart" className="cart-flow-footer-link">
            {t("backCart")}
          </Link>
        </footer>
      </div>
    </div>
  );
}
