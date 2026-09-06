"use client";

import { useEventDataOptional, giftAccounts, packTypeOptions, guestSideOptions, rsvpTexts, resolveCardTexts, type CalendarData, type GiftData, type LocationData, type ResolvedCardTexts } from "@/src/store/EventDataContext";
import { cssBackground, firstColorHex, type GradientDescriptor } from "@/src/lib/gradient";
import GiftCarousel from "@/src/components/GiftCarousel";

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
  // Same reader the invitation footer uses, so the panel previews the host's
  // headings (and the Money Gift note) exactly as guests will read them.
  const cardText = resolveCardTexts(eventData.cardTexts);

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
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
        {activeTab === "contact" && <ContactCard contacts={contacts} title={cardText.contactTitle} />}
        {activeTab === "location" && <LocationCard location={location} title={cardText.locationTitle} />}
        {activeTab === "calendar" && <CalendarCard calendar={calendar} title={cardText.calendarTitle} />}
        {activeTab === "money" && <GiftCard moneyGift={moneyGift} cardText={cardText} />}
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

function ContactCard({
  contacts,
  title,
}: {
  contacts: { name: string; phone: string }[];
  title: string;
}) {
  const list = contacts.length ? contacts : [{ name: "—", phone: "" }];
  return (
    <CardFrame title={title}>
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

function LocationCard({ location, title }: { location: LocationData; title: string }) {
  const address = location?.address || "Enter a location";
  const mapSrc = location?.address
    ? `https://www.google.com/maps?q=${encodeURIComponent(location.address)}&output=embed`
    : "";
  return (
    <CardFrame title={title}>
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

function CalendarCard({ calendar, title }: { calendar: CalendarData; title: string }) {
  return (
    <CardFrame title={title}>
      <p className="text-[11px] text-center text-[#191212] font-semibold mb-1">
        {calendar?.date ? formatDate(calendar.date) : "Select a date"}
      </p>
      {(calendar?.startTime || calendar?.endTime) && (
        <p className="text-[10px] text-center text-[#7D5B59] mb-2">
          {calendar.startTime ?? ''}
          {calendar.startTime && calendar.endTime ? ' – ' : ''}
          {calendar.endTime ?? ''}
        </p>
      )}
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
  cardText,
}: {
  moneyGift: GiftData;
  cardText: ResolvedCardTexts;
}) {
  const accounts = giftAccounts(moneyGift);
  // Empty section: keep the placeholder card the panel showed before anything
  // was filled in.
  const slides = (accounts.length > 0 ? accounts : [{ bank: "", account: "", image: null }]).map(
    (acc, i) => (
      <div className="flex flex-col items-center gap-2 w-full" key={i}>
        <div className="text-[11px] text-center font-semibold text-[#191212]">
          {acc.bank || "Bank name"}
        </div>
        <div className="text-[11px] text-center text-[#7D5B59] tracking-wider">
          {acc.account || "0000 0000 0000"}
        </div>
        {acc.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={acc.image} alt="QR" className="w-20 h-20 object-contain rounded-md" draggable={false} />
        ) : (
          <div className="w-20 h-20 rounded-md bg-white border flex items-center justify-center overflow-hidden">
            <span className="text-[9px] text-neutral-400">QR preview</span>
          </div>
        )}
      </div>
    ),
  );
  return (
    <CardFrame title={cardText.giftTitle}>
      {cardText.giftNoteEnabled && (
        <p className="text-[9px] italic leading-snug text-center text-[#7D5B59] mb-2">
          {cardText.giftNote}
        </p>
      )}
      {/* Same swipeable gallery as the invitation footer, at panel scale. */}
      <GiftCarousel slides={slides} itemLabel="account" />
    </CardFrame>
  );
}

function RSVPCard({
  rsvpConfig,
}: {
  rsvpConfig: {
    maxGuest?: number;
    packTypeEnabled?: boolean;
    packTypeOption1?: string;
    packTypeOption2?: string;
    guestSideEnabled?: boolean;
    guestSideOption1?: string;
    guestSideOption2?: string;
    // Host-written wording for the RSVP card (blank/absent ⇒ default wording).
    title?: string;
    question?: string;
    paxNote?: string;
    navColor?: string | GradientDescriptor;
    navOpacity?: number;
    textColor?: string;
    textOpacity?: number;
  } | null;
}) {
  // navColor may be a gradient — Accept's background can render it directly;
  // Decline's text/border take a representative solid color instead.
  const navBg = cssBackground(rsvpConfig?.navColor ?? "#000000");
  const navColor = firstColorHex(rsvpConfig?.navColor, "#000000");
  const navOpacity = (rsvpConfig?.navOpacity ?? 100) / 100;
  const textColor = rsvpConfig?.textColor || "#000000";
  const textOpacity = (rsvpConfig?.textOpacity ?? 100) / 100;
  const maxGuest = rsvpConfig?.maxGuest ?? 3;
  // Same reader the invitation uses, so the panel previews the host's wording
  // (and the substituted pax number) exactly as guests will read it.
  const rsvpText = rsvpTexts(rsvpConfig, maxGuest);

  return (
    <CardFrame title={rsvpText.title}>
      <p
        className="text-[11px] text-center italic mb-2"
        style={{ color: textColor, opacity: textOpacity }}
      >
        {rsvpText.question}
      </p>
      <div className="flex gap-2 mb-2">
        <button
          className="flex-1 py-1 rounded text-[10px] font-bold text-white"
          style={{ background: navBg, opacity: navOpacity }}
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
      {/* Guest Side, previewed in flow order — it is the card an accepting guest
          sees before the category one. Opt-in, so an unset/false flag leaves
          this card exactly as it was. */}
      {rsvpConfig?.guestSideEnabled === true && (
        <>
          <p
            className="text-[11px] text-center italic mb-2"
            style={{ color: textColor, opacity: textOpacity }}
          >
            Are you a guest of?
          </p>
          <div className="flex gap-2 mb-2">
            {guestSideOptions(rsvpConfig).map((label) => (
              <button
                key={label}
                className="flex-1 py-1 rounded text-[10px] font-bold border"
                style={{ color: navColor, borderColor: navColor, opacity: navOpacity }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Guest Category, previewed exactly as an accepting guest sees it. Opt-in,
          so an unset/false flag leaves this card as it was. */}
      {rsvpConfig?.packTypeEnabled === true && (
        <>
          <p
            className="text-[11px] text-center italic mb-2"
            style={{ color: textColor, opacity: textOpacity }}
          >
            Are you coming as?
          </p>
          <div className="flex gap-2 mb-2">
            {packTypeOptions(rsvpConfig).map((label) => (
              <button
                key={label}
                className="flex-1 py-1 rounded text-[10px] font-bold border"
                style={{ color: navColor, borderColor: navColor, opacity: navOpacity }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="text-[10px]" style={{ color: textColor, opacity: textOpacity }}>
        Max guests: <span className="font-semibold">{maxGuest}</span>
      </div>
      {/* The note an accepting guest sees beside the pax dropdown. */}
      <p
        className="text-[10px] leading-snug mt-1"
        style={{ color: textColor, opacity: textOpacity }}
      >
        {rsvpText.paxNote}
      </p>
    </CardFrame>
  );
}
