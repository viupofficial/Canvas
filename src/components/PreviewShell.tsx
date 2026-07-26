"use client";

import { useEffect, useState, useCallback } from "react";
import RsvpPlayer from "@/src/components/RsvpPlayer";
import EventFooter from "@/src/components/EventFooter";
import PhonePreviewFrame from "@/src/components/PhonePreviewFrame";
import { getCanvasGuestbook } from "@/src/lib/viupApi";
import { getPackageRules } from "@/src/lib/packageRules";
import { normalizePresentationMode, type PresentationMode } from "@/src/lib/presentationMode";

/**
 * Shared preview shell used by BOTH the local preview (/preview-local) and the
 * live event page (/e/[slug]). Keeping the layout in one place guarantees the
 * two stay visually identical — same full-bleed canvas scaling (fillMode
 * "cover"), same footer/overlay containment (.preview-local CSS), same package
 * gating — so they can't drift apart again.
 *
 * Callers are responsible for shaping `data` into the common payload below; the
 * shell only renders it and wires up the guestbook fetch.
 */
export type PreviewShellData = {
  pages: any[];
  envelope: any | null;
  musicUrl: string | null;
  borderUrl: string | null;
  contacts?: any[];
  moneyGift?: any | null;
  calendar?: any | null;
  location?: any | null;
  rsvpConfig?: any | null;
  userId?: string | number | null;
  eventId?: string | number | null;
  packageId?: string | number | null;
  // "page" (default) or "scroll" — the single source of truth for how the
  // invitation is presented, shared by /preview-local and the published /e page.
  presentationMode?: PresentationMode | string | null;
};

export default function PreviewShell({ data }: { data: PreviewShellData }) {
  const userId = data.userId ?? null;
  const eventId = data.eventId ?? null;
  const [guestMessages, setGuestMessages] = useState<{ message: string; sender: string }[]>([]);

  useEffect(() => {
    if (!userId || !eventId) return;
    let cancelled = false;
    getCanvasGuestbook({ userId, eventId })
      .then((res) => {
        if (cancelled) return;
        const entries = (res.entries || []).map((e: any) => ({
          message: e.message || e.wish || "",
          sender: e.sender || e.name || "",
        }));
        if (entries.length) setGuestMessages(entries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, eventId]);

  const handleGuestbookUpdate = useCallback(
    (entries: { message: string; sender: string }[]) => {
      setGuestMessages(entries);
    },
    []
  );

  return (
    <PhonePreviewFrame>
    <main className="preview-local" style={{ width: "100%", position: "relative" }}>
      <RsvpPlayer
        pages={data.pages}
        envelope={data.envelope}
        musicUrl={data.musicUrl}
        borderUrl={data.borderUrl}
        eventDate={data.calendar?.date ?? null}
        fillMode="cover"
        presentationMode={normalizePresentationMode(data.presentationMode)}
        guestMessages={guestMessages.length > 0 ? guestMessages : undefined}
      />
      <EventFooter
        contacts={data.contacts ?? []}
        moneyGift={data.moneyGift ?? null}
        calendar={data.calendar ?? null}
        location={data.location ?? null}
        rsvpConfig={data.rsvpConfig ?? null}
        userId={userId}
        eventId={eventId}
        onGuestbookUpdate={handleGuestbookUpdate}
        showRsvpAndMoneyGift={getPackageRules(data.packageId).showRsvpAndMoneyGift}
      />
    </main>
    </PhonePreviewFrame>
  );
}
