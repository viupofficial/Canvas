"use client"

import React, { useState } from "react"
import { useEventDataOptional } from "@/src/store/EventDataContext"
import { buildIcs, icsFilename } from "@/src/lib/calendar/icsBuilder"
import { buildGoogleCalendarLink } from "@/src/lib/calendar/googleCalendarLink"
import type { CalendarExportInput } from "@/src/lib/calendar/normalizeEvent"


export default function EventFooter({
  contacts: contactsProp,
  moneyGift: moneyGiftProp,
  calendar: calendarProp,
  location: locationProp,
  rsvpConfig: rsvpConfigProp,
}: {
  contacts?: any[];
  moneyGift?: {
    bank: string;
    account: number | string;
    image: string | null;
  } | null;
  calendar?: {
    date: string;
    endDate?: string;
    title?: string;
    description?: string;
    reminderMinutes?: number;
  } | null;
  location?: { address: string } | null;
  rsvpConfig?: {
    maxGuest?: number;
    navColor?: string;
    navOpacity?: number;
    textColor?: string;
    textOpacity?: number;
  } | null;
}) {
  // Prefer the shared store (editor page) — fall back to props (export/SSR).
  const ctx = useEventDataOptional();
  const contacts = ctx?.eventData.contacts ?? contactsProp ?? [];
  const moneyGift = ctx?.eventData.moneyGift ?? moneyGiftProp ?? null;
  const calendar = ctx?.eventData.calendar ?? calendarProp ?? null;
  const location = ctx?.eventData.location ?? locationProp ?? null;
  const rsvpConfig = ctx?.eventData.rsvpConfig ?? rsvpConfigProp ?? null;

  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [rsvpStatus, setRsvpStatus] = useState<null | "accept" | "decline">(null);
  const [copied, setCopied] = useState(false);

  const handleCopyAccount = async () => {
    const accountNumber = String(moneyGift?.account || "154080219940");
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = accountNumber;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Reset RSVP sub-state whenever the card is closed
  const toggleCard = (card: string) => {
    if (activeCard === card) {
      setActiveCard(null);
      setRsvpStatus(null);
    } else {
      setActiveCard(card);
    }
  };

  // Compute footer nav bar styles from rsvpConfig
  const navOpacityHex = Math.round(((rsvpConfig?.navOpacity ?? 100) / 100) * 255)
    .toString(16).padStart(2, "0");
  const footerBg = rsvpConfig?.navColor
    ? `${rsvpConfig.navColor}${navOpacityHex}`
    : "rgba(0,0,0,0.85)";
  const rsvpCircleBg = rsvpConfig?.navColor ?? "#000000";
  const labelColor = rsvpConfig?.textColor ?? "white";
  const labelOpacity = (rsvpConfig?.textOpacity ?? 100) / 100;
  const labelStyle: React.CSSProperties = { color: labelColor, opacity: labelOpacity };
  const maxPax = rsvpConfig?.maxGuest ?? 3;
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
  return {
    date: cal.date,
    endDate: cal.endDate,
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

// Format a date as YYYYMMDD for Google Calendar embed's `dates=` parameter,
// which navigates the iframe to that specific day.
const formatEmbedDate = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
};
    console.log("FOOTER contacts:", contacts);
    const [infoTab, setInfoTab] = useState(null)
    return (

        <>
            {/* CONTACT CARD */}
            {activeCard === "contact" && (

                <div className="contact-card contact-popup">
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
            {activeCard === "gift" && (

                <div className="moneygift-card">
                    <h3>Money Gift</h3>

                  <div className="bank-info">
                    <input
                      type="text"
                      style={{ textAlign: "center" }}
                      value={moneyGift?.bank || "Maybank Berhad"}
                      readOnly
                    />
                  </div>

                  <div className="account-wrapper">
                    <input
                      type="text"
                      style={{ textAlign: "center" }}
                      id="account-number"
                      value={moneyGift?.account || "154080219940"}
                      readOnly
                    />
                    <button
                      type="button"
                      onClick={handleCopyAccount}
                      aria-label="Copy account number"
                      title={copied ? "Copied!" : "Copy account number"}
                    >
                      <i className={copied ? "fas fa-check" : "fa-regular fa-copy"}></i>
                    </button>
                  </div>

<div className="qr-wrapper">
  <img src={moneyGift?.image || "/MayaQRimage.png"} alt="QR Code" />
</div>

                </div>

            )}

            {/* RSVP CARD */}
            {activeCard === "rsvp" && (

                <div className="contact-card rsvp-popup">

                    <h2
                        style={{
                            textAlign: "center",
                            fontFamily: "Montserrat",
                            fontSize: "20px",
                            paddingBottom: "20px",
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
                            paddingBottom: "15px",
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

                    {/* Step 2: Form shown after choosing Accept or Decline */}
                    {rsvpStatus !== null && (
                        <form className="rsvp-form" style={{ display: "flex", marginTop: "1rem" }}
                            onSubmit={(e) => {
                                e.preventDefault();
                                alert(rsvpStatus === "accept" ? "RSVP submitted! See you there 🎉" : "Thank you for letting us know.");
                                setRsvpStatus(null);
                                setActiveCard(null);
                            }}
                        >
                            <input type="hidden" name="status" value={rsvpStatus === "accept" ? "Attending" : "Not Attending"} />

                            <div className="form-group">
                                <label style={{ paddingBottom: "8px" }}>Name</label>
                                <input type="text" name="name" required />
                            </div>
                             <div className="form-group">
                                        <label style={{ paddingBottom: "8px" }}>Phone No.</label>
                                        <input type="tel" name="phone" required />
                                    </div>

                            {rsvpStatus === "accept" && (
                                <>
                                    <div className="form-group">
                                        <label style={{ paddingBottom: "8px" }}>Phone No.</label>
                                        <input type="tel" name="phone" required />
                                    </div>

                                    <div className="form-group">
                                        <label style={{ paddingBottom: "8px" }}>Number of Pax</label>
                                        <select name="pax" required className="styled-select">
                                            <option value="">-- Select --</option>
                                            {Array.from({ length: maxPax }, (_, i) => i + 1).map((n) => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <p className="info-line">
                                        <span className="material-symbols-outlined">info</span>
                                        If more than {maxPax} pax, please contact the family members.
                                    </p>
                                </>
                            )}

                            <div className="rsvp-submit-buttons" style={{ display: "flex" }}>
                                <button type="submit">Submit</button>
                                <button type="button" onClick={() => setRsvpStatus(null)}>Back</button>
                            </div>
                        </form>
                    )}

                </div>

            )}

            {/* GUESTBOOK POPUP */}
            {activeCard === "guestbook" && (

                <div className="guestbook-overlay">

                    <div className="guestbook-modal">

                        <h3 style={{ paddingBottom: "10px", fontFamily: "Montserrat, sans-serif" }}>
                            Share Your Wishes
                        </h3>

                        <div className="form-group">
                            <textarea
                                id="wish"
                                style={{ paddingBottom: "85px" }}
                                required
                            />
                            <label
                                htmlFor="wish"
                                style={{ fontFamily: "Montserrat", color: "#7D5B59" }}
                            >
                                Wish
                            </label>
                        </div>

                        <div className="form-group">
                            <input type="text" id="name" required />
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
                                onClick={() => {
                                    alert("Wish sent! 💌")
                                }}
                            >
                                Send
                            </button>

                            <button
                                type="button"
                                style={{ fontFamily: "Montserrat" }}
                                onClick={() => setActiveCard(null)}
                            >
                                Close
                            </button>

                        </div>

                    </div>

                </div>

            )}
            {/* INFO CARD */}
            {activeCard === "info" && (

                <div className="info-popup">

                    <div id="info-buttons">

                        <button
                            className="floating-btn"
                            onClick={() => setInfoTab("calendar")}
                        >
                            <i className="fa-regular fa-calendar-days"></i>
                            <span>Calendar</span>
                        </button>

                        <button
                            className="floating-btn"
                            onClick={() => setInfoTab("location")}
                        >
                            <i className="fa-solid fa-location-dot"></i>
                            <span>Location</span>
                        </button>

                    </div>


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

                            <p style={{
                                textAlign: "center",
                                fontFamily: "Montserrat",
                                fontSize: "16px",
                                marginBottom: "10px",
                                width: "100%",
                                fontWeight: "100",
                                paddingBottom: "5px"
                            }}>
                               <strong>
  {calendar?.date ? formatDate(calendar.date) : "Select a date"}
</strong>
                            </p>

                            {(() => {
                              const embedBase =
                                "https://calendar.google.com/calendar/embed?src=ddefc266bd7c7842321350b3a6d56e76494d5e4cc97846120d26541d4c141c20%40group.calendar.google.com&ctz=Asia%2FKuala_Lumpur";
                              const ymd = calendar?.date ? formatEmbedDate(calendar.date) : null;
                              // Append `dates=YYYYMMDD/YYYYMMDD` so the iframe navigates
                              // to the saved date (e.g. 30 May shows May with that day in view).
                              const embedSrc = ymd
                                ? `${embedBase}&dates=${ymd}/${ymd}`
                                : embedBase;
                              return (
                                <iframe
                                  key={ymd ?? "no-date"}
                                  src={embedSrc}
                                  style={{ border: 0 }}
                                  width="350"
                                  height="350"
                                />
                              );
                            })()}

                            <div className="calendar-links"
                                style={{ gap: "5px", paddingTop: "20px", paddingBottom: "15px" }}>

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
                                 style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
                               >
                                 <img src="/AppleCal_btn.png" style={{ width: "50%" }} />
                               </button>

                                <a
  target="_blank"
  rel="noopener noreferrer"
  href={generateGoogleCalendarLink(calendar, location)}
>
  <img src="/GoogleCal_btn.png" style={{ width: "50%" }} />
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
                                gap: "10px",
                                paddingTop: "20px"
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
            <div className="footer-container" style={{ background: footerBg }}>
                <div className="footer-rsvp-wrapper">
                    <div className="footer-rsvp" style={{ backgroundColor: rsvpCircleBg }} onClick={() => toggleCard("rsvp")}>RSVP</div>
                </div>

                <div className="footer-rsvp-text" style={labelStyle}>RSVP</div>

                <div className="footer-buttons">
                    <div className="footer-side left">
                        <a className="footer-guestbook" style={labelStyle} onClick={() => toggleCard("guestbook")}>
                            <img id="guestbook-icon" src="/Guestbook.png" />
                            <span className="footer-label">Guestbook</span>
                        </a>

                        <a className="moneygift-toggle" style={labelStyle} onClick={() => toggleCard("gift")}>
                            <img id="moneygift-icon" src="/MONEYGIFT.png" />
                            <span className="footer-label">Gift</span>
                        </a>
                    </div>

                    <div className="footer-side right">
                        <a className="footer-info" style={labelStyle} onClick={() => toggleCard("info")}>
                            <i className="fa-regular fa-star floating-star"></i>
                            <span className="footer-label" style={{ marginTop: "27px" }}>Info</span>
                        </a>

                        <button className="contact-toggle" style={{ background: "none", border: "none", ...labelStyle }} onClick={() => toggleCard("contact")}>
                            <img id="contact-icon" src="/Contact.png" />
                            <span className="footer-label">Contact</span>
                        </button>
                    </div>
                </div>
            </div>

        </>
    );
}