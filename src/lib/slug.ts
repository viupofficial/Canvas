// Canonical slug + live-link helpers for the published invitation page.
//
// The slug rule lives HERE (one place) so every consumer agrees on it:
//   - the server that writes the published blob (events/{slug}.json)
//   - the editor's "Share Link" / live-preview link shown to the user
// The canvas/event TITLE is the single source of truth — change the title and
// the generated slug (and therefore the live link) changes with it.
//
// Slug rules:
//   - lowercase
//   - spaces, punctuation and any run of unsafe characters collapse to ONE hyphen
//   - only [a-z0-9] and hyphens survive
//   - no leading/trailing hyphens, never a doubled hyphen
//   - empty / all-unsafe titles fall back to "rsvp" (never an empty slug)
//
// Example: "Ali & Aisyah Wedding!" → "ali-aisyah-wedding"
export function slugify(title: string | null | undefined): string {
  return (title ?? "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // unsafe runs → a single hyphen (no doubles)
    .replace(/^-+|-+$/g, "")     // trim hyphens from both ends
    || "rsvp";                   // guarantee a non-empty, route-safe slug
}

// The published invitation is always served from the public canvas host, so a
// shared link is identical regardless of where the editor itself runs (localhost,
// LAN, preview deploy). Keep this as the ONE source of the public base URL.
export const LIVE_EVENT_BASE_URL = "https://canvas.vi-up.com";

// Build the canonical public link for a published event slug:
//   https://canvas.vi-up.com/e/{slug}
//
// NOTE ON OLD LINKS: the published blob is stored at events/{slug}.json keyed by
// this title-derived slug. Renaming the title publishes to a NEW slug, so a link
// shared under the OLD title keeps pointing at the previously published blob and
// is not automatically redirected. Re-share the link after a title change.
export function liveEventUrl(slug: string): string {
  return `${LIVE_EVENT_BASE_URL}/e/${slug}`;
}
