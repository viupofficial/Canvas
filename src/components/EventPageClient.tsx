"use client";

import PreviewShell from "@/src/components/PreviewShell";

export default function EventPageClient({ data }: { data: any }) {
  // The stored event JSON is already shaped like the shell payload; hand it
  // straight through so the live page renders with the exact same full-bleed
  // layout/scaling/footer rules as the local preview.
  return (
    <PreviewShell
      data={{
        pages: data.pages ?? [],
        envelope: data.envelope ?? null,
        musicUrl: data.musicUrl ?? null,
        borderUrl: data.borderUrl ?? null,
        contacts: data.contacts ?? [],
        moneyGift: data.moneyGift ?? null,
        calendar: data.calendar ?? null,
        location: data.location ?? null,
        rsvpConfig: data.rsvpConfig ?? null,
        userId: data.userId ?? null,
        eventId: data.eventId ?? null,
        packageId: data.packageId ?? null,
      }}
    />
  );
}
