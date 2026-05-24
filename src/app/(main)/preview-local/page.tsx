"use client";

import { useEffect, useState } from "react";
import RsvpPlayer from "@/src/components/RsvpPlayer";
import EventFooter from "@/src/components/EventFooter";
import { extractEnvelope } from "@/src/lib/extract-envelope";
import "../../globals.css";

export default function PreviewLocalPage() {
  const [data, setData] = useState<any | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("viup_local_preview");
      if (!raw) {
        setMissing(true);
        return;
      }
      const payload = JSON.parse(raw);
      const env = extractEnvelope(payload.pages ?? []);
      const borderList = Array.isArray(payload.borders) ? payload.borders : [];
      const borderUrl = borderList.length > 0 ? borderList[0].url : null;

      setData({
        pages: env.remainingPages,
        envelope: env.hasEnvelope
          ? {
              headSrc: env.headSrc,
              sealSrc: env.sealSrc,
              bodySrc: env.bodySrc,
              logoSrc: env.logoSrc,
              bgColor: env.bgColor,
              titleText: env.titleText,
              subtitleText: env.subtitleText,
              pressText: env.pressText,
              headPos: env.headPos,
              sealPos: env.sealPos,
              bodyPos: env.bodyPos,
              logoPos: env.logoPos,
              titlePos: env.titlePos,
              subtitlePos: env.subtitlePos,
              pressPos: env.pressPos,
              titleStyle: env.titleStyle,
              subtitleStyle: env.subtitleStyle,
              pressStyle: env.pressStyle,
            }
          : null,
        musicUrl: payload.musicUrl ?? null,
        borderUrl,
        contacts: payload.contacts ?? [],
        moneyGift: payload.moneyGift ?? null,
        calendar: payload.calendar ?? null,
        location: payload.location ?? null,
        rsvpConfig: payload.rsvpConfig ?? null,
      });
    } catch (e) {
      console.error("[preview-local] failed to parse", e);
      setMissing(true);
    }
  }, []);

  if (missing) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-xl font-bold">No local preview data</h1>
        <p className="mt-2 text-sm text-gray-600">
          Open the editor and click the local preview button to generate this view.
        </p>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="preview-local" style={{ maxWidth: 396, margin: "0 auto", position: "relative" }}>
      <RsvpPlayer
        pages={data.pages}
        envelope={data.envelope}
        musicUrl={data.musicUrl}
        borderUrl={data.borderUrl}
      />
      <EventFooter
        contacts={data.contacts}
        moneyGift={data.moneyGift}
        calendar={data.calendar}
        location={data.location}
        rsvpConfig={data.rsvpConfig}
      />
    </main>
  );
}
