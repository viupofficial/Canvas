"use client";

// ─────────────────────────────────────────────────────────────────────────────
// REAL STRIPE UPGRADE FLOW
//
// PaymentUpgradeModal drives the package-upgrade flow from the canvas:
//   1. User picks a higher package (Basic → Standard/Premium, Standard → Premium).
//   2. User picks a payment method (decorative — Stripe Checkout presents the
//      actual payment options on its own page).
//   3. On "Checkout" we POST a hidden HTML form to create_upgrade_checkout.php
//      (the same endpoint the MyEvent.php upgrade modal uses), which creates a
//      Stripe Checkout Session with metadata flow=upgrade. The Stripe webhook
//      updates events.package_id, then Stripe redirects back to return_to with
//      ?payment=success&upgrade=1.
//
// IMPORTANT: never point this at checkout.php — that endpoint is for NEW
// event/package purchases (index_login / Digital-Cards-login) and creates new
// events. Upgrades from the canvas must only upgrade the ONE existing event.
//
// Vercel/Canvas NEVER touches events.package_id directly — it only redirects to
// PHP and refetches the event afterwards (see ProjectEditor return handling).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";

// PHP Stripe upgrade endpoint (shared with MyEvent.php). This is the ONLY
// upgrade action Canvas performs — a plain form POST (not fetch) so the PHP
// session/cross-origin flow behaves like a normal browser navigation and CORS
// never gets in the way.
const UPGRADE_CHECKOUT_URL = "https://vi-up.com/create_upgrade_checkout.php";

// Vi-Up palette (matches the PHP payment modal).
const PANEL_BG = "#F3E9E6";
const SIDE_BG = "#E9DAD7";
const BRAND = "#7D5B59";

export type PaymentUpgradeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  eventId: number;
  currentPackageId: number | null;
  returnUrl?: string;
};

type PackageOption = {
  id: 1 | 2 | 3;
  label: string;
  price: number; // RM
  blurb: string;
};

const PACKAGES: PackageOption[] = [
  { id: 1, label: "Basic", price: 35, blurb: "Essential invitation tools." },
  { id: 2, label: "Standard", price: 70, blurb: "RSVP + a larger gallery." },
  { id: 3, label: "Premium", price: 130, blurb: "Everything, unlimited." },
];

type PaymentMethod = "card" | "fpx" | "ewallet";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; hint: string }[] = [
  { id: "card", label: "Credit / Debit Card", hint: "Visa, Mastercard" },
  { id: "fpx", label: "FPX Online Banking", hint: "Malaysian banks" },
  { id: "ewallet", label: "E-Wallet", hint: "Touch 'n Go, GrabPay" },
];

// Steps shown in the right-side decorative progress rail.
const PROGRESS_STEPS = ["Purchase", "Payment Confirmation", "Create RSVP"] as const;

// Strip any previous payment-return params from a URL so the return_to we hand
// to PHP is clean (no stale ?payment=…&upgrade=…&dummy=…&target=…). Falls back
// to the raw string if it isn't parseable.
function cleanReturnUrl(raw: string): string {
  try {
    const url = new URL(raw);
    ["payment", "upgrade", "dummy", "target"].forEach((k) => url.searchParams.delete(k));
    return url.toString();
  } catch {
    return raw;
  }
}

// Embed the upgrade target in the return_to URL. Stripe's return doesn't say
// which package was bought, so ProjectEditor reads ?target=… after the redirect
// to know when the webhook has finished applying the upgrade.
function withTargetParam(raw: string, targetPackageId: number): string {
  try {
    const url = new URL(raw);
    url.searchParams.set("target", String(targetPackageId));
    return url.toString();
  } catch {
    return raw;
  }
}

export default function PaymentUpgradeModal({
  isOpen,
  onClose,
  eventId,
  currentPackageId,
  returnUrl,
}: PaymentUpgradeModalProps) {
  const [step, setStep] = useState<"package" | "payment">("package");
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("card");

  // A package is a valid upgrade target only if it's strictly higher than the
  // current one. Anything <= current is disabled (no side-grades, no downgrades).
  const isUpgradeTarget = (id: number) => {
    const current = currentPackageId ?? 0;
    return id > current;
  };

  const hasAnyUpgrade = PACKAGES.some((p) => isUpgradeTarget(p.id));
  const isPremiumAlready = currentPackageId === 3;

  // Default selection = the lowest available upgrade (Basic→Standard, Standard→
  // Premium). Reset every time the modal (re)opens so it never keeps a stale pick.
  useEffect(() => {
    if (!isOpen) return;
    const firstUpgrade = PACKAGES.find((p) => isUpgradeTarget(p.id));
    setSelectedPackageId(firstUpgrade ? firstUpgrade.id : null);
    setStep("package");
    setMethod("card");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentPackageId]);

  // Close on Escape for accessibility / parity with the rest of the app.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const selectedPackage = useMemo(
    () => PACKAGES.find((p) => p.id === selectedPackageId) ?? null,
    [selectedPackageId],
  );

  const total = selectedPackage?.price ?? 0;
  const canCheckout = !!selectedPackage && isUpgradeTarget(selectedPackage.id);

  if (!isOpen) return null;

  // ── Checkout: hidden form POST to create_upgrade_checkout.php ───────────────
  // We build and submit a real <form> so the browser performs a top-level
  // navigation to PHP (session cookies flow, no CORS preflight). PHP creates the
  // Stripe Checkout Session (flow=upgrade) and redirects the browser to Stripe;
  // after payment Stripe sends the user back to return_to with
  // ?payment=success&upgrade=1 while the webhook updates package_id.
  const handleCheckout = () => {
    if (!canCheckout || !selectedPackage) return;

    const cleanCurrentUrl = cleanReturnUrl(
      returnUrl ?? (typeof window !== "undefined" ? window.location.href : ""),
    );

    const form = document.createElement("form");
    form.method = "POST";
    form.action = UPGRADE_CHECKOUT_URL;

    const fields: Record<string, string> = {
      event_id: String(eventId),
      target_package_id: String(selectedPackage.id),
      source: "vercel",
      return_to: withTargetParam(cleanCurrentUrl, selectedPackage.id),
    };

    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade your package"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-[860px] max-h-[92vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col md:flex-row"
        style={{ backgroundColor: PANEL_BG }}
      >
        {/* ── Left: interactive checkout ─────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col p-5 sm:p-7 overflow-y-auto">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-[20px] sm:text-[22px] font-extrabold" style={{ color: BRAND }}>
                Upgrade your package
              </h2>
              <p className="text-[12.5px] mt-0.5" style={{ color: `${BRAND}B0` }}>
                Secure payment powered by Stripe.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/5"
              style={{ color: BRAND }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>

          {/* Already Premium → nothing to upgrade. */}
          {isPremiumAlready || !hasAnyUpgrade ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: BRAND, color: "#fff" }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <p className="text-[16px] font-bold" style={{ color: BRAND }}>
                You already have Premium.
              </p>
              <p className="text-[13px] mt-1" style={{ color: `${BRAND}B0` }}>
                Every feature is unlocked on this event.
              </p>
              <button
                onClick={onClose}
                className="mt-6 rounded-full px-6 py-2.5 text-[14px] font-bold text-white"
                style={{ backgroundColor: BRAND }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Step body */}
              <div className="flex-1">
                {step === "package" ? (
                  <div>
                    <p className="text-[13px] font-semibold mb-3" style={{ color: BRAND }}>
                      Choose a package
                    </p>
                    <div className="flex flex-col gap-2.5">
                      {PACKAGES.map((pkg) => {
                        const disabled = !isUpgradeTarget(pkg.id);
                        const active = selectedPackageId === pkg.id;
                        return (
                          <button
                            key={pkg.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => setSelectedPackageId(pkg.id)}
                            className={[
                              "w-full text-left rounded-xl border-2 px-4 py-3 flex items-center justify-between gap-3 transition",
                              disabled
                                ? "opacity-45 cursor-not-allowed"
                                : "cursor-pointer hover:shadow-sm",
                            ].join(" ")}
                            style={{
                              borderColor: active ? BRAND : "#00000012",
                              backgroundColor: active ? "#fff" : "#FFFFFF80",
                            }}
                          >
                            <span className="min-w-0">
                              <span className="flex items-center gap-2">
                                <span className="text-[15px] font-bold" style={{ color: BRAND }}>
                                  {pkg.label}
                                </span>
                                {disabled && (
                                  <span
                                    className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5"
                                    style={{ backgroundColor: `${BRAND}22`, color: BRAND }}
                                  >
                                    {currentPackageId === pkg.id ? "Current" : "Unavailable"}
                                  </span>
                                )}
                              </span>
                              <span className="block text-[12px] mt-0.5" style={{ color: `${BRAND}A0` }}>
                                {pkg.blurb}
                              </span>
                            </span>
                            <span className="shrink-0 text-[15px] font-extrabold" style={{ color: BRAND }}>
                              RM{pkg.price}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[13px] font-semibold mb-3" style={{ color: BRAND }}>
                      Payment method
                    </p>
                    <div className="flex flex-col gap-2.5">
                      {PAYMENT_METHODS.map((m) => {
                        const active = method === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setMethod(m.id)}
                            className="w-full text-left rounded-xl border-2 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:shadow-sm transition"
                            style={{
                              borderColor: active ? BRAND : "#00000012",
                              backgroundColor: active ? "#fff" : "#FFFFFF80",
                            }}
                          >
                            <span>
                              <span className="block text-[14px] font-bold" style={{ color: BRAND }}>
                                {m.label}
                              </span>
                              <span className="block text-[12px] mt-0.5" style={{ color: `${BRAND}A0` }}>
                                {m.hint}
                              </span>
                            </span>
                            <span
                              className="shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                              style={{ borderColor: active ? BRAND : "#00000030" }}
                            >
                              {active && (
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND }} />
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Total + actions */}
              <div className="mt-5 pt-4 border-t" style={{ borderColor: "#00000010" }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-semibold" style={{ color: `${BRAND}C0` }}>
                    Total
                  </span>
                  <span className="text-[20px] font-extrabold" style={{ color: BRAND }}>
                    RM{total}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  {step === "payment" && (
                    <button
                      type="button"
                      onClick={() => setStep("package")}
                      className="rounded-full px-5 py-2.5 text-[14px] font-bold border-2"
                      style={{ borderColor: BRAND, color: BRAND }}
                    >
                      Back
                    </button>
                  )}

                  {step === "package" ? (
                    <button
                      type="button"
                      onClick={() => setStep("payment")}
                      disabled={!canCheckout}
                      className="flex-1 rounded-full px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-45 disabled:cursor-not-allowed"
                      style={{ backgroundColor: BRAND }}
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={!canCheckout}
                      className="flex-1 rounded-full px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-45 disabled:cursor-not-allowed"
                      style={{ backgroundColor: BRAND }}
                    >
                      Checkout · RM{total}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Right: decorative progress rail (hidden on mobile) ─────────────── */}
        <div
          className="hidden md:flex md:w-[38%] shrink-0 flex-col justify-center p-7"
          style={{ backgroundColor: SIDE_BG }}
        >
          <p className="text-[12px] font-bold uppercase tracking-wide mb-6" style={{ color: `${BRAND}A0` }}>
            How it works
          </p>
          <ol className="flex flex-col gap-6">
            {PROGRESS_STEPS.map((label, i) => {
              // Step 1 (Purchase) is "active" on the package screen; once the user
              // advances to payment, Payment Confirmation lights up too.
              const activeIndex = step === "package" ? 0 : 1;
              const done = i < activeIndex;
              const active = i === activeIndex;
              return (
                <li key={label} className="flex items-center gap-3">
                  <span
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold"
                    style={{
                      backgroundColor: done || active ? BRAND : "transparent",
                      color: done || active ? "#fff" : BRAND,
                      border: done || active ? "none" : `2px solid ${BRAND}55`,
                    }}
                  >
                    {done ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className="text-[14px] font-semibold"
                    style={{ color: active || done ? BRAND : `${BRAND}80` }}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
