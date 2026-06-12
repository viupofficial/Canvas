// Downscale + recompress uploaded images before they enter the Fabric canvas.
//
// Every uploaded image lives as a base64 data URL inside the canvas JSON, which
// is kept in localStorage, snapshotted into undo history, and re-sent to
// update_design.php on every autosave — so raw phone photos must be shrunk at
// the door. A 5MB JPEG typically comes out at ~200-400KB after this.

const MAX_DIMENSION = 1920; // longest edge in px — ample for on-screen invites
const JPEG_QUALITY = 0.82;
const SKIP_BYTES = 250 * 1024; // files this small pass through if not oversized

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

// Sample the alpha channel (every 16th pixel) — full scans are wasted work and
// a PNG without transparency compresses far better as JPEG.
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

/**
 * Returns a data URL for the file, downscaled to MAX_DIMENSION and
 * recompressed. Falls back to the original data URL for vector/animated
 * formats, on any processing error, or when recompression doesn't help.
 */
export async function downscaleImageFile(file: File): Promise<string> {
  const original = await fileToDataUrl(file);

  // Rasterizing these loses information (vectors / animation frames).
  if (file.type === "image/svg+xml" || file.type === "image/gif") return original;

  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    if (scale === 1 && file.size <= SKIP_BYTES) return original;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const keepPng =
      file.type === "image/png" && hasTransparency(ctx, canvas.width, canvas.height);
    const out = keepPng
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", JPEG_QUALITY);

    // Recompression can backfire (e.g. an already-optimized small PNG).
    return out.length < original.length ? out : original;
  } catch (e) {
    console.error("[imageDownscale] failed, using original", e);
    return original;
  }
}
