// ─────────────────────────────────────────────────────────────────────────────
// WHERE THE REMOTE TEMPLATE HOST LIVES — the single place its URLs are spelled.
//
// Template media is hosted by iFastNet (vi-up.com), NOT by Vercel. Vercel holds
// the code and the template DESIGN data; iFastNet holds the files. Nothing is
// copied between them: the browser fetches one small JSON manifest from the PHP
// API and then loads every picture straight from vi-up.com.
//
//     browser ──▶ vercel (app + design data)
//     browser ──▶ vi-up.com/api/template-assets.php   (small JSON manifest)
//     browser ──▶ vi-up.com/uploads/templates/…       (the actual media)
//
// There is deliberately NO Vercel proxy in the asset path — a serverless
// function in front of every image would double the latency, burn function
// time on bytes iFastNet already serves with a 30-day cache header, and put a
// 4.5MB body limit in front of files that have no business going through it.
//
// Everything below is overridable by env so staging/self-host can be pointed
// elsewhere without touching a line of application code. NEXT_PUBLIC_* is
// required: these values are read in the browser.
//
// CORS (verified against the live host):
//   /api/template-assets.php → Access-Control-Allow-Origin: <the calling origin>
//                              for the allowlisted canvas + localhost origins
//   /uploads/templates/…     → Access-Control-Allow-Origin: *
// The second is what lets Fabric load these images with crossOrigin="anonymous"
// and keeps the canvas exportable (toDataURL / toBlob / PDF / thumbnails).
// A NEW deployment origin must be added to the PHP allowlist or the manifest
// fetch — not the images — will fail CORS.
// ─────────────────────────────────────────────────────────────────────────────

/** Which host a template's media comes from. Templates default to "local". */
export type TemplateAssetProvider = "local" | "ifastnet";

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");
const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

/** Origin serving both the manifest API and the template media. */
export const REMOTE_ASSET_ORIGIN = trimTrailingSlash(
  process.env.NEXT_PUBLIC_VIUP_ASSET_ORIGIN || "https://vi-up.com",
);

/** The template asset manifest endpoint. */
export const TEMPLATE_MANIFEST_ENDPOINT =
  process.env.NEXT_PUBLIC_TEMPLATE_MANIFEST_ENDPOINT ||
  `${REMOTE_ASSET_ORIGIN}/api/template-assets.php`;

/** Query parameter the endpoint keys on. */
export const TEMPLATE_MANIFEST_PARAM = "template_id";

/** Directory under the origin where a template's files live. */
export const REMOTE_TEMPLATE_PATH = trimSlashes(
  process.env.NEXT_PUBLIC_VIUP_TEMPLATE_PATH || "uploads/templates",
);

/** Give up on a manifest request after this long — iFastNet is shared hosting. */
export const MANIFEST_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_TEMPLATE_MANIFEST_TIMEOUT_MS || 12000,
);

/** How long a single remote image gets before it is treated as unavailable. */
export const REMOTE_IMAGE_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_TEMPLATE_IMAGE_TIMEOUT_MS || 15000,
);

/** `https://vi-up.com/api/template-assets.php?template_id=11` */
export function templateManifestUrl(remoteTemplateId: string | number): string {
  const url = new URL(TEMPLATE_MANIFEST_ENDPOINT);
  url.searchParams.set(TEMPLATE_MANIFEST_PARAM, String(remoteTemplateId));
  return url.toString();
}

/** `https://vi-up.com/uploads/templates/11/` — always with the trailing slash. */
export function remoteTemplateBaseUrl(remoteTemplateId: string | number): string {
  return `${REMOTE_ASSET_ORIGIN}/${REMOTE_TEMPLATE_PATH}/${encodeURIComponent(String(remoteTemplateId))}/`;
}

/**
 * Percent-encode one path segment, leaving an already-encoded "%XX" alone so a
 * path copied straight out of the manifest is not double-encoded.
 */
function encodeSegment(segment: string): string {
  if (/%[0-9a-f]{2}/i.test(segment)) return segment;
  return encodeURIComponent(segment);
}

/**
 * Turn an asset key as a template author (or the manifest) writes it into a
 * URL path. Windows backslashes become "/" — the manifest reports some entries
 * as "Envelope Intro (2)\Envelope Intro\head.png" because that is how they were
 * written into the source HTML — and every segment is encoded, so spaces and
 * "&" in filenames resolve instead of 404ing.
 */
export function encodeAssetPath(assetPath: string): string {
  return assetPath
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .map(encodeSegment)
    .join("/");
}

/** The manifest's own key form for an asset: forward slashes, no "./" prefix. */
export function normalizeAssetKey(assetPath: string): string {
  return assetPath.replace(/\\/g, "/").replace(/^\.?\//, "").toLowerCase();
}

/** Is this URL served by the remote asset host? */
export function isRemoteAssetUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith(`${REMOTE_ASSET_ORIGIN}/`);
}

/**
 * Cross-origin images must be requested with CORS or the first toDataURL()
 * taints the canvas and every export throws a SecurityError. Data/blob URLs
 * must NOT be — Fabric would set crossOrigin on an element that has no CORS
 * story and some browsers reject it.
 */
export function crossOriginFor(url: unknown): "anonymous" | undefined {
  if (typeof url !== "string" || !url) return undefined;
  if (url.startsWith("data:") || url.startsWith("blob:")) return undefined;
  return isRemoteAssetUrl(url) ? "anonymous" : undefined;
}
