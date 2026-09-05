// ─────────────────────────────────────────────────────────────────────────────
// iFastNet TEMPLATE ASSET MANIFEST client.
//
//   const manifest = await getRemoteTemplateManifest("11");
//
// One small JSON document per template, describing what media that template
// ships with and where each file lives. It is ASSET DISCOVERY only — it never
// decides what a design looks like (that is src/config/templates.ts) and it is
// never needed to RENDER a saved project, because a project stores the resolved
// URLs on its own objects. See the "what this is not" note at the bottom.
//
// ── SECURITY ────────────────────────────────────────────────────────────────
// The manifest is DATA and is treated as hostile input:
//   • nothing here is ever eval'd, Function()'d, or written to innerHTML;
//   • the template HTML the manifest points at is NEVER fetched or parsed by
//     the app — we consume the JSON precisely so we never have to run or
//     sanitize a third party's <script>;
//   • every URL is re-checked against REMOTE_ASSET_ORIGIN, so a compromised or
//     mis-generated manifest cannot point the canvas (or a published
//     invitation) at another host;
//   • unknown fields are dropped rather than spread onto our objects.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MANIFEST_TIMEOUT_MS,
  isRemoteAssetUrl,
  normalizeAssetKey,
  remoteTemplateBaseUrl,
  templateManifestUrl,
} from "@/src/config/remoteTemplates";

export type TemplateAssetKind = "image" | "audio" | "video" | "other";

export type TemplateManifestAsset = {
  /** Coarse media kind, as reported by the API (normalized). */
  type: TemplateAssetKind;
  /** Absolute, ready-to-use URL on the remote host. */
  url: string;
  /** The reference exactly as it appears in the template ("ImageGallery/img1.png"). */
  source: string;
  /** Lookup key: lower-cased, forward slashes, no leading "./". */
  key: string;
  extension: string;
  bytes: number | null;
  /** "template" for the template's own folder, "site" for a shared upload. */
  scope: string | null;
};

export type RemoteTemplateManifest = {
  /** The remote (numeric) template id, as a string. */
  id: string;
  name: string;
  /** "https://vi-up.com/uploads/templates/11/" */
  baseAssetUrl: string;
  /** The source HTML. Recorded for reference — the app never fetches it. */
  htmlUrl: string | null;
  thumbnailUrl: string | null;
  assets: TemplateManifestAsset[];
  /** Assets indexed by `key`, for resolving a bare filename to its exact URL. */
  byKey: Map<string, TemplateManifestAsset>;
  /** Files the API expected but could not find on disk. */
  missing: string[];
  fetchedAt: number;
};

export class TemplateManifestError extends Error {
  readonly templateId: string;
  readonly reason?: unknown;
  constructor(templateId: string, message: string, reason?: unknown) {
    super(message);
    this.name = "TemplateManifestError";
    this.templateId = templateId;
    this.reason = reason;
  }
}

// ── Normalization ───────────────────────────────────────────────────────────

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const KINDS: TemplateAssetKind[] = ["image", "audio", "video"];

const kindOf = (value: unknown): TemplateAssetKind =>
  KINDS.includes(value as TemplateAssetKind) ? (value as TemplateAssetKind) : "other";

/**
 * Accept an asset only if it is a plain object with a usable URL ON OUR HOST.
 * Anything else is dropped with a dev warning rather than trusted.
 */
function normalizeAsset(raw: unknown, templateId: string): TemplateManifestAsset | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;

  const url = str(entry.url);
  if (!url) return null;
  if (!isRemoteAssetUrl(url)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[TemplateAsset] manifest ${templateId}: ignoring off-host asset url ${url}`);
    }
    return null;
  }

  const source = str(entry.source) ?? str(entry.path) ?? url;
  const bytes = typeof entry.bytes === "number" && isFinite(entry.bytes) ? entry.bytes : null;

  return {
    type: kindOf(entry.type),
    url,
    source,
    key: normalizeAssetKey(source),
    extension: (str(entry.extension) ?? "").toLowerCase(),
    bytes,
    scope: str(entry.scope),
  };
}

function normalizeManifest(payload: unknown, templateId: string): RemoteTemplateManifest {
  const root = (payload ?? {}) as Record<string, unknown>;
  if (root.success === false) {
    throw new TemplateManifestError(
      templateId,
      str(root.error) ?? str(root.message) ?? "The template manifest could not be read.",
    );
  }

  const tpl = (root.template ?? root) as Record<string, unknown>;
  const rawAssets = Array.isArray(tpl.assets) ? tpl.assets : [];
  const assets = rawAssets
    .map((entry) => normalizeAsset(entry, templateId))
    .filter((entry): entry is TemplateManifestAsset => !!entry);

  const byKey = new Map<string, TemplateManifestAsset>();
  for (const asset of assets) {
    // First writer wins: the manifest lists a file once, and a duplicate key
    // means two spellings of the same path — either resolves to the same file.
    if (!byKey.has(asset.key)) byKey.set(asset.key, asset);
    // Also index by bare filename, so a template can say "img1.png" instead of
    // spelling out "ImageGallery/img1.png" — as long as it is unambiguous.
    const base = asset.key.split("/").pop();
    if (base && base !== asset.key && !byKey.has(base)) byKey.set(base, asset);
  }

  const baseAssetUrl = str(tpl.baseAssetUrl);
  const htmlUrl = str(tpl.htmlUrl);
  const thumbnailUrl = str(tpl.thumbnailUrl);

  return {
    id: str(tpl.id) ?? templateId,
    name: str(tpl.name) ?? templateId,
    // Only trust a base that is on our own host; otherwise derive it.
    baseAssetUrl:
      baseAssetUrl && isRemoteAssetUrl(baseAssetUrl)
        ? baseAssetUrl.endsWith("/")
          ? baseAssetUrl
          : `${baseAssetUrl}/`
        : remoteTemplateBaseUrl(templateId),
    htmlUrl: htmlUrl && isRemoteAssetUrl(htmlUrl) ? htmlUrl : null,
    thumbnailUrl: thumbnailUrl && isRemoteAssetUrl(thumbnailUrl) ? thumbnailUrl : null,
    assets,
    byKey,
    missing: (Array.isArray(tpl.missing) ? tpl.missing : [])
      .map((m) => str(m))
      .filter((m): m is string => !!m),
    fetchedAt: Date.now(),
  };
}

// ── Cache ───────────────────────────────────────────────────────────────────
// One entry per template for the life of the tab. The manifest is small and
// immutable for the duration of an editing session, and it is only ever fetched
// because the user picked that template — so nothing is preloaded and nothing
// is fetched twice. Failures are NOT cached: the next attempt retries.

const cache = new Map<string, RemoteTemplateManifest>();
const inFlight = new Map<string, Promise<RemoteTemplateManifest>>();

/** The manifest for a template if it is already in this session's cache. */
export function getCachedTemplateManifest(
  remoteTemplateId: string | number | null | undefined,
): RemoteTemplateManifest | null {
  if (remoteTemplateId == null) return null;
  return cache.get(String(remoteTemplateId)) ?? null;
}

export function clearTemplateManifestCache(remoteTemplateId?: string | number): void {
  if (remoteTemplateId == null) {
    cache.clear();
    inFlight.clear();
    return;
  }
  const key = String(remoteTemplateId);
  cache.delete(key);
  inFlight.delete(key);
}

/**
 * Fetch (or reuse) the asset manifest for one remote template.
 *
 * Straight from the browser to iFastNet — the PHP endpoint sends CORS headers
 * for the canvas origins, so there is no Vercel hop and no proxy.
 *
 * Rejects with a TemplateManifestError on a network failure, a timeout, a
 * non-200, unreadable JSON, or `success: false`. Callers decide what to show;
 * nothing here writes to the UI.
 */
export function getRemoteTemplateManifest(
  remoteTemplateId: string | number,
  options: { force?: boolean; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RemoteTemplateManifest> {
  const id = String(remoteTemplateId);

  if (!options.force) {
    const cached = cache.get(id);
    if (cached) return Promise.resolve(cached);
    const running = inFlight.get(id);
    if (running) return running;
  }

  const url = templateManifestUrl(id);
  const timeoutMs = options.timeoutMs ?? MANIFEST_TIMEOUT_MS;

  const request = (async (): Promise<RemoteTemplateManifest> => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const onOuterAbort = () => controller?.abort();
    options.signal?.addEventListener("abort", onOuterAbort, { once: true });

    try {
      const res = await fetch(url, {
        method: "GET",
        // Plain CORS: no credentials, no custom headers, so the request stays
        // preflight-free and cannot carry the user's vi-up.com session.
        credentials: "omit",
        signal: controller?.signal,
      });
      if (!res.ok) {
        throw new TemplateManifestError(id, `The template library answered with HTTP ${res.status}.`);
      }
      let payload: unknown;
      try {
        payload = await res.json();
      } catch (e) {
        throw new TemplateManifestError(id, "The template library sent an unreadable reply.", e);
      }
      const manifest = normalizeManifest(payload, id);
      cache.set(id, manifest);
      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[TemplateAsset] manifest ${id} "${manifest.name}": ${manifest.assets.length} assets from ${manifest.baseAssetUrl}`,
        );
        if (manifest.missing.length) {
          console.warn(`[TemplateAsset] manifest ${id} reports missing files:`, manifest.missing);
        }
      }
      return manifest;
    } catch (e) {
      if (e instanceof TemplateManifestError) throw e;
      const aborted = (e as { name?: string })?.name === "AbortError";
      throw new TemplateManifestError(
        id,
        aborted
          ? "The template library took too long to answer."
          : "The template library could not be reached.",
        e,
      );
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onOuterAbort);
      inFlight.delete(id);
    }
  })();

  inFlight.set(id, request);
  return request;
}

/**
 * Resolve one asset reference against a manifest — "img1.png",
 * "ImageGallery/img1.png" and an entry written with Windows backslashes all
 * find their entry. Returns null when the manifest does not list it, which lets
 * the caller fall back to the deterministic base-url join.
 */
export function findManifestAsset(
  manifest: RemoteTemplateManifest | null | undefined,
  asset: string,
): TemplateManifestAsset | null {
  if (!manifest || !asset) return null;
  const key = normalizeAssetKey(asset);
  return manifest.byKey.get(key) ?? manifest.byKey.get(key.split("/").pop() ?? key) ?? null;
}

// ── What this is NOT ────────────────────────────────────────────────────────
// The manifest is read when a template is CHOSEN, to discover and verify its
// media. It is never read to open an existing project: a saved design already
// holds the resolved https://vi-up.com/... URLs on its own objects, and those
// load with no manifest, no API call and no dependency on this file at all.
// That is deliberate — an invitation must keep rendering if the manifest
// endpoint is down, and a user's edits must never be overwritten by re-reading
// the template they started from.
