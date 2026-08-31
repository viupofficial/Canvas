// How much image data is allowed to live *inside* the design JSON, and how to
// get the rest out of it.
//
// The whole design — every page, with every image as a base64 data URL — is
// POSTed to update_design.php as one JSON body on every autosave. That endpoint
// is PHP on shared hosting: a body over its post_max_size is dropped before any
// application code runs, and the resulting error page carries no CORS headers,
// so the browser never sees a status — it surfaces the save as a bare
// `TypeError: Failed to fetch`. The editor then reports "Failed to fetch. Your
// changes are saved locally — retrying…" forever, and nothing the user does
// (except deleting the image) ever lands.
//
// A single page background is the usual trigger: base64 inflates the bytes by
// a third, and "Apply to all pages" stores a full copy of the picture on EVERY
// page, so one ~800KB background becomes several MB of JSON across a 9-page
// invitation.
//
// So: small images stay inline (no network round trip, no blob clutter),
// anything larger goes to Blob storage and is referenced by URL — the same
// treatment animated GIFs already get in imageDownscale.ts. Fabric loads a URL
// exactly as happily as a data URL (see imageLoadOpts in CanvasEditor), and
// Blob serves CORS-open so the thumbnail export doesn't taint the canvas.

import { uploadEditedImage } from "./uploadEditedImage";

/** Largest single image kept inline in the design JSON. */
export const MAX_INLINE_IMAGE_BYTES = 96 * 1024;

/**
 * Ceiling on the *combined* inline image data in one design. Plenty of small
 * images still add up — 30 icons under the per-image limit would be 3MB — so
 * the compaction pass below hoists the biggest remaining ones until the total
 * fits, even though each was individually allowed.
 */
export const MAX_TOTAL_INLINE_BYTES = 1024 * 1024;

/** Decoded byte count of a data URL (base64 is 4 characters per 3 bytes). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl.length;
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
}

export function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/");
}

// Uploads are memoized for the session: the same background sits on all nine
// pages, and a design that failed to save re-runs compaction on every retry.
// Without this each attempt would upload the same bytes again.
const uploaded = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

/**
 * Upload a data URL to Blob storage and return its public URL, reusing an
 * earlier upload of the same bytes. Never throws: on failure it hands back the
 * data URL unchanged, which is no worse than not having tried.
 */
export function hoistDataUrl(dataUrl: string): Promise<string> {
  const done = uploaded.get(dataUrl);
  if (done) return Promise.resolve(done);
  const running = inFlight.get(dataUrl);
  if (running) return running;

  const p = uploadEditedImage(dataUrl)
    .then((url) => {
      uploaded.set(dataUrl, url);
      return url;
    })
    .catch((e) => {
      console.error("[inlineImageBudget] blob upload failed, keeping inline", e);
      return dataUrl;
    })
    .finally(() => {
      inFlight.delete(dataUrl);
    });

  inFlight.set(dataUrl, p);
  return p;
}

/** Hoist a freshly encoded image only if it is too big to stay in the JSON. */
export function hoistIfOversized(dataUrl: string): Promise<string> {
  if (!isImageDataUrl(dataUrl) || dataUrlBytes(dataUrl) <= MAX_INLINE_IMAGE_BYTES) {
    return Promise.resolve(dataUrl);
  }
  return hoistDataUrl(dataUrl);
}
