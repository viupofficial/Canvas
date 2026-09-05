// ─────────────────────────────────────────────────────────────────────────────
// Surviving an image that will not load.
//
// Fabric enlivens a page with Promise.all over its objects, and loadImage()
// REJECTS when an <img> errors — so ONE unreachable picture rejects the whole
// batch and canvas.loadFromJSON() resolves nothing at all. The page then paints
// completely empty: not "a design with a hole in it", but a blank artboard in
// the editor and a blank invitation for the guest.
//
// That was survivable while every asset was a same-origin file in /public (the
// one time it bit us was a filename case mismatch — see the PAPER.png note in
// templates.ts). With template media now served by iFastNet it is a question of
// when, not if: a slow shared host, one deleted file, a flaky guest connection.
//
// So: try the page as-is — the fast path, with no extra work and no added
// latency — and only if that fails, find out which images are actually broken,
// swap those for a transparent placeholder, and load again. A missing
// decorative flourish costs you the flourish, not the invitation.
//
// The original url is kept on the object as `_remoteSrc` so a placeholder can
// never be SAVED over a real asset: serializeCanvas() in CanvasEditor puts the
// url back before the design is persisted or published. A template's image is
// therefore never lost to a temporary outage.
// ─────────────────────────────────────────────────────────────────────────────

import { REMOTE_IMAGE_TIMEOUT_MS, isRemoteAssetUrl } from "@/src/config/remoteTemplates";

/** 1×1 fully transparent GIF. Stands in for an image that would not load. */
export const MISSING_ASSET_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Where the real url is parked while a placeholder is on screen. */
export const ORIGINAL_SRC_PROP = "_remoteSrc";

type Json = Record<string, unknown>;

const asRecord = (node: unknown): Json | null =>
  node && typeof node === "object" && !Array.isArray(node) ? (node as Json) : null;

/** Every `src` in a page's JSON, with the crossOrigin Fabric would use for it. */
export type ImageRef = { src: string; crossOrigin: string | null };

/**
 * Walk any page/object JSON and collect the image sources it would load.
 * Deliberately structural rather than type-driven: backgroundImage, patterns,
 * clipPaths and grouped objects all carry `src` the same way.
 */
export function collectImageRefs(node: unknown, out: Map<string, ImageRef> = new Map()): Map<string, ImageRef> {
  if (Array.isArray(node)) {
    for (const child of node) collectImageRefs(child, out);
    return out;
  }
  const obj = asRecord(node);
  if (!obj) return out;

  const src = obj.src;
  if (typeof src === "string" && src && !src.startsWith("data:") && !out.has(src)) {
    const co = obj.crossOrigin;
    out.set(src, { src, crossOrigin: typeof co === "string" && co ? co : null });
  }
  for (const key of Object.keys(obj)) collectImageRefs(obj[key], out);
  return out;
}

/**
 * Load one url exactly the way Fabric will — same crossOrigin, so a CORS
 * failure is detected here rather than surfacing as a mystery blank page.
 * Resolves true when it loads, false on error or timeout. Never throws.
 */
export function probeImage(ref: ImageRef, timeoutMs = REMOTE_IMAGE_TIMEOUT_MS): Promise<boolean> {
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      img.onload = img.onerror = null;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      // Stop the request so a hung host doesn't hold a connection open.
      img.src = "";
      done(false);
    }, timeoutMs);
    img.onload = () => done(true);
    img.onerror = () => done(false);
    if (ref.crossOrigin) img.crossOrigin = ref.crossOrigin;
    img.src = ref.src;
  });
}

/** The subset of `refs` that will not load. Probed in parallel. */
export async function findUnloadableImages(
  refs: Iterable<ImageRef>,
  timeoutMs = REMOTE_IMAGE_TIMEOUT_MS,
): Promise<Set<string>> {
  const list = [...refs];
  const failed = new Set<string>();
  await Promise.all(
    list.map(async (ref) => {
      if (!(await probeImage(ref, timeoutMs))) failed.add(ref.src);
    }),
  );
  return failed;
}

/**
 * A copy of `node` with every failed source replaced by the transparent
 * placeholder, the real url parked on `_remoteSrc`, and crossOrigin cleared
 * (a data: URL must not carry one). The input is never mutated — the caller's
 * `pages[]` keeps the real urls.
 */
export function withPlaceholders<T>(node: T, failed: Set<string>): T {
  if (failed.size === 0) return node;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    const obj = asRecord(value);
    if (!obj) return value;
    const out: Json = {};
    for (const key of Object.keys(obj)) out[key] = walk(obj[key]);
    if (typeof obj.src === "string" && failed.has(obj.src)) {
      out[ORIGINAL_SRC_PROP] = obj.src;
      out.src = MISSING_ASSET_PIXEL;
      out.crossOrigin = null;
    }
    return out;
  };
  return walk(node) as T;
}

/**
 * Undo withPlaceholders(): put every parked url back and drop the marker.
 * Called on the way OUT (save, publish, export) so a placeholder shown during
 * an outage can never overwrite the real asset in the stored design.
 */
export function restoreOriginalSources<T>(node: T): T {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    const obj = asRecord(value);
    if (!obj) return value;
    const out: Json = {};
    for (const key of Object.keys(obj)) {
      if (key === ORIGINAL_SRC_PROP) continue;
      out[key] = walk(obj[key]);
    }
    const parked = obj[ORIGINAL_SRC_PROP];
    if (typeof parked === "string" && parked) {
      out.src = parked;
      if (isRemoteAssetUrl(parked)) out.crossOrigin = "anonymous";
    }
    return out;
  };
  return walk(node) as T;
}

/** True when this JSON has at least one parked url to restore. */
export function hasPlaceholders(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasPlaceholders);
  const obj = asRecord(node);
  if (!obj) return false;
  if (typeof obj[ORIGINAL_SRC_PROP] === "string") return true;
  return Object.keys(obj).some((key) => hasPlaceholders(obj[key]));
}

/** Development-time breadcrumb. Guests never see this — it goes to the console. */
export function logUnloadable(failed: Iterable<string>, where: string): void {
  for (const url of failed) {
    console.warn(`[TemplateAsset] Unable to load: ${url}${where ? `  (${where})` : ""}`);
  }
}

export type ResilientLoadResult = {
  /** Did the page end up on the canvas? */
  ok: boolean;
  /** Sources that had to be replaced by a placeholder. */
  missing: string[];
  /** Set when the page could not be loaded even after the recovery pass. */
  error?: unknown;
};

/**
 * canvas.loadFromJSON(), but a broken image costs you that image instead of the
 * whole page.
 *
 * Fast path (every asset fine): one loadFromJSON, no probing, no extra
 * requests, behaviour byte-identical to calling Fabric directly. The recovery
 * pass only runs after a failure — which is also the only time we pay for it.
 */
export async function loadPageResilient(
  canvas: { loadFromJSON: (json: unknown) => Promise<unknown> | unknown },
  json: unknown,
  where = "",
): Promise<ResilientLoadResult> {
  try {
    await canvas.loadFromJSON(json);
    return { ok: true, missing: [] };
  } catch (firstError) {
    const refs = collectImageRefs(json);
    if (refs.size === 0) return { ok: false, missing: [], error: firstError };

    const failed = await findUnloadableImages(refs.values());
    if (failed.size === 0) {
      // Every image loads on its own, so the failure was something else —
      // report it rather than pretending we fixed it.
      return { ok: false, missing: [], error: firstError };
    }
    logUnloadable(failed, where);

    try {
      await canvas.loadFromJSON(withPlaceholders(json, failed));
      return { ok: true, missing: [...failed] };
    } catch (secondError) {
      return { ok: false, missing: [...failed], error: secondError };
    }
  }
}
