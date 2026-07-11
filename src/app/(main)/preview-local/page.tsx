"use client";

import { useEffect, useState } from "react";
import PreviewShell from "@/src/components/PreviewShell";
import { extractEnvelope } from "@/src/lib/extract-envelope";
import { loadLocalPreview } from "@/src/lib/localPreview";
import "../../globals.css";

export default function PreviewLocalPage() {
  const [data, setData] = useState<any | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // The editor opens this tab before its async IndexedDB write completes, so
    // poll briefly until the payload lands instead of giving up immediately.
    const fetchPayload = async () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const payload = await loadLocalPreview<any>();
        if (cancelled) return null;
        if (payload) return payload;
        await new Promise((r) => setTimeout(r, 150));
      }
      return null;
    };

    (async () => {
    try {
      const payload = await fetchPayload();
      if (cancelled) return;
      if (!payload) {
        setMissing(true);
        return;
      }
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
              extras: env.extras,
            }
          : null,
        musicUrl: payload.musicUrl ?? null,
        borderUrl,
        contacts: payload.contacts ?? [],
        moneyGift: payload.moneyGift ?? null,
        calendar: payload.calendar ?? null,
        location: payload.location ?? null,
        rsvpConfig: payload.rsvpConfig ?? null,
        userId: payload.userId ?? null,
        eventId: payload.eventId ?? null,
        packageId: payload.packageId ?? null,
      });
    } catch (e) {
      console.error("[preview-local] failed to parse", e);
      if (!cancelled) setMissing(true);
    }
    })();

    return () => {
      cancelled = true;
    };
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

  return <PreviewShell data={data} />;
}
