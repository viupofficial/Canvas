import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { extractEnvelope } from "@/src/lib/extract-envelope";
import { slugify } from "@/src/lib/slug";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pages, musicUrl, eventName, contacts, moneyGift, calendar, location, rsvpConfig, borders, userId, eventId, packageId } = body;
    // Title-derived slug (shared rule) — the blob is stored at events/{slug}.json
    // and the editor builds the live link from the same slug, so they always match.
    const slug = slugify(eventName);

    const env = extractEnvelope(pages ?? []);
    const borderList = Array.isArray(borders) ? borders : [];
    const borderUrl  = borderList.length > 0 ? borderList[0].url : null;

    const payload = {
      eventName: eventName ?? "",
      pages: env.remainingPages,
      envelope: env.hasEnvelope ? {
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
      } : null,
      musicUrl: musicUrl ?? null,
      borderUrl,
      contacts: contacts ?? [],
      moneyGift: moneyGift ?? null,
      calendar: calendar ?? null,
      location: location ?? null,
      rsvpConfig: rsvpConfig ?? null,
      userId: userId ?? null,
      eventId: eventId ?? null,
      packageId: packageId ?? null,
    };

    await put(`events/${slug}.json`, JSON.stringify(payload), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN,
    });

    return NextResponse.json({ ok: true, slug });
  } catch (err: any) {
    console.error("export-to-rsvp error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
