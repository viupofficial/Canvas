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
  if (bytes.length < 14) return 0;
  if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return 0;

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

/** Cheap string test — is this src worth probing at all? */
export function looksLikeGif(src: unknown): src is string {
  return (
    typeof src === "string" &&
    (/^data:image\/gif/i.test(src) || /\.gif(?:[?#]|$)/i.test(src))
  );
}

// One probe per distinct src, shared across every canvas on the page: the
// player mounts one canvas per page and the same sticker often appears on
// several of them.
const probes = new Map<string, Promise<boolean>>();

/**
 * Whether `src` is a multi-frame GIF. Data URLs are decoded in place; remote
 * ones are fetched, which is a cache hit in practice because the <img> that
 * triggered the question has already downloaded the same bytes.
 *
 * Unreadable (CORS, offline, malformed) resolves to `true`: a GIF we can't
 * inspect is more likely animated than not, and guessing "animated" costs one
 * idle DOM node while guessing "static" would silently refuse to play it.
 */
export function isAnimatedGif(src: string): Promise<boolean> {
  const cached = probes.get(src);
  if (cached) return cached;

  const probe = (async () => {
    try {
      const comma = src.indexOf(",");
      if (src.startsWith("data:") && comma !== -1) {
        // Only base64 payloads are worth decoding — a URL-encoded GIF isn't a
        // thing any encoder produces.
        if (!/;base64/i.test(src.slice(0, comma))) return true;
        return countGifFrames(base64ToBytes(src.slice(comma + 1))) > 1;
      }
      const res = await fetch(src);
      if (!res.ok) return true;
      return countGifFrames(new Uint8Array(await res.arrayBuffer())) > 1;
    } catch {
      return true;
    }
  })();

  probes.set(src, probe);
  return probe;
}
