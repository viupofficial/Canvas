// Publishing an invitation = TWO steps that must happen in this order, and the
// second only if the first succeeded:
//
//   1. the invitation JSON goes to blob storage at events/event-{eventId}.json
//   2. /api/canvas-sync tells iFastNet which canvas slug now serves the event
//      (server route — the Bearer secret never reaches the browser) and gets
//      back the CUSTOMER-FACING url: https://vi-up.com/e/{event-title-slug}
//
// Two URLs exist and they are not interchangeable:
//   - https://vi-up.com/e/{event-title-slug}   ← the only link a customer sees;
//     it is the page that wraps the invitation in the user_event iframe.
//   - https://canvas.vi-up.com/e/{canvas_slug} ← INTERNAL iframe source only.
//     Never copy it, never open it for the user.
//
// Both "Share Link" and "Live Preview" publish, so they both run this exact
// helper. That is the point of it: whichever button the user presses, the same
// blob is published, the same sync happens, and the same vi-up.com URL comes
// back — the two can never disagree about where the invitation lives.

import type { EditorHandle } from "@/src/components/CanvasEditor";

// Who the canvas belongs to. These are the ids PHP keys on — they come from the
// event record, never from the editing user's own session.
export type CanvasIdentity = {
  userId?: number | null;
  eventId?: number | null;
  designId?: number | null;
  packageId?: number | null;
};

export type PublishResult = {
  /** Customer-facing link: https://vi-up.com/e/{event-title-slug}. Copy/open this. */
  publicShareUrl: string;
  /** Internal iframe slug (`event-{eventId}`). Diagnostics only — never shown. */
  canvasSlug: string;
};

/**
 * Publish the current design, register it with iFastNet, and return the
 * customer-facing URL iFastNet hands back.
 *
 * Resolves only when BOTH steps succeeded and a share URL came back. Rejects
 * with a user-presentable message otherwise:
 *   - blob failure  → rejects before any sync call is made
 *   - sync failure  → rejects with the upstream message; the blob stays
 *                     published, so simply calling this again is a safe retry
 *                     (each step overwrites in place).
 * A rejection therefore means the caller has no link to copy or open — which is
 * exactly the intent: never hand out a stale or internal URL as a fallback.
 */
export async function publishAndSyncCanvas(
  editor: EditorHandle,
  eventName: string | undefined,
  ids: CanvasIdentity,
): Promise<PublishResult> {
  // 1. Blob. exportHTML throws on failure, so the sync below is unreachable
  //    unless the invitation JSON really is live.
  const canvasSlug = await editor.exportHTML(eventName);

  // 2. iFastNet. canvas_slug is deliberately NOT sent — the server derives it
  //    from event_id so the browser cannot claim a slug for another event.
  const res = await fetch("/api/canvas-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: ids.userId ?? null,
      event_id: ids.eventId ?? null,
      design_id: ids.designId ?? null,
      package_id: ids.packageId ?? null,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Sync failed (HTTP ${res.status}).`);
  }

  // The route only reports ok:true with a validated vi-up.com URL, so this is
  // belt-and-braces — but the callers must never fall back to a canvas URL.
  const publicShareUrl = data?.public_share_url;
  if (typeof publicShareUrl !== "string" || !publicShareUrl) {
    throw new Error("vi-up.com did not return a share link for this event.");
  }

  return { publicShareUrl, canvasSlug };
}
