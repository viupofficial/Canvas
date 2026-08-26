// Downscale + recompress uploaded images before they enter the Fabric canvas.
//
// Every uploaded image lives as a base64 data URL inside the canvas JSON, which
// is kept in localStorage, snapshotted into undo history, and re-sent to
// update_design.php on every autosave — so raw phone photos must be shrunk at
// the door. A 5MB JPEG typically comes out at ~150-300KB after this.
//
// Uploads are standardised to WebP: one format for everything we store, and
// 25-35% smaller than the equivalent JPEG (far more against a transparent PNG,
// which WebP replaces losslessly enough while staying a fraction of the size).
// This only governs what we *write*. Nothing here touches reading: PNG / JPEG /
// GIF / SVG data URLs saved by existing clients keep loading exactly as before,
// because the canvas just hands whatever string it has to an <img>.
//
// Animated GIFs are the one format that can't go through the canvas at all —
// rasterizing keeps a single frame — so they are uploaded to Blob storage
// as-is and referenced by URL. That also keeps them out of the design JSON,
// which matters more for GIFs than anything else here: they arrive at their
// full recorded size (no downscale pass applies), and a few MB of base64 in
// the page JSON would be carried by localStorage, every undo snapshot and
// every autosave.

import { uploadImageFile } from "./uploadEditedImage";

const MAX_DIMENSION = 1920; // longest edge in px — ample for on-screen invites
// Matches the ceiling /api/upload-image issues tokens for, so an oversized GIF
// is refused here with a readable reason instead of failing at the token step.
const MAX_GIF_BYTES = 10 * 1024 * 1024;
const WEBP_QUALITY = 0.82; // photographic content
// Graphics with alpha (stickers, logos) were PNG — i.e. lossless — before, and
// lossy WebP fringes their hard edges. A higher quality keeps them clean and is
// still far below the PNG it replaces.
const WEBP_ALPHA_QUALITY = 0.92;
const JPEG_QUALITY = 0.82; // only used when the browser can't encode WebP
const SKIP_BYTES = 250 * 1024; // files this small pass through if not oversized

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Whether this browser can *encode* WebP from a canvas. Decoding is universal
 * these days; encoding is not (Safari only gained it in 16.4). A browser that
 * can't silently hands back a PNG data URL instead of erroring, so the only
 * reliable probe is to encode one pixel and read the mime back.
 */
let webpEncodable: boolean | null = null;
export function canEncodeWebp(): boolean {
  if (webpEncodable !== null) return webpEncodable;
  try {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    webpEncodable = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpEncodable = false;
  }
  return webpEncodable;
}

/** Format to write new images in — "webp" wherever the browser can produce it. */
export function preferredImageFormat(): "webp" | "png" {
  return canEncodeWebp() ? "webp" : "png";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

// Sample the alpha channel (every 16th pixel) — full scans are wasted work, and
// the answer only picks a quality level (or, on the no-WebP fallback, decides
// whether a PNG has to stay a PNG).
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 64) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    return true; // can't read pixels — assume alpha to stay lossless
  }
}

// JPEG has no alpha channel, so scanning a decoded one is guaranteed-negative
// work over a couple of million pixels. Every other raster format might.
function mayCarryAlpha(type: string): boolean {
  return type !== "image/jpeg" && type !== "image/jpg";
}

/**
 * Returns a WebP data URL for the file, downscaled to MAX_DIMENSION.
 *
 * Animated formats are the exception to the "returns a data URL" shape: a GIF
 * is uploaded untouched and comes back as a Blob URL (see the note up top).
 * Every other path still returns a data URL — falling back to the original for
 * vectors and on any processing error, and to the previous JPEG/PNG behaviour
 * on browsers that cannot encode WebP.
 *
 * Throws only for a GIF over MAX_GIF_BYTES, with a message fit to show the
 * user; callers surface it as an upload failure.
 */
export async function downscaleImageFile(file: File): Promise<string> {
  const original = await fileToDataUrl(file);

  // Rasterizing a vector loses the vector, and there is nothing to upload it
  // for — an SVG is small enough to live in the JSON.
  if (file.type === "image/svg+xml") return original;

  // Rasterizing a GIF would flatten it to one frame, so the file goes up whole.
  // A failed upload falls back to the data URL rather than losing the user's
  // image: heavier than we'd like in the JSON, but it still works.
  if (file.type === "image/gif") {
    if (file.size > MAX_GIF_BYTES) {
      throw new Error(
        `That GIF is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit is ${MAX_GIF_BYTES / (1024 * 1024)}MB. Try a shorter or smaller one.`,
      );
    }
    try {
      return await uploadImageFile(file);
    } catch (e) {
      console.error("[imageDownscale] GIF upload failed, inlining instead", e);
      return original;
    }
  }

  const webp = canEncodeWebp();

  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const withinBudget = scale === 1 && file.size <= SKIP_BYTES;

    // Already in the target format and already small: re-encoding would only
    // cost a generation of quality. Without a WebP encoder there is no format
    // to convert to either, so the original pass-through rule still applies.
    if (withinBudget && (webp ? file.type === "image/webp" : true)) return original;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const alpha =
      mayCarryAlpha(file.type) && hasTransparency(ctx, canvas.width, canvas.height);

    if (webp) {
      // No size comparison against the original here, unlike the fallback path:
      // a uniform format is the point, and WebP only loses that race on inputs
      // small enough for the difference not to matter.
      return canvas.toDataURL("image/webp", alpha ? WEBP_ALPHA_QUALITY : WEBP_QUALITY);
    }

    const out =
      file.type === "image/png" && alpha
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", JPEG_QUALITY);

    // Recompression can backfire (e.g. an already-optimized small PNG).
    return out.length < original.length ? out : original;
  } catch (e) {
    console.error("[imageDownscale] failed, using original", e);
    return original;
  }
}
