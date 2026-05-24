"use client";

import { useEventDataOptional } from "@/src/store/EventDataContext";

type PreviewTab = "contact" | "location" | "calendar" | "rsvp" | "money";

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export default function LivePreviewPanel({ activeTab }: { activeTab: PreviewTab | null }) {
  const ctx = useEventDataOptional();
  if (!ctx || !activeTab) return null;

  const { eventData, isPreviewPulsing } = ctx;
  const { contacts, moneyGift, calendar, location, rsvpConfig } = eventData;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-[#7D5B59] uppercase tracking-wide">
          Live Preview
        </span>
        <span
          className={`inline-block h-2 w-2 rounded-full transition-colors ${
            isPreviewPulsing ? "bg-emerald-500 animate-pulse" : "bg-neutral-300"
          }`}
        />
      </div>

      <div
        className={`relative rounded-[18px] border overflow-hidden bg-gradient-to-b from-[#f8f1ee] to-[#efe4df] p-3 transition-shadow ${
          isPreviewPulsing ? "shadow-[0_0_0_2px_rgba(16,185,129,0.35)]" : "shadow-sm"
        }`}
        style={{ minHeight: 220 }}
      >
        {activeTab === "contact" && <ContactCard contacts={contacts} />}
        {activeTab === "location" && <LocationCard location={location} />}
        {activeTab === "calendar" && <CalendarCard calendar={calendar} />}
        {activeTab === "money" && <GiftCard moneyGift={moneyGift} />}
        {activeTab === "rsvp" && <RSVPCard rsvpConfig={rsvpConfig} />}
      </div>
    </div>
  );
}

function CardFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="bg-white rounded-[14px] p-3 shadow-sm"
      style={{ fontFamily: "Montserrat, sans-serif" }}
    >
      <h4 className="text-[13px] font-bold text-center text-[#191212] mb-2">{title}</h4>
      {children}
    </div>
  );
}

function ContactCard({ contacts }: { contacts: { name: string; phone: string }[] }) {
  const list = contacts.length ? contacts : [{ name: "—", phone: "" }];
  return (
    <CardFrame title="Contact">
      <div className="flex flex-col gap-2">
        {list.map((c, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-[11px] border-b last:border-b-0 py-1"
          >
            <span className="truncate text-[#191212]">{c.name || "—"}</span>
            {/* Match the real contact-card icons in EventFooter
                (Font Awesome phone + WhatsApp, loaded globally via layout.tsx). */}
            <div className="flex items-center gap-3 text-[#191212]">
              <i className="fas fa-phone text-[12px]" aria-hidden />
              <i className="fab fa-whatsapp text-[13px]" aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </CardFrame>
  );
}

function LocationCard({ location }: { location: { address: string } | null }) {
  const address = location?.address || "Enter a location";
  const mapSrc = location?.address
    ? `https://www.google.com/maps?q=${encodeURIComponent(location.address)}&output=embed`
    : "";
  return (
    <CardFrame title="Location">
      <p className="text-[11px] text-center text-[#191212] mb-2 break-words">{address}</p>
      {mapSrc ? (
        <iframe
          src={mapSrc}
          className="w-full rounded-md border-0"
          style={{ height: 100 }}
          loading="lazy"
        />
      ) : (
        <div className="w-full rounded-md bg-neutral-100 flex items-center justify-center text-[10px] text-neutral-400" style={{ height: 100 }}>
          Map preview will appear here
        </div>
      )}
    </CardFrame>
  );
}

function CalendarCard({ calendar }: { calendar: { date: string } | null }) {
  return (
    <CardFrame title="Calendar">
      <p className="text-[11px] text-center text-[#191212] font-semibold mb-2">
        {calendar?.date ? formatDate(calendar.date) : "Select a date"}
      </p>
      <div className="grid grid-cols-7 gap-1 text-[9px] text-center text-neutral-500">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="font-semibold">{d}</span>
        ))}
        {Array.from({ length: 14 }).map((_, i) => {
          const day = i + 1;
          const isSelected = calendar?.date
            ? new Date(calendar.date).getDate() === day
            : false;
          return (
            <span
              key={`d-${i}`}
              className={`py-0.5 rounded ${
                isSelected ? "bg-[#8C6B6B] text-white font-bold" : "text-neutral-400"
              }`}
            >
              {day}
            </span>
          );
        })}
      </div>
    </CardFrame>
  );
}

function GiftCard({
  moneyGift,
}: {
  moneyGift: { bank: string; account: number | string; image: string | null } | null;
}) {
  return (
    <CardFrame title="Money Gift">
      <div className="flex flex-col items-center gap-2">
        <div className="text-[11px] text-center font-semibold text-[#191212]">
          {moneyGift?.bank || "Bank name"}
        </div>
        <div className="text-[11px] text-center text-[#7D5B59] tracking-wider">
          {moneyGift?.account || "0000 0000 0000"}
        </div>
        <div className="w-20 h-20 rounded-md bg-white border flex items-center justify-center overflow-hidden">
          {moneyGift?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={moneyGift.image}
              alt="QR"
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-[9px] text-neutral-400">QR preview</span>
          )}
        </div>
      </div>
    </CardFrame>
  );
}

function RSVPCard({
  rsvpConfig,
}: {
  rsvpConfig: {
    maxGuest?: number;
    navColor?: string;
    navOpacity?: number;
    textColor?: string;
    textOpacity?: number;
  } | null;
}) {
  const navColor = rsvpConfig?.navColor || "#000000";
  const navOpacity = (rsvpConfig?.navOpacity ?? 100) / 100;
  const textColor = rsvpConfig?.textColor || "#000000";
  const textOpacity = (rsvpConfig?.textOpacity ?? 100) / 100;
  const maxGuest = rsvpConfig?.maxGuest ?? 3;

  return (
    <CardFrame title="RSVP">
      <p
        className="text-[11px] text-center italic mb-2"
        style={{ color: textColor, opacity: textOpacity }}
      >
        Will you attend the event?
      </p>
      <div className="flex gap-2 mb-2">
        <button
          className="flex-1 py-1 rounded text-[10px] font-bold text-white"
          style={{ backgroundColor: navColor, opacity: navOpacity }}
        >
          Accept
        </button>
        <button
          className="flex-1 py-1 rounded text-[10px] font-bold border"
          style={{ color: navColor, borderColor: navColor, opacity: navOpacity }}
        >
          Decline
        </button>
      </div>
      <div className="text-[10px]" style={{ color: textColor, opacity: textOpacity }}>
        Max guests: <span className="font-semibold">{maxGuest}</span>
      </div>
    </CardFrame>
  );
}
