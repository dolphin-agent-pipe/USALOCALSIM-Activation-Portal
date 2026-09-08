"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CartNotice } from "@/components/CartNotice";
import { CartPhase1StepNav } from "@/components/CartPhase1StepNav";
import type { CartPlanRow } from "@/components/CartRegistrationAndPayment";
import { creditCheckoutProfileById, type CreditCheckoutProfileId } from "@/lib/credit-checkout-profile";
import { creditCheckoutDisplay } from "@/lib/credit-checkout-display";
import type { CoverageTier } from "@/lib/coverage-tier";
import { isPixCheckoutUiEnabled } from "@/lib/pix-provider";
import {
  CART_FLOW_CLASS,
  CART_PANEL_CLASS,
  CART_PRIMARY_BUTTON_CLASS,
  CART_SECONDARY_BUTTON_CLASS,
} from "@/lib/cart-panel";

/** Page 3 — payment method picker (voucher-profile aware). */
export function CreditPaymentOptions({
  profileId,
  plan,
  faceValueCents,
  checkoutEmail,
  checkoutCustomerName,
  coverageTier,
  cssModifierClass,
}: {
  profileId: CreditCheckoutProfileId;
  plan: CartPlanRow;
  faceValueCents: number;
  checkoutEmail: string | null;
  checkoutCustomerName: string;
  coverageTier?: CoverageTier;
  cssModifierClass?: string;
}) {
  const profile = creditCheckoutProfileById(profileId);
  const t = useTranslations(profile.i18nNamespace);
  const tCart = useTranslations("cart");
  const [loading, setLoading] = useState<"stripe" | "pix" | false>(false);
  const [error, setError] = useState<string | null>(null);
  const pixEnabled = isPixCheckoutUiEnabled();

  const display = useMemo(
    () => creditCheckoutDisplay(profileId, faceValueCents),
    [profileId, faceValueCents],
  );

  const brlPayCents = useMemo(() => {
    return profile.brlReferenceCentsForFaceValue?.(faceValueCents) ?? profile.brlReferenceCents;
  }, [profile, faceValueCents]);

  async function checkoutStripe() {
    setError(null);
    setLoading("stripe");
    try {
      const res = await fetch("/api/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          payAmountCents: faceValueCents,
          customerName: checkoutCustomerName,
          ...(checkoutEmail ? { email: checkoutEmail } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || !data.url) {
        setError(typeof data.error === "string" ? data.error : tCart("errorGeneric"));
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  async function checkoutPix() {
    if (!checkoutEmail?.trim()) {
      setError(tCart("errorGeneric"));
      return;
    }
    setError(null);
    setLoading("pix");
    try {
      const res = await fetch("/api/cart/checkout/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          payAmountCents: brlPayCents,
          customerName: checkoutCustomerName,
          email: checkoutEmail,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || !data.url) {
        setError(typeof data.error === "string" ? data.error : tCart("errorGeneric"));
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={CART_FLOW_CLASS}>
      <div className={`${CART_PANEL_CLASS} cart-flow-panel--checkout ${cssModifierClass ?? profile.cssModifierClass}`}>
        <CartPhase1StepNav currentStep={3} embedded variant="compact" />

        <header className="cart-flow-header cart-flow-header--plain">
          <p className="cart-flow-eyebrow">{t("merchantTitle")}</p>
          <h1 className="cart-flow-title">{t("paymentTitle")}</h1>
          <p className="cart-flow-subtitle">{t("paymentSubtitle")}</p>
        </header>

        <div className="cart-flow-body">
          <div className="cart-linkup-payment-options" role="group" aria-label={t("paymentOptionsAria")}>
            <button
              type="button"
              className={CART_PRIMARY_BUTTON_CLASS}
              disabled={loading !== false}
              onClick={() => void checkoutStripe()}
            >
              {loading === "stripe" ? tCart("paying") : t("payStripe", { amount: display.usdAmount })}
            </button>

            {pixEnabled ? (
              <button
                type="button"
                className={CART_SECONDARY_BUTTON_CLASS}
                disabled={loading !== false || !checkoutEmail}
                onClick={() => void checkoutPix()}
              >
                {loading === "pix" ? tCart("paying") : t("payPixAsaas", { amount: display.brlAmount })}
              </button>
            ) : (
              <button type="button" className={CART_SECONDARY_BUTTON_CLASS} disabled>
                {t("payPixAsaas", { amount: display.brlAmount })}
                <span className="cart-linkup-payment-coming-soon">{t("comingSoon")}</span>
              </button>
            )}

            <button type="button" className={CART_SECONDARY_BUTTON_CLASS} disabled>
              {t("payCrypto", { amount: display.usdAmount })}
              <span className="cart-linkup-payment-coming-soon">{t("comingSoon")}</span>
            </button>
          </div>

          {error ? <CartNotice variant="error">{error}</CartNotice> : null}

          <p className="cart-flow-pay-methods-note">{t("usdComplianceNote")}</p>
        </div>

        <footer className="cart-flow-footer">
          <Link href="/cart/checkout" className="cart-flow-footer-link">
            {t("backCheckout")}
          </Link>
        </footer>
      </div>
    </div>
  );
}
