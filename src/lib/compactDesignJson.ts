// Last line of defence before a design is POSTed to update_design.php: pull any
// oversized base64 image out of the JSON and leave a Blob URL in its place.
//
// New uploads no longer arrive as big data URLs — imageDownscale hoists those at
// the door — but two cases still need this pass:
//   1. designs saved by earlier builds, which already have MB of base64 in the
//      database and would otherwise stay permanently unsaveable;
//   2. any path that puts an image into the canvas without going through
//      downscaleImageFile (a template, a pasted data URL).
//
// Only the outgoing payload is rewritten; the live canvas keeps its data URLs
// for this session. That is deliberate — swapping sources underneath an active
// canvas would clear the selection and break undo — and it costs nothing,
// because the uploads are memoized (see inlineImageBudget) and the design comes
// back already compacted the next time it is opened.

import {
  MAX_INLINE_IMAGE_BYTES,
  MAX_TOTAL_INLINE_BYTES,
  dataUrlBytes,
  hoistDataUrl,
  isImageDataUrl,
} from "./inlineImageBudget";

/** How many uploads to run at once during a migration save. */
const UPLOAD_CONCURRENCY = 4;

type JsonNode = unknown;

function asRecord(node: JsonNode): Record<string, JsonNode> | null {
  return node && typeof node === "object" && !Array.isArray(node)
    ? (node as Record<string, JsonNode>)
    : null;
}

function collectDataUrls(node: JsonNode, sizes: Map<string, number>): void {
  if (isImageDataUrl(node)) {
    if (!sizes.has(node)) sizes.set(node, dataUrlBytes(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectDataUrls(v, sizes);
    return;
  }
  const obj = asRecord(node);
  if (obj) for (const k of Object.keys(obj)) collectDataUrls(obj[k], sizes);
}

function substitute<T>(node: T, replacements: Map<string, string>): T {
  if (typeof node === "string") return (replacements.get(node) ?? node) as T;
  if (Array.isArray(node)) return node.map((v) => substitute(v, replacements)) as T;
  const obj = asRecord(node);
  if (obj) {
    const out: Record<string, JsonNode> = {};
    for (const k of Object.keys(obj)) out[k] = substitute(obj[k], replacements);
    return out as T;
  }
  return node;
}

/**
 * Decide which of the design's inline images have to go. Everything over the
 * per-image limit, plus — largest first — as many of the rest as it takes to
 * bring the combined inline total under budget.
 */
function selectForHoisting(sizes: Map<string, number>): string[] {
  const bySizeDesc = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
  const chosen: string[] = [];
  let inlineTotal = 0;

  for (const [url, bytes] of bySizeDesc) {
    if (bytes > MAX_INLINE_IMAGE_BYTES) chosen.push(url);
    else inlineTotal += bytes;
  }

  // Still too much in aggregate — keep hoisting the biggest survivors.
  for (const [url, bytes] of bySizeDesc) {
    if (inlineTotal <= MAX_TOTAL_INLINE_BYTES) break;
    if (bytes > MAX_INLINE_IMAGE_BYTES) continue; // already chosen
    chosen.push(url);
    inlineTotal -= bytes;
  }

  return chosen;
}

async function uploadAll(dataUrls: string[]): Promise<Map<string, string>> {
  const replacements = new Map<string, string>();
  let next = 0;

  const worker = async () => {
    while (next < dataUrls.length) {
      const dataUrl = dataUrls[next++];
      const url = await hoistDataUrl(dataUrl);
      // hoistDataUrl resolves to the original when the upload failed — recording
      // that as a "replacement" would be a no-op, so skip it.
      if (url !== dataUrl) replacements.set(dataUrl, url);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, dataUrls.length) }, worker),
  );
  return replacements;
}

/**
 * Return `json` with oversized inline images replaced by Blob URLs.
 *
 * Never rejects: an image that cannot be uploaded is left inline, which puts the
 * save exactly where it would have been without this pass. Returns the original
 * object untouched when nothing needs hoisting — the overwhelming common case,
 * so a normal autosave does no extra work beyond one walk of the JSON.
 */
export async function compactDesignJson<T>(json: T): Promise<T> {
  try {
    const sizes = new Map<string, number>();
    collectDataUrls(json, sizes);
    if (sizes.size === 0) return json;

    const toHoist = selectForHoisting(sizes);
    if (toHoist.length === 0) return json;

    const replacements = await uploadAll(toHoist);
    if (replacements.size === 0) return json;

    return substitute(json, replacements);
  } catch (e) {
    console.error("[compactDesignJson] failed, saving as-is", e);
    return json;
  }
}
