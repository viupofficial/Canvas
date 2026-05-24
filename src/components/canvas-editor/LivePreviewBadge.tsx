"use client";

import { useEventDataOptional } from "@/src/store/EventDataContext";

const SECTION_LABEL: Record<string, string> = {
  contacts: "Contact",
  location: "Location",
  calendar: "Calendar",
  moneyGift: "Gift",
  rsvpConfig: "RSVP",
};

export default function LivePreviewBadge() {
  const ctx = useEventDataOptional();
  if (!ctx) return null;

  const { isPreviewPulsing, lastUpdatedSection } = ctx;
  const label = lastUpdatedSection ? SECTION_LABEL[lastUpdatedSection] : null;

  return (
    <div
      className={`pointer-events-none select-none flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold transition-all duration-300 ${
        isPreviewPulsing
          ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300 shadow-sm"
          : "bg-neutral-100 text-neutral-500"
      }`}
      aria-live="polite"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isPreviewPulsing ? "bg-emerald-500 animate-pulse" : "bg-neutral-400"
        }`}
      />
      Live Preview{isPreviewPulsing && label ? ` · ${label}` : " Active"}
    </div>
  );
}
