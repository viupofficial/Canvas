// Canonical slug + live-link helpers for the published invitation page.
//
// The slug rule lives HERE (one place) so every consumer agrees on it:
//   - the client that writes the published blob (events/{slug}.json)
//   - the token issuer that validates the blob path (/api/export-to-rsvp)
//   - the iFastNet sync route that reports canvas_slug back to PHP
//   - the editor's "Share Link" / live-preview link shown to the user
//
// The EVENT ID is the single source of truth:
//   event id 456  →  slug "event-456"
//               →  blob "events/event-456.json"
//               →  link "https://canvas.vi-up.com/e/event-456"
//
// Why not the title (the old rule): a title-derived slug published to a NEW
// blob path on every rename, so links already shared with guests froze on the
// previously published version; and two customers with the same event title
// ("Wedding") collided on ONE blob path, letting one invitation overwrite the
// other. An event id is stable and unique, so republishing always overwrites
// the same blob and a shared link never breaks.

export const EVENT_SLUG_PREFIX = "event-";

// Slug shape both the blob-path guard and the sync route validate against.
const EVENT_SLUG_RE = /^event-[1-9][0-9]*$/;

// Build the canonical slug for an event id. Returns null — never a fallback
// slug — when the id is missing or not a positive integer, so a canvas that is
// not bound to an event can NOT publish over some other path.
//
// Ids arrive as strings (URL params, JSON bodies), so parsing is deliberately
// strict rather than a bare Number(): "1e3", "0x1c8" and " 456 " all coerce to
// a DIFFERENT, valid event id, which would publish over another customer's
// invitation. Only plain decimal digits are accepted.
export function eventSlug(eventId: string | number | null | undefined): string | null {
  if (eventId === null || eventId === undefined) return null;
  const raw = typeof eventId === "number" ? String(eventId) : String(eventId).trim();
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) return null;
  return `${EVENT_SLUG_PREFIX}${id}`;
}

export function isEventSlug(slug: string | null | undefined): boolean {
  return typeof slug === "string" && EVENT_SLUG_RE.test(slug);
}

// The one place the published blob path is spelled out.
export function eventBlobPath(slug: string): string {
  return `events/${slug}.json`;
}

// Guard used by the upload-token route: the browser may only ever write to the
// deterministic path of a real event slug, never to an arbitrary blob key.
export function isEventBlobPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== "string") return false;
  const match = /^events\/(.+)\.json$/.exec(pathname);
  return !!match && isEventSlug(match[1]);
}

// The published invitation is always served from the public canvas host, so a
// shared link is identical regardless of where the editor itself runs (localhost,
// LAN, preview deploy). Keep this as the ONE source of the public base URL.
export const LIVE_EVENT_BASE_URL = "https://canvas.vi-up.com";

// Build the canonical public link for a published event slug:
//   https://canvas.vi-up.com/e/event-{eventId}
//
// The link is permanent for the life of the event: renaming the title, or
// republishing any number of times, keeps writing to the same slug.
export function liveEventUrl(slug: string): string {
  return `${LIVE_EVENT_BASE_URL}/e/${slug}`;
}
