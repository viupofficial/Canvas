"use client";

import { useEffect, useState, useCallback } from "react";
import RsvpPlayer from "@/src/components/RsvpPlayer";
import EventFooter from "@/src/components/EventFooter";
import { getCanvasGuestbook } from "@/src/lib/viupApi";

export default function EventPageClient({ data }: { data: any }) {
  const userId = data.userId ?? null;
  const eventId = data.eventId ?? null;
  const [guestMessages, setGuestMessages] = useState<{ message: string; sender: string }[]>([]);

  useEffect(() => {
    if (!userId || !eventId) return;
    getCanvasGuestbook({ userId, eventId })
      .then((res) => {
        const entries = (res.entries || []).map((e: any) => ({
          message: e.message || e.wish || "",
          sender: e.sender || e.name || "",
        }));
        if (entries.length) setGuestMessages(entries);
      })
      .catch(() => {});
  }, [userId, eventId]);

  const handleGuestbookUpdate = useCallback((entries: { message: string; sender: string }[]) => {
    setGuestMessages(entries);
  }, []);

  return (
    <>
      <RsvpPlayer
        pages={data.pages ?? []}
        envelope={data.envelope ?? null}
        musicUrl={data.musicUrl ?? null}
        borderUrl={data.borderUrl ?? null}
        eventDate={data.calendar?.date ?? null}
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
        showRsvpAndMoneyGift={Number(data.packageId) !== 1}
      />
    </>
  );
}
