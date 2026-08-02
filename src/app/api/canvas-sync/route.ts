import { NextRequest, NextResponse } from "next/server";
import { eventSlug } from "@/src/lib/slug";

// Server-side bridge between a successful blob publish and iFastNet (PHP).
//
// Called by the editor's "Share Link" AFTER the invitation JSON has landed in
// blob storage. It tells PHP which canvas slug now serves the event, so the
// MyEvent card / RSVP pages can link to the live invitation.
//
// Why this exists as a route (and not a fetch from the browser):
//   - IFASTNET_CANVAS_SYNC_SECRET is server-only. It is sent as a Bearer token
//     and must never reach client code, a NEXT_PUBLIC_ var or a network tab.
//   - canvas_slug is DERIVED here from event_id (see eventSlug), so the browser
//     cannot claim an arbitrary slug for an event.
//
// Required env (server-only, no NEXT_PUBLIC_ prefix):
//   IFASTNET_CANVAS_SYNC_URL     e.g. https://vi-up.com/api/sync_canvas_slug.php
//   IFASTNET_CANVAS_SYNC_SECRET  shared secret, sent as "Authorization: Bearer …"
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Upstream is shared PHP hosting — fail fast rather than hanging the Share
// button (and the serverless function) on a stalled connection.
const SYNC_TIMEOUT_MS = 15_000;

// Strict positive-integer parse (same rule as eventSlug): a bare Number() would
// accept "1e3" / "0x1c8" and quietly report a different id to PHP.
function toId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

// Hosts allowed to appear in the share link PHP hands back. The URL is copied
// to a customer's clipboard and opened in their browser, so validate it here
// rather than trusting the upstream body: a mangled or hostile value would
// otherwise become an open redirect (or a javascript: URL) with our UI's
// blessing. vi-up.com and its subdomains only.
function pickShareUrl(data: any): string | null {
  const candidate = data?.public_share_url ?? data?.data?.public_share_url;
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "vi-up.com" && !host.endsWith(".vi-up.com")) return null;
  return parsed.toString();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const syncUrl = process.env.IFASTNET_CANVAS_SYNC_URL;
  const syncSecret = process.env.IFASTNET_CANVAS_SYNC_SECRET;

  // Misconfiguration is a deploy problem, not a user problem — say so plainly
  // without echoing either value back to the client.
  if (!syncUrl || !syncSecret) {
    console.error("[canvas-sync] missing IFASTNET_CANVAS_SYNC_URL / _SECRET");
    return NextResponse.json(
      { ok: false, error: "Canvas sync is not configured on the server." },
      { status: 500 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const userId = toId(body?.user_id);
  const eventId = toId(body?.event_id);
  const designId = toId(body?.design_id);
  const packageId = toId(body?.package_id);

  if (!userId || !eventId) {
    return NextResponse.json(
      { ok: false, error: "A user id and event id are required to sync this canvas." },
      { status: 400 },
    );
  }

  // Derived server-side — the client never chooses the slug.
  const canvasSlug = eventSlug(eventId);
  if (!canvasSlug) {
    return NextResponse.json({ ok: false, error: "Invalid event id." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(syncUrl, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({
        user_id: userId,
        event_id: eventId,
        design_id: designId,
        package_id: packageId,
        canvas_slug: canvasSlug,
      }),
    });
  } catch (err: any) {
    console.error("[canvas-sync] request failed:", err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: "Could not reach the vi-up.com sync service. Please try again." },
      { status: 502 },
    );
  }

  // PHP occasionally answers with an HTML error page; read as text first so a
  // non-JSON body becomes a clear error instead of a parse crash.
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* non-JSON upstream response — handled below */
  }

  if (!res.ok || data?.success === false) {
    const message = data?.message || data?.error || `Sync failed (HTTP ${res.status}).`;
    console.error("[canvas-sync] upstream rejected:", res.status, raw.slice(0, 500));
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  // iFastNet owns the customer-facing URL (https://vi-up.com/e/{event-title-slug}),
  // which wraps the canvas page in the user_event iframe. Without it there is
  // nothing safe to share, so a "successful" sync that omits it is still a
  // failure — the canvas URL must never be handed to a customer as a fallback.
  const publicShareUrl = pickShareUrl(data);
  if (!publicShareUrl) {
    console.error("[canvas-sync] upstream returned no usable public_share_url:", raw.slice(0, 500));
    return NextResponse.json(
      { ok: false, error: "vi-up.com did not return a share link for this event." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    // The customer-facing link — this is what gets copied / opened.
    public_share_url: publicShareUrl,
    // Internal only: the blob slug behind https://canvas.vi-up.com/e/{slug},
    // which iFastNet embeds as the iframe source. Returned for logging/debug.
    canvas_slug: canvasSlug,
  });
}
