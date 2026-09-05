// ─────────────────────────────────────────────────────────────────────────────
// Where template media lives.
//
// Every image a template references goes through here, so the hosting decision
// is made in ONE place and the renderer never has to know. Fabric receives a
// perfectly ordinary URL either way:
//
//   assetProvider: "local"     (the default, and every pre-existing template)
//     asset "/head.png"     →  /head.png                       (Vercel /public)
//
//   assetProvider: "ifastnet"  +  remoteTemplateId: 11
//     asset "ImageGallery/img1.png"
//                           →  https://vi-up.com/uploads/templates/11/ImageGallery/img1.png
//
// Nothing is copied between the two hosts and nothing is proxied: a remote
// asset resolves to a URL on vi-up.com and the browser fetches it from there.
//
// Scope: this only resolves TEMPLATE assets. Editor chrome (sidebar icons,
// footer buttons) keeps its own literal /public paths and is untouched.
//
// NOTE on saved projects: a design the user has already saved stores the
// RESOLVED url on the object, so existing projects keep pointing at wherever
// their assets were when they were created — /head.png stays /head.png, and a
// remote https://vi-up.com/... url stays exactly that. Re-pointing a base only
// affects templates applied from that moment on, which is the correct
// behaviour: an old project's images must not 404 the day the base moves.
// ─────────────────────────────────────────────────────────────────────────────

import {
  REMOTE_ASSET_ORIGIN,
  encodeAssetPath,
  isRemoteAssetUrl,
  remoteTemplateBaseUrl,
} from "./remoteTemplates";
import { findManifestAsset, getCachedTemplateManifest } from "@/src/lib/templateManifest";
import type { TemplateDefinition } from "./templateTypes";

/**
 * What the resolver needs to know about a template. A whole TemplateDefinition
 * satisfies it; a bare string is shorthand for a local baseAssetPath (which is
 * what the shared blocks pass).
 */
export type TemplateAssetContext =
  | Pick<TemplateDefinition, "baseAssetPath" | "assetProvider" | "remoteTemplateId">
  | string
  | null
  | undefined;

/** Already a complete location — leave it alone. */
const ABSOLUTE_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const isAbsolute = (value: string): boolean => ABSOLUTE_RE.test(value);

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");
const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, "");

/**
 * Prefix applied to root-relative LOCAL template assets. Empty (the default)
 * keeps them app-relative, which is what /public serving needs. Remote
 * templates ignore this entirely — they carry their own origin.
 */
let assetBase = trimTrailingSlash(process.env.NEXT_PUBLIC_TEMPLATE_ASSET_BASE ?? "");

/**
 * Point local template assets at another origin at runtime. Pass "" to go back
 * to serving from /public. Absolute `src` values are never rewritten.
 */
export function setTemplateAssetBase(base: string): void {
  assetBase = trimTrailingSlash(base ?? "");
}

export function getTemplateAssetBase(): string {
  return assetBase;
}

/** Apply the host prefix to an app-relative path. */
const withBase = (path: string): string =>
  assetBase ? `${assetBase}/${trimLeadingSlash(path)}` : path;

// ── Provider ────────────────────────────────────────────────────────────────

type RemoteContext = { remoteTemplateId: string; baseAssetPath?: string };

/** Strip surrounding slashes and normalize Windows separators. */
const trimSegments = (value: string | undefined): string =>
  (value ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

/**
 * The remote identity of a template, or null when it is a local one. A context
 * only counts as remote when it BOTH declares the provider and carries an id —
 * a half-configured template stays local rather than resolving to a broken
 * https://vi-up.com/uploads/templates/undefined/… url.
 */
function remoteContextOf(template: TemplateAssetContext): RemoteContext | null {
  if (!template || typeof template === "string") return null;
  if (template.assetProvider !== "ifastnet") return null;
  const id = template.remoteTemplateId;
  if (id == null || id === "") {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        '[TemplateAsset] a template declares assetProvider "ifastnet" but no remoteTemplateId — falling back to local paths.',
      );
    }
    return null;
  }
  return { remoteTemplateId: String(id), baseAssetPath: template.baseAssetPath };
}

/** True when this template's media is hosted remotely. */
export function isRemoteTemplate(template: TemplateAssetContext): boolean {
  return remoteContextOf(template) !== null;
}

/**
 * The folder a template's relative assets hang off.
 *   local     → "/templates/crimson-velvet"  (app-relative)
 *   ifastnet  → "https://vi-up.com/uploads/templates/11/"
 */
export function templateAssetBaseUrl(template: TemplateAssetContext): string {
  const remote = remoteContextOf(template);
  if (!remote) {
    const baseAssetPath =
      typeof template === "string" ? template : (template?.baseAssetPath ?? "/");
    return withBase(trimTrailingSlash(baseAssetPath || "/") || "/");
  }
  const base = remoteTemplateBaseUrl(remote.remoteTemplateId);
  const folder = trimSegments(remote.baseAssetPath);
  return folder ? `${base}${encodeAssetPath(folder)}/` : base;
}

/**
 * Resolve a relative asset for a remote template.
 *
 * When the template's manifest is already in this session's cache the exact URL
 * the API published is used — which is what makes odd filenames ("Envelope
 * Intro (2)\Envelope Intro\head.png", "z&z.svg") resolve byte-for-byte the way
 * iFastNet spells them. With no manifest it falls back to a deterministic join,
 * so resolution NEVER blocks on the network and a template still renders when
 * the manifest endpoint is unreachable.
 */
function resolveRemote(remote: RemoteContext, raw: string): string {
  const rooted = raw.replace(/\\/g, "/").startsWith("/");
  const cleaned = trimSegments(raw);
  if (!cleaned) return "";

  if (!rooted) {
    const fromManifest = findManifestAsset(
      getCachedTemplateManifest(remote.remoteTemplateId),
      remote.baseAssetPath ? `${trimSegments(remote.baseAssetPath)}/${cleaned}` : cleaned,
    );
    if (fromManifest) return fromManifest.url;
    return `${templateAssetBaseUrl({
      assetProvider: "ifastnet",
      remoteTemplateId: remote.remoteTemplateId,
      baseAssetPath: remote.baseAssetPath,
    })}${encodeAssetPath(cleaned)}`;
  }

  // Root-relative inside a REMOTE template means "elsewhere on the remote
  // host" — the manifest itself reports shared files that way
  // ("/uploads/user_event/9/Kampung.png"). A Vercel-hosted file in a remote
  // template must be written as a full absolute URL.
  return `${REMOTE_ASSET_ORIGIN}/${encodeAssetPath(cleaned)}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve one asset reference against its template.
 *
 *   resolveTemplateAsset(tpl, "envelope.webp")   // baseAssetPath + name + host base
 *   resolveTemplateAsset(tpl, "/head.png")       // root-relative
 *   resolveTemplateAsset(tpl, "https://…/x.png") // returned untouched
 *
 * `template` may be a whole definition or just its baseAssetPath.
 */
export function resolveTemplateAsset(template: TemplateAssetContext, asset: string | null | undefined): string {
  const raw = (asset ?? "").trim();
  if (!raw) return "";
  // Absolute URLs (and data:/blob:) are complete addresses already.
  if (isAbsolute(raw)) return raw;

  const remote = remoteContextOf(template);
  if (remote) return resolveRemote(remote, raw);

  // Root-relative: the author has spelled out the full app path themselves.
  if (raw.startsWith("/")) return withBase(raw);

  const baseAssetPath =
    typeof template === "string" ? template : (template?.baseAssetPath ?? "/");
  const folder = trimTrailingSlash(baseAssetPath || "/");
  const joined = folder ? `${folder}/${trimLeadingSlash(raw)}` : `/${trimLeadingSlash(raw)}`;
  return withBase(joined.startsWith("/") ? joined : `/${joined}`);
}

/**
 * Pick the url for an element that may carry either an absolute `src` or an
 * `asset` relative to the template. `src` wins when both are present.
 */
export function resolveElementSource(
  template: TemplateAssetContext,
  element: { src?: string; asset?: string },
): string {
  if (element.src) return resolveTemplateAsset(template, element.src);
  return resolveTemplateAsset(template, element.asset);
}

export { isRemoteAssetUrl };
