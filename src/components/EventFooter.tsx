"use client"

import React, { useState, useRef, useEffect } from "react"
import { useEventDataOptional, giftAccounts, clampQrSize, type GiftAccount } from "@/src/store/EventDataContext"
import GiftCarousel from "@/src/components/GiftCarousel"
import { buildIcs, icsFilename } from "@/src/lib/calendar/icsBuilder"
import { buildGoogleCalendarLink } from "@/src/lib/calendar/googleCalendarLink"
import EventMiniCalendar from "@/src/components/EventMiniCalendar"
import type { CalendarExportInput } from "@/src/lib/calendar/normalizeEvent"
import { submitCanvasRSVP, submitCanvasGuestbook, getCanvasGuestbook } from "@/src/lib/viupApi"
import { cssBackground, type GradientDescriptor } from "@/src/lib/gradient"
import { computeFooterNav } from "@/src/lib/footerNav"


export default function EventFooter({
  contacts: contactsProp,
  moneyGift: moneyGiftProp,
  calendar: calendarProp,
  location: locationProp,
  rsvpConfig: rsvpConfigProp,
  userId,
  eventId,
  onGuestbookUpdate,
  showRsvpAndMoneyGift = true,
}: {
  contacts?: any[];
  moneyGift?: {
    // Bank / number / QR / QR size, one entry per account guests can swipe to.
    accounts?: GiftAccount[] | null;
    // Legacy single-account fields, still honoured for invitations saved before
    // multi-account (see giftAccounts()).
    bank?: string;
    account?: number | string;
    image?: string | null;
    images?: string[] | null;
    qrSize?: number | null;
    // "Show Money Gift" (Money Gift sidebar). Undefined ⇒ ON for backward
    // compat; the package gate still has the final say.
    enabled?: boolean;
  } | null;
  calendar?: {
    date?: string;
    startTime?: string;
    endTime?: string;
    endDate?: string;
    title?: string;
    description?: string;
    reminderMinutes?: number;
    // "Show Calendar" (Calendar sidebar). Undefined ⇒ ON for backward compat.
    enabled?: boolean;
  } | null;
  // "Show Location" (Location sidebar). Undefined ⇒ ON for backward compat.
  location?: { address?: string; enabled?: boolean } | null;
  rsvpConfig?: {
    enabled?: boolean;
    maxGuest?: number;
    // Solid CSS color or gradient descriptor (src/lib/gradient.ts).
    navColor?: string | GradientDescriptor;
    navOpacity?: number;
    textColor?: string;
    textOpacity?: number;
    circleColor?: string | GradientDescriptor;
    circleOpacity?: number;
  } | null;
  userId?: string | number | null;
  eventId?: string | number | null;
  onGuestbookUpdate?: (entries: { message: string; sender: string }[]) => void;
  // Package gating: false ⇒ Basic package (package_id === 1). Hides the RSVP and
  // Money Gift footer items and blocks their modals. Defaults to true so any
  // caller without package info (legacy/standalone previews) keeps both.
  showRsvpAndMoneyGift?: boolean;
}) {
  // Prefer the shared store (editor page) — fall back to props (export/SSR).
  const ctx = useEventDataOptional();
  const contacts = ctx?.eventData.contacts ?? contactsProp ?? [];
  const moneyGift = ctx?.eventData.moneyGift ?? moneyGiftProp ?? null;
  const calendar = ctx?.eventData.calendar ?? calendarProp ?? null;
  const location = ctx?.eventData.location ?? locationProp ?? null;
  const rsvpConfig = ctx?.eventData.rsvpConfig ?? rsvpConfigProp ?? null;

  // ── Footer navigation ─────────────────────────────────────────────────────
  // Which items the two slots either side of the RSVP circle hold is decided in
  // one place, shared by every surface that renders this footer (editor canvas,
  // local preview, published page) — see src/lib/footerNav.ts for the rules.
  const nav = computeFooterNav({
    // Package gate first: Basic has no Money Gift, and no toggle can unlock it.
    moneyGiftAllowed: showRsvpAndMoneyGift,
    moneyGiftEnabled: moneyGift?.enabled,
    calendarEnabled: calendar?.enabled,
    locationEnabled: location?.enabled,
  });
  const showCalendar = nav.calendarVisible;
  const showLocation = nav.locationVisible;
  const showMoneyGift = nav.moneyGiftVisible;

  // Money Gift: one swipeable slide per saved account. Falls back to the demo
  // account so an unfilled Money Gift card still shows something, as before.
  const savedAccounts = giftAccounts(moneyGift);
  const giftAccountList: GiftAccount[] =
    savedAccounts.length > 0
      ? savedAccounts
      : [{ bank: "Maybank Berhad", account: "154080219940", image: "/MayaQRimage.png", qrSize: clampQrSize(null) }];

  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [rsvpStatus, setRsvpStatus] = useState<null | "accept" | "decline">(null);
  // Which account's number was just copied (one copy button per slide).
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // While a panel is fading out it stays mounted with the `is-closing` class so
  // the fade-out can play, then unmounts. Keep this in sync with the CSS
  // `previewUiFadeOut` duration in globals.css (240ms).
  const [closing, setClosing] = useState(false);

  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpMessage, setRsvpMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [gbSubmitting, setGbSubmitting] = useState(false);
  const [gbMessage, setGbMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const rsvpNameRef = useRef<HTMLInputElement>(null);
  const rsvpPhoneRef = useRef<HTMLInputElement>(null);
  const rsvpPaxRef = useRef<HTMLSelectElement>(null);
  const gbWishRef = useRef<HTMLTextAreaElement>(null);
  const gbNameRef = useRef<HTMLInputElement>(null);
  const hasEventInfo = userId != null && eventId != null && userId !== "" && eventId !== "";

  const handleCopyAccount = async (accountNumber: string, index: number) => {
    const flash = () => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((i) => (i === index ? null : i)), 1500);
    };
    try {
      await navigator.clipboard.writeText(accountNumber);
      flash();
    } catch {
      const ta = document.createElement("textarea");
      ta.value = accountNumber;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      flash();
    }
  };

  // Fade the active panel out, then unmount it (and reset RSVP sub-state).
  const closeCard = () => {
    if (!activeCard) return;
    setClosing(true);
    setTimeout(() => {
      setActiveCard(null);
      setRsvpStatus(null);
      // Forget which Info section was open so the next open starts fresh on
      // the Calendar/Location chooser instead of a stale section.
      setInfoTab(null);
      setClosing(false);
    }, 240);
  };

  const toggleCard = (card: string) => {
    // Basic package: RSVP and Money Gift are unavailable. Block opening their
    // modals even if a stale element or saved layout tries to trigger them.
    if (!showRsvpAndMoneyGift && (card === "rsvp" || card === "gift")) return;
    // RSVP turned off via the sidebar toggle — never open its modal.
    if (card === "rsvp" && rsvpConfig?.enabled === false) return;
    // Money Gift turned off via the sidebar toggle — never open its modal.
    if (card === "gift" && !showMoneyGift) return;
    // The Info chooser only exists while the Info button holds the right slot.
    if (card === "info" && !nav.showInfoButton) return;
    if (activeCard === card) {
      // Info steps back one level: if a Calendar/Location section is open,
      // return to the floating chooser buttons first; only close the card
      // (and send the circle back to the RSVP slot) from the buttons view.
      if (card === "info" && infoTab) {
        setInfoTab(null);
        return;
      }
      closeCard();
    } else {
      // Switch straight to the new panel; it fades in via `.preview-fade`.
      setClosing(false);
      setActiveCard(card);
    }
  };

  // Compute footer nav bar styles from rsvpConfig. Colors may be solid strings
  // or gradient descriptors — cssBackground() turns either into a CSS
  // `background` value with the stored opacity multiplied in.
  const footerBg = rsvpConfig?.navColor
    ? cssBackground(rsvpConfig.navColor, rsvpConfig?.navOpacity ?? 100)
    : "rgba(0,0,0,0.85)";
  const rsvpCircleBg = cssBackground(rsvpConfig?.navColor ?? "#000000");
  // White half-circle "notch" behind the RSVP circle — painted by
  // .footer-container::before, which reads this CSS variable (defaults to white).
  const notchBg = rsvpConfig?.circleColor
    ? cssBackground(rsvpConfig.circleColor, rsvpConfig?.circleOpacity ?? 100)
    : "white";
  const labelColor = rsvpConfig?.textColor ?? "white";
  const labelOpacity = (rsvpConfig?.textOpacity ?? 100) / 100;
  const labelStyle: React.CSSProperties = { color: labelColor, opacity: labelOpacity };
  // Silhouette PNG icons are tinted via CSS mask: the shape comes from the image's
  // alpha and the fill is `currentColor`, which inherits labelColor from the parent.
  const iconMaskStyle = (src: string): React.CSSProperties => ({
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
  });
  // Calendar/Location bubbles: circle follows the Navigation Bar color, while the
  // icon+label (which inherit the button's `color`) follow Text and Icon. Opacity
  // is left to the inner glyph so it doesn't fade the circle.
  const bubbleStyle: React.CSSProperties = { background: rsvpCircleBg, color: labelColor };
  const bubbleGlyphStyle: React.CSSProperties = { opacity: labelOpacity };
  // When the Info panel is open we run the prototype's choreography: the RSVP
  // circle slides over to the Info slot (move-right), the white bump follows it
  // (bump-shift), the RSVP label drops down into the bar (drop), and the Info
  // star scales up onto the moved circle (visible).
  // Only the Info slot runs the choreography — a direct Calendar/Location
  // button has no star to fly up to, so the RSVP circle stays put for it.
  const infoActive = activeCard === "info" && nav.showInfoButton;
  const maxPax = rsvpConfig?.maxGuest ?? 3;
  // RSVP toggle (from the RSVP sidebar). Undefined ⇒ ON for backward compat;
  // only an explicit `false` hides RSVP. Gated together with the package check.
  const rsvpEnabled = showRsvpAndMoneyGift && rsvpConfig?.enabled !== false;
    const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

// Build the export input from the full calendar record + location.
// Reads title, endDate, description, reminderMinutes when present; falls back
// safely for legacy records that only have `{ date }`.
const buildExportInput = (cal: any, loc: any): CalendarExportInput | null => {
  if (!cal?.date) return null;
  // Combine date + startTime/endTime into datetime strings so ICS and Google
  // Calendar links carry the correct start/end time.
  const startDateTime = cal.startTime ? `${cal.date}T${cal.startTime}` : cal.date;
  const endDateTime = cal.endTime
    ? `${cal.date}T${cal.endTime}`
    : cal.endDate ?? undefined;
  return {
    date: startDateTime,
    endDate: endDateTime,
    title: cal.title,
    description: cal.description,
    location: loc?.address,
    reminderMinutes: cal.reminderMinutes,
  };
};

// Google Calendar TEMPLATE link — prefills title, dates, details, location.
// (No OAuth: user still clicks Save in Google's UI.)
const generateGoogleCalendarLink = (event: any, loc?: any) => {
  const input = buildExportInput(event, loc);
  return input ? (buildGoogleCalendarLink(input) ?? "#") : "#";
};

// Apple Calendar (.ics) — produces an RFC-5545 file with VALARM when a
// reminder is configured. Returns the raw string; download is handled by
// the click handler below.
const generateICS = (event: any, loc?: any) => {
  const input = buildExportInput(event, loc);
  return input ? (buildIcs(input) ?? "") : "";
};

    console.log("FOOTER contacts:", contacts);
    const [infoTab, setInfoTab] = useState<string | null>(null)

    // Opens one Info section straight away, with no chooser step. Used by the
    // Basic-package footer items AND by the direct Calendar/Location button
    // that replaces Info when only one of the two is enabled — same popup,
    // same content, no duplicate logic. Re-tapping the open one closes the
    // panel, mirroring toggleCard's behaviour.
    const openInfoTab = (tab: "calendar" | "location") => {
      // Turned off via the sidebar toggle — never open its section.
      if (tab === "calendar" && !showCalendar) return;
      if (tab === "location" && !showLocation) return;
      if (activeCard === "info" && infoTab === tab) {
        closeCard();
        return;
      }
      setInfoTab(tab);
      setClosing(false);
      setActiveCard("info");
    };

    // A toggle can be flipped in the sidebar while the popup is open. Close it
    // when what's on screen is no longer available: a section whose feature was
    // just turned off, or the Calendar/Location chooser once the slot is no
    // longer the Info button. The footer then re-renders the direct button (or
    // hides the slot) on the same tick.
    useEffect(() => {
      if (activeCard !== "info") return;
      const stale =
        (infoTab === "calendar" && !showCalendar) ||
        (infoTab === "location" && !showLocation) ||
        (infoTab === null && !nav.showInfoButton);
      if (stale) closeCard();
      // closeCard is re-created each render; the guards above make a re-run
      // after it fires a no-op, so it's intentionally not a dependency.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCard, infoTab, showCalendar, showLocation, nav.showInfoButton]);

    // Money Gift can be switched off while its modal is open — close it too.
    useEffect(() => {
      if (activeCard === "gift" && !showMoneyGift) closeCard();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCard, showMoneyGift]);
    // Fade class shared by every popup panel: fades in on open, fades out (via
    // `is-closing`) just before unmount. Opacity-only, so it never disturbs a
    // panel's own positioning transform.
    const fadeCls = closing ? "preview-fade is-closing" : "preview-fade";
    return (

        <>
            {/* CONTACT CARD */}
            {activeCard === "contact" && (

                <div className={`contact-card contact-popup ${fadeCls}`}>
                    <h3 className="center">Contact</h3>

                    {contacts.length > 0 ? (
  contacts.map((c, i) => (
    <div key={i} className="contact-person">
      <span style={{ fontFamily: "Montserrat" }}>{c.name}</span>

      <div className="icons">
        <a href={`tel:${c.phone}`}>
          <i className="fas fa-phone"></i>
          
        </a>

        <a href={`https://wa.me/60${c.phone.replace(/^(\+?60)?0?/, '')}`} target="_blank">
          <i className="fab fa-whatsapp"></i>
        </a>
      </div>
    </div>
  ))
  
) : (
  <>
    {/* fallback (your original default) */}
    <div className="contact-person">
      <span style={{ fontFamily: "Montserrat" }}>VI-UP</span>
      <div className="icons">
        <a href="tel:+601167993962">
          <i className="fas fa-phone"></i>
        </a>
        <a href="https://wa.me/601167993962" target="_blank">
          <i className="fab fa-whatsapp"></i>
        </a>
      </div>
    </div>
  </>
  
)}

                </div>
            )}

            {/* MONEY GIFT */}
            {showMoneyGift && activeCard === "gift" && (

                <div className={`moneygift-card ${fadeCls}`}>
                    <h3>Money Gift</h3>

                  {/* One slide per account — its bank, its number and its own QR
                      stay together, so the number a guest copies always belongs
                      to the code they are looking at. */}
                  <GiftCarousel
                    itemLabel="account"
                    slides={giftAccountList.map((acc, i) => {
                      const number = String(acc.account ?? "");
                      const copied = copiedIndex === i;
                      return (
                        <div className="gift-slide" key={i}>
                          <div className="bank-info">
                            <input
                              type="text"
                              style={{ textAlign: "center" }}
                              value={acc.bank || ""}
                              readOnly
                            />
                          </div>

                          <div className="account-wrapper">
                            <input
                              type="text"
                              style={{ textAlign: "center" }}
                              id={i === 0 ? "account-number" : `account-number-${i + 1}`}
                              value={number}
                              readOnly
                            />
                            <button
                              type="button"
                              onClick={() => handleCopyAccount(number, i)}
                              aria-label={`Copy account number${acc.bank ? ` for ${acc.bank}` : ""}`}
                              title={copied ? "Copied!" : "Copy account number"}
                            >
                              <i className={copied ? "fas fa-check" : "fa-regular fa-copy"}></i>
                            </button>
                          </div>

                          {acc.image && (
                            <div className="qr-wrapper">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={acc.image}
                                alt={acc.bank ? `QR code for ${acc.bank}` : "QR code"}
                                draggable={false}
                                style={{ width: clampQrSize(acc.qrSize), height: clampQrSize(acc.qrSize) }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  />

                </div>

            )}

            {/* RSVP CARD */}
            {rsvpEnabled && activeCard === "rsvp" && (

                <div className={`contact-card rsvp-popup ${fadeCls}`}>

                    <h2
                        style={{
                            textAlign: "center",
                            fontFamily: "Montserrat",
                            fontSize: "20px",
                            paddingBottom: "12px",
                        }}
                    >
                        RSVP
                    </h2>

                    <p
                        style={{
                            fontFamily: "Montserrat",
                            textAlign: "center",
                            fontWeight: 100,
                            fontStyle: "italic",
                            paddingBottom: "10px",
                        }}
                    >
                        Will you attend the event?
                    </p>

                    {/* Step 1: Accept / Decline choice */}
                    {rsvpStatus === null && (
                        <div className="rsvp-options">
                            <button
                                type="button"
                                className="accept"
                                style={{ fontFamily: "Montserrat", textAlign: "center", fontWeight: 700, fontSize: "16px" }}
                                onClick={() => setRsvpStatus("accept")}
                            >
                                Accept
                            </button>
                            <button
                                type="button"
                                className="decline"
                                style={{ fontFamily: "Montserrat", textAlign: "center", fontWeight: 700, fontSize: "16px" }}
                                onClick={() => setRsvpStatus("decline")}
                            >
                                Decline
                            </button>
                        </div>
                    )}

                    {/* RSVP success/error message */}
                    {rsvpMessage && (
                        <p style={{
                            textAlign: "center",
                            fontFamily: "Montserrat",
                            fontSize: "14px",
                            padding: "10px 0",
                            color: rsvpMessage.type === "success" ? "#2e7d32" : "#c62828",
                        }}>
                            {rsvpMessage.text}
                        </p>
                    )}

                    {!hasEventInfo && (
                        <p style={{
                            textAlign: "center",
                            fontFamily: "Montserrat",
                            fontSize: "13px",
                            color: "#c62828",
                            padding: "10px 0",
                        }}>
                            Event information is missing.
                        </p>
                    )}

                    {/* Step 2: Form shown after choosing Accept or Decline */}
                    {rsvpStatus !== null && !rsvpMessage && (
                        <form className="rsvp-form" style={{ display: "flex", marginTop: "0.5rem" }}
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (!hasEventInfo) return;
                                const status = rsvpStatus === "accept" ? "Attending" : "Not Attending";
                                const name = rsvpNameRef.current?.value?.trim() || "";
                                const phone = rsvpPhoneRef.current?.value?.trim() || "";
                                const pax = rsvpStatus === "accept" ? Number(rsvpPaxRef.current?.value || 0) : 0;

                                if (!name) return;
                                if (rsvpStatus === "accept" && !phone) return;
                                if (rsvpStatus === "accept" && pax < 1) return;

                                setRsvpSubmitting(true);
                                setRsvpMessage(null);
                                try {
                                    await submitCanvasRSVP({
                                        userId: userId!,
                                        eventId: eventId!,
                                        name,
                                        phone,
                                        status,
                                        pax,
                                    });
                                    setRsvpMessage({ type: "success", text: "Thank you for your RSVP!" });
                                    setTimeout(() => {
                                        closeCard();
                                        setRsvpMessage(null);
                                    }, 2000);
                                } catch (err: any) {
                                    setRsvpMessage({ type: "error", text: err?.message || "Failed to submit RSVP." });
                                } finally {
                                    setRsvpSubmitting(false);
                                }
                            }}
                        >
                            <input type="hidden" name="status" value={rsvpStatus === "accept" ? "Attending" : "Not Attending"} />

                            <div className="form-group">
                                <input type="text" name="name" ref={rsvpNameRef} required disabled={rsvpSubmitting} placeholder=" " />
                                <label>Name</label>
                            </div>

                            <div className="form-group">
                                <input type="tel" name="phone" ref={rsvpPhoneRef} required={rsvpStatus === "accept"} disabled={rsvpSubmitting} placeholder=" " />
                                <label>Phone No.</label>
                            </div>

                            {rsvpStatus === "accept" && (
                                <>
                                    <div className="form-group">
                                        <select name="pax" ref={rsvpPaxRef} required className="styled-select" disabled={rsvpSubmitting}>
                                            <option value="" disabled hidden></option>
                                            {Array.from({ length: maxPax }, (_, i) => i + 1).map((n) => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                        <label>Number of Pax</label>
                                    </div>

                                    <p className="info-line">
                                        <span className="material-symbols-outlined">info</span>
                                        If more than {maxPax} pax, please contact the family members.
                                    </p>
                                </>
                            )}

                            <div className="rsvp-submit-buttons" style={{ display: "flex" }}>
                                <button type="submit" disabled={rsvpSubmitting || !hasEventInfo}>
                                    {rsvpSubmitting ? "Submitting..." : "Submit"}
                                </button>
                                <button type="button" onClick={() => setRsvpStatus(null)} disabled={rsvpSubmitting}>Cancel</button>
                            </div>
                        </form>
                    )}

                </div>

            )}

            {/* GUESTBOOK POPUP */}
            {activeCard === "guestbook" && (

                <div className={`guestbook-overlay ${fadeCls}`}>

                    <div className="guestbook-modal">

                        <h3 style={{ paddingBottom: "10px", fontFamily: "Montserrat, sans-serif" }}>
                            Share Your Wishes
                        </h3>

                        {gbMessage && (
                            <p style={{
                                textAlign: "center",
                                fontFamily: "Montserrat",
                                fontSize: "13px",
                                padding: "8px 0",
                                color: gbMessage.type === "success" ? "#2e7d32" : "#c62828",
                            }}>
                                {gbMessage.text}
                            </p>
                        )}

                        {!hasEventInfo && (
                            <p style={{
                                textAlign: "center",
                                fontFamily: "Montserrat",
                                fontSize: "13px",
                                color: "#c62828",
                                padding: "8px 0",
                            }}>
                                Event information is missing.
                            </p>
                        )}

                        <div className="form-group">
                            <textarea
                                id="wish"
                                ref={gbWishRef}
                                style={{ paddingBottom: "85px" }}
                                required
                                disabled={gbSubmitting}
                                placeholder=" "
                            />
                            <label
                                htmlFor="wish"
                                style={{ fontFamily: "Montserrat", color: "#7D5B59" }}
                            >
                                Wish
                            </label>
                        </div>

                        <div className="form-group">
                            <input type="text" id="name" ref={gbNameRef} required disabled={gbSubmitting} placeholder=" " />
                            <label
                                htmlFor="name"
                                style={{ fontFamily: "Montserrat", color: "#7D5B59" }}
                            >
                                Name
                            </label>
                        </div>

                        <div className="guestbook-buttons">

                            <button
                                type="button"
                                style={{ fontFamily: "Montserrat" }}
                                disabled={gbSubmitting || !hasEventInfo}
                                onClick={async () => {
                                    const wish = gbWishRef.current?.value?.trim() || "";
                                    const name = gbNameRef.current?.value?.trim() || "";
                                    if (!wish || !name || !hasEventInfo) return;

                                    setGbSubmitting(true);
                                    setGbMessage(null);
                                    try {
                                        await submitCanvasGuestbook({
                                            userId: userId!,
                                            eventId: eventId!,
                                            name,
                                            wish,
                                        });
                                        setGbMessage({ type: "success", text: "Wish sent!" });
                                        if (gbWishRef.current) gbWishRef.current.value = "";
                                        if (gbNameRef.current) gbNameRef.current.value = "";

                                        try {
                                            const data = await getCanvasGuestbook({ userId: userId!, eventId: eventId! });
                                            const entries = (data.entries || []).map((e: any) => ({
                                                message: e.message || e.wish || "",
                                                sender: e.sender || e.name || "",
                                            }));
                                            onGuestbookUpdate?.(entries);
                                        } catch {}

                                        setTimeout(() => {
                                            closeCard();
                                            setGbMessage(null);
                                        }, 2000);
                                    } catch (err: any) {
                                        setGbMessage({ type: "error", text: err?.message || "Failed to send wish." });
                                    } finally {
                                        setGbSubmitting(false);
                                    }
                                }}
                            >
                                {gbSubmitting ? "Sending..." : "Send"}
                            </button>

                            <button
                                type="button"
                                style={{ fontFamily: "Montserrat" }}
                                onClick={closeCard}
                                disabled={gbSubmitting}
                            >
                                Close
                            </button>

                        </div>

                    </div>

                </div>

            )}
            {/* INFO CARD */}
            {activeCard === "info" && (

                <div className={`info-popup ${fadeCls}`}>

                    {/* The two-button expansion belongs to the Info slot only.
                        Every other route into these sections — the Basic-package
                        items, a direct Calendar/Location button — opens its
                        section straight away and skips the chooser. */}
                    {nav.showInfoButton && (
                    <div id="info-buttons">

                        <button
                            className="floating-btn"
                            style={bubbleStyle}
                            onClick={() => setInfoTab("calendar")}
                        >
                            <i className="fa-regular fa-calendar-days" style={bubbleGlyphStyle}></i>
                            <span style={bubbleGlyphStyle}>Calendar</span>
                        </button>

                        <button
                            className="floating-btn"
                            style={bubbleStyle}
                            onClick={() => setInfoTab("location")}
                        >
                            <i className="fa-solid fa-location-dot" style={bubbleGlyphStyle}></i>
                            <span style={bubbleGlyphStyle}>Location</span>
                        </button>

                    </div>
                    )}


                    {/* CALENDAR SECTION */}
                    
                    {infoTab === "calendar" && (

                        <div className="info-section">

                            <h2 style={{
                                textAlign: "center",
                                fontFamily: "Montserrat",
                                fontSize: "20px",
                                paddingBottom: "20px"
                            }}>
                                Calendar
                            </h2>

                            {/* Dynamic event title from the Calendar sidebar. */}
                            {calendar?.title?.trim() && (
                              <p style={{
                                textAlign: "center",
                                fontFamily: "Montserrat",
                                fontSize: "18px",
                                fontWeight: 600,
                                marginBottom: "6px",
                                width: "100%",
                                // Long unbroken titles must wrap, not push the
                                // popup wider than the phone frame.
                                overflowWrap: "anywhere",
                              }}>
                                {calendar.title}
                              </p>
                            )}

                            <p style={{
                                textAlign: "center",
                                fontFamily: "Montserrat",
                                fontSize: "16px",
                                marginBottom: "4px",
                                width: "100%",
                                fontWeight: "100",
                                paddingBottom: "5px"
                            }}>
                               <strong>
  {calendar?.date ? formatDate(calendar.date) : "Select a date"}
</strong>
                            </p>
                            {(calendar?.startTime || calendar?.endTime) && (
                              <p style={{
                                textAlign: "center",
                                fontFamily: "Montserrat",
                                fontSize: "14px",
                                marginBottom: "10px",
                                fontWeight: "400",
                              }}>
                                {calendar.startTime ?? ''}
                                {calendar.startTime && calendar.endTime ? ' – ' : ''}
                                {calendar.endTime ?? ''}
                              </p>
                            )}

                            {/* Self-rendered month grid (not the Google embed, which is
                                cross-origin and can't pin arbitrary dates/titles). Shows
                                the sidebar date highlighted with the title chip on it. */}
                            <EventMiniCalendar
                              date={calendar?.date}
                              title={calendar?.title}
                              startTime={calendar?.startTime}
                              endTime={calendar?.endTime}
                              address={location?.address}
                            />

                            <div className="calendar-links"
                                style={{ width: "100%", gap: "5px", paddingTop: "20px", paddingBottom: "15px" }}>

                               <button
                                 type="button"
                                 onClick={() => {
                                   const ics = generateICS(calendar, location);
                                   if (!ics) return;
                                   const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
                                   const url = URL.createObjectURL(blob);
                                   const a = document.createElement("a");
                                   a.href = url;
                                   a.download = icsFilename(calendar?.title);
                                   document.body.appendChild(a);
                                   a.click();
                                   document.body.removeChild(a);
                                   URL.revokeObjectURL(url);
                                 }}
                                 style={{ width: "100%", background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
                               >
                                 {/* Tailwind preflight makes images display:block, so
                                     text-align can't centre them — margin auto does. */}
                                 <img src="/AppleCal_btn.png" style={{ width: "50%", margin: "0 auto" }} />
                               </button>

                                <a
  target="_blank"
  rel="noopener noreferrer"
  href={generateGoogleCalendarLink(calendar, location)}
>
  <img src="/GoogleCal_btn.png" style={{ width: "50%", margin: "0 auto" }} />
</a>

                            </div>

                        </div>

                    )}


                    {/* LOCATION SECTION */}
                    {infoTab === "location" && (

                        <div className="info-section">

                            <h2 style={{
                                textAlign: "center",
                                fontFamily: "Montserrat",
                                fontSize: "20px",
                                paddingBottom: "20px"
                            }}>
                                Location
                            </h2>

                            <p style={{
                                textAlign: "center",
                                fontFamily: "Montserrat",
                                fontSize: "16px",
                                marginBottom: "10px",
                                width: "100%",
                                fontWeight: "100",
                                paddingBottom: "5px"
                            }}>
                               {location?.address || "Enter a location"}
                            </p>

                            <iframe
                                className="location-map"
                                src={
                                    location?.address
                                      ? `https://www.google.com/maps?q=${encodeURIComponent(location.address)}&output=embed`
                                      : ""
                                  }
                                width="100%"
                                height="280"
                                style={{ border: 0 }}
                                loading="lazy"
                            />

                            <div style={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: "64px",
                                paddingTop: "10px"
                            }}>

<a
  href={
    location?.address
      ? `https://www.google.com/maps?q=${encodeURIComponent(location.address)}`
      : "#"
  }
  target="_blank"
>
  <img src="/googlemap_btn.png" style={{ width: "111px" }} />
</a>

<a
  href={
    location?.address
      ? `https://waze.com/ul?q=${encodeURIComponent(location.address)}`
      : "#"
  }
  target="_blank"
>
  <img src="/waze_btn.png" style={{ width: "52px" }} />
</a>

                            </div>

                        </div>

                    )}

                </div>

            )}

            {/* FOOTER */}
            <div className={`footer-container preview-footer-enter${infoActive ? " bump-shift" : ""}${showRsvpAndMoneyGift ? "" : " footer-basic"}${rsvpEnabled ? "" : " footer-no-rsvp"}${nav.compact ? " footer-nav-compact" : ""}`} style={{ background: footerBg, "--rsvp-notch-bg": notchBg } as React.CSSProperties}>
                {showRsvpAndMoneyGift ? (
                  <>
                    {rsvpEnabled && (
                      <>
                        <div className={`footer-rsvp-wrapper${infoActive ? " move-right" : ""}`}>
                            {/* Circle is just the colored bubble; the single "RSVP" label
                                is rendered once by .footer-rsvp-text below (which also
                                follows the Text and Icon color picker). */}
                            <div className="footer-rsvp" style={{ background: rsvpCircleBg }} onClick={() => toggleCard("rsvp")} />
                        </div>

                        {/* The label overlays the circle (z-index 3), so it must
                            trigger the same action or it swallows the click. */}
                        <div
                          className={`footer-rsvp-text${infoActive ? " drop" : ""}`}
                          style={{ ...labelStyle, cursor: "pointer" }}
                          onClick={() => toggleCard("rsvp")}
                        >
                          RSVP
                        </div>
                      </>
                    )}

                    <div className="footer-buttons">
                        <div className="footer-side left">
                            <a className="footer-guestbook" style={labelStyle} onClick={() => toggleCard("guestbook")}>
                                <span id="guestbook-icon" className="footer-icon" style={iconMaskStyle("/Guestbook.png")} />
                                <span className="footer-label">Guestbook</span>
                            </a>

                            {/* Left slot: Money Gift, or the direct Calendar button
                                that takes its place once Money Gift is off. */}
                            {nav.leftSlot === "moneyGift" ? (
                              <a className="moneygift-toggle" style={labelStyle} onClick={() => toggleCard("gift")}>
                                  <span id="moneygift-icon" className="footer-icon" style={iconMaskStyle("/MONEYGIFT.png")} />
                                  <span className="footer-label">Gift</span>
                              </a>
                            ) : nav.leftSlot === "calendar" ? (
                              <a className="footer-calendar" style={labelStyle} onClick={() => openInfoTab("calendar")}>
                                  <i className="fa-regular fa-calendar-days"></i>
                                  <span className="footer-label">Calendar</span>
                              </a>
                            ) : null}
                        </div>

                        <div className="footer-side right">
                            {/* Right slot: Info (the only expandable one), or a
                                direct Calendar/Location button, or nothing. */}
                            {nav.rightSlot === "info" ? (
                              <a className="footer-info" style={labelStyle} onClick={() => toggleCard("info")}>
                                  <i className={`${infoActive ? "fa-solid" : "fa-regular"} fa-star floating-star${infoActive ? " visible" : ""}`}></i>
                                  <span className="footer-label" style={{ marginTop: "27px" }}>Info</span>
                              </a>
                            ) : nav.rightSlot === "calendar" ? (
                              <a className="footer-info" style={labelStyle} onClick={() => openInfoTab("calendar")}>
                                  <i className="fa-regular fa-calendar-days"></i>
                                  <span className="footer-label">Calendar</span>
                              </a>
                            ) : nav.rightSlot === "location" ? (
                              <a className="footer-info" style={labelStyle} onClick={() => openInfoTab("location")}>
                                  <i className="fa-solid fa-location-dot"></i>
                                  <span className="footer-label">Location</span>
                              </a>
                            ) : null}

                            <button className="contact-toggle" style={{ background: "none", border: "none", ...labelStyle }} onClick={() => toggleCard("contact")}>
                                <span id="contact-icon" className="footer-icon" style={iconMaskStyle("/Contact.png")} />
                                <span className="footer-label">Contact</span>
                            </button>
                        </div>
                    </div>
                  </>
                ) : (
                  // Basic package: a single evenly-spread row of the four allowed
                  // items. Calendar/Location open their Info section directly.
                  <div className="footer-basic-row">
                    <a className="footer-basic-item" style={labelStyle} onClick={() => toggleCard("guestbook")}>
                        <span className="footer-icon" style={iconMaskStyle("/Guestbook.png")} />
                        <span className="footer-label">Guestbook</span>
                    </a>

                    {/* Same toggles as the full footer — the row is evenly spread
                        (space-around + flex:1), so it re-balances on its own when
                        one or both items drop out. */}
                    {showCalendar && (
                    <button className="footer-basic-item" style={{ background: "none", border: "none", ...labelStyle }} onClick={() => openInfoTab("calendar")}>
                        <i className="fa-regular fa-calendar-days"></i>
                        <span className="footer-label">Calendar</span>
                    </button>
                    )}

                    {showLocation && (
                    <button className="footer-basic-item" style={{ background: "none", border: "none", ...labelStyle }} onClick={() => openInfoTab("location")}>
                        <i className="fa-solid fa-location-dot"></i>
                        <span className="footer-label">Location</span>
                    </button>
                    )}

                    <button className="footer-basic-item" style={{ background: "none", border: "none", ...labelStyle }} onClick={() => toggleCard("contact")}>
                        <span className="footer-icon" style={iconMaskStyle("/Contact.png")} />
                        <span className="footer-label">Contact</span>
                    </button>
                  </div>
                )}
            </div>

        </>
    );
}