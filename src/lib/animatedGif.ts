// Is this GIF actually animated?
//
// Fabric paints images with `ctx.drawImage(imgElement, …)`, and a canvas draw
// of an animated GIF is frozen at frame 0 — the browser advances the frames of
// an <img> for compositing only, and neither drawImage nor createImageBitmap
// can see past the first one. So animated GIFs are played by a DOM <img> laid
// over the canvas instead (see gifOverlay.ts).
//
// That overlay costs a DOM node and a transform sync per canvas render, which
// is wasted on a GIF with a single frame — those render identically whether
// Fabric paints them or the overlay does. Hence this probe: walk the file's
// block structure far enough to answer "more than one frame?" and let static
// GIFs stay ordinary Fabric images.
//
// The walk skips over sub-block payloads by their length bytes and never
// decompresses anything, so it costs a few dozen array reads regardless of how
// large the GIF is, and it stops at the second frame it finds.

/** "GIF" — the first three bytes of every GIF, and of nothing else we store. */
function hasGifMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
}

/** Sub-blocks are a chain of [length byte][payload], ended by a zero length. */
function skipSubBlocks(bytes: Uint8Array, start: number): number {
  let p = start;
  while (p < bytes.length) {
    const size = bytes[p];
    if (size === 0) return p + 1;
    p += size + 1;
  }
  return bytes.length;
}

/** Bytes taken by a colour table, given the packed field that describes it. */
function colorTableBytes(packed: number): number {
  return packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
}

/**
 * Number of frames in the GIF, giving up as soon as `stopAt` is reached (the
 * caller only ever needs to distinguish 1 from "more than 1").
 *
 * Returns 0 for anything that isn't a GIF, so a mislabelled file reads as
 * "not animated" rather than throwing.
 */
export function countGifFrames(bytes: Uint8Array, stopAt = 2): number {
  // "GIF" + version. The logical screen descriptor that follows is 7 bytes,
  // and its packed field (offset 10) says whether a global colour table
  // follows the header's 13 bytes.
  if (bytes.length < 14 || !hasGifMagic(bytes)) return 0;

  let p = 13 + colorTableBytes(bytes[10]);
  let frames = 0;

  while (p < bytes.length) {
    const marker = bytes[p];

    if (marker === 0x3b) break; // trailer — end of file

    if (marker === 0x21) {
      // Extension (graphic control, comment, application/NETSCAPE loop, …).
      // Two bytes of introducer + label, then a sub-block chain.
      p = skipSubBlocks(bytes, p + 2);
      continue;
    }

    if (marker === 0x2c) {
      // Image descriptor — one frame. 10 bytes, then an optional local colour
      // table, then the LZW minimum code size and the compressed sub-blocks.
      frames++;
      if (frames >= stopAt) return frames;
      p = skipSubBlocks(bytes, p + 10 + colorTableBytes(bytes[p + 9]) + 1);
      continue;
    }

    return frames; // unexpected marker — truncated or malformed, stop here
  }

  return frames;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Cheap string test — does this src say, by name or mime, that it is a GIF? */
export function looksLikeGif(src: unknown): src is string {
  return (
    typeof src === "string" &&
    (/^data:image\/gif/i.test(src) || /\.gif(?:[?#]|$)/i.test(src))
  );
}

/** The extension at the end of a URL's path, lowercased, or "" if it has none. */
function extensionOf(url: string): string {
  const path = url.split(/[?#]/)[0];
  const dot = path.lastIndexOf(".");
  return dot > path.lastIndexOf("/") ? path.slice(dot + 1).toLowerCase() : "";
}

/**
 * Could this src be a GIF? Broader than looksLikeGif, and the test the overlay
 * actually screens on.
 *
 * Blob uploads used to be stored under an extension-less pathname, so a GIF
 * already sitting in someone's saved design is indistinguishable by name from
 * the WebP next to it — screening on looksLikeGif alone leaves every one of
 * those playing frozen forever. Those URLs go to the byte probe instead, which
 * settles it from the file's own header.
 *
 * Anything that does name a format is taken at its word: a data: URL always
 * declares its mime, and a .webp / .png / .jpg URL is not a GIF.
 */
export function mayBeGif(src: unknown): src is string {
  if (typeof src !== "string") return false;
  if (looksLikeGif(src)) return true;
  return /^https?:\/\//i.test(src) && extensionOf(src) === "";
}

// One probe per distinct src, shared across every canvas on the page: the
// player mounts one canvas per page and the same sticker often appears on
// several of them.
const probes = new Map<string, Promise<boolean>>();

/** Runaway guard — nothing we serve is near this, and MAX_GIF_BYTES is 10MB. */
const PROBE_BYTE_CAP = 12 * 1024 * 1024;

function join(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * The file's bytes, or null once its leading bytes prove it is not a GIF.
 *
 * Read as a stream rather than one arrayBuffer so that second case can drop
 * the connection after the first chunk: every extension-less URL reaches here,
 * most of them ordinary photos, and three bytes is enough to dismiss one — no
 * reason to pull a whole WebP down to learn it isn't animated.
 *
 * Throws if the request itself fails, so the caller's name-based fallback
 * decides rather than a network blip reading as "not a GIF".
 */
async function fetchIfGif(src: string): Promise<Uint8Array | null> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`fetch ${src} → ${res.status}`);
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    return hasGifMagic(all) ? all : null;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let checkedMagic = false;
  try {
    while (total < PROBE_BYTE_CAP) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      chunks.push(value);
      total += value.length;
      if (!checkedMagic && total >= 3) {
        checkedMagic = true;
        if (!hasGifMagic(join(chunks, total))) return null;
      }
    }
  } finally {
    // Nothing downstream cares whether the cancel lands, and an already-closed
    // stream rejects it.
    reader.cancel().catch(() => {});
  }
  return total ? join(chunks, total) : null;
}

/**
 * Whether `src` is a multi-frame GIF. Data URLs are decoded in place; remote
 * ones are fetched, which is a cache hit in practice because the <img> that
 * triggered the question has already downloaded the same bytes.
 *
 * A src we can't read at all (CORS, offline, malformed) falls back to what its
 * name says. Something called .gif is more likely animated than not, and
 * guessing "animated" costs one idle DOM node while guessing "static" would
 * silently refuse to play it. An extension-less URL, on the other hand, gives
 * no reason to think it is a GIF — assuming one there would hand an ordinary
 * image to the overlay and quietly lift it above the rest of the design.
 */
export function isAnimatedGif(src: string): Promise<boolean> {
  const cached = probes.get(src);
  if (cached) return cached;

  const probe = (async () => {
    const unreadable = looksLikeGif(src);
    try {
      const comma = src.indexOf(",");
      if (src.startsWith("data:") && comma !== -1) {
        // Only base64 payloads are worth decoding — a URL-encoded GIF isn't a
        // thing any encoder produces.
        if (!/;base64/i.test(src.slice(0, comma))) return unreadable;
        return countGifFrames(base64ToBytes(src.slice(comma + 1))) > 1;
      }
      const bytes = await fetchIfGif(src);
      return bytes !== null && countGifFrames(bytes) > 1;
    } catch {
      return unreadable;
    }
  })();

  probes.set(src, probe);
  return probe;
}
