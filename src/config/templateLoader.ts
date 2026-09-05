// ─────────────────────────────────────────────────────────────────────────────
// Template loader — the ONE way anything reads the registry.
//
//   listTemplates()            metadata for the Templates panel (builds no page)
//   getTemplate(id)            a deep-cloned definition
//   buildTemplatePages(id)     Fabric pages, ready for editor.loadTemplate()
//   buildBlockPage(blockId)    one shared block as a Fabric page
//   getTemplateManifest(id)    iFastNet's asset manifest — the ONLY async call
//                              here, and the only one that touches the network
//
// Two rules this file exists to enforce:
//
//  1. IMMUTABILITY. Every value handed out is a fresh deep clone. The registry
//     objects are module-level constants shared by every project in the tab, so
//     returning one directly would let editing project A rewrite the master
//     definition — and project B with it. Nothing here ever returns a live
//     reference into `templates` / `templateBlocks`.
//
//  2. TEMPLATES ARE A STARTING POINT, NOT A SOURCE. A template is read when a
//     design is created or when the user applies one from the panel. After
//     that the project's own saved pages are the truth and are loaded verbatim,
//     so nothing in here ever reloads a template over a user's edits:
//
//       template config → new project → saved project state → future loads
//
// Page building fetches and decodes nothing: pages are plain JSON with `src`
// strings, and Fabric only loads an image when it actually enlivens a page.
// Importing this module costs no network traffic, whatever the registry grows
// to — including the iFastNet-hosted templates, whose manifest is requested
// only when getTemplateManifest() is called for that one template.
// ─────────────────────────────────────────────────────────────────────────────

import {
  isRemoteTemplate,
  resolveTemplateAsset,
  templateAssetBaseUrl,
} from "./templateAssetResolver";
import {
  getRemoteTemplateManifest,
  type RemoteTemplateManifest,
} from "@/src/lib/templateManifest";
import { createPageJson } from "./templateElementFactory";
import { RUNTIME_BLOCKS, templateBlocks, templates } from "./templates";
import { reportTemplateIssuesOnce } from "./templateValidation";
import {
  isBlockRef,
  type FabricPageJson,
  type TemplateBlock,
  type TemplateDefinition,
  type TemplatePage,
  type TemplateSummary,
} from "./templateTypes";

/** structuredClone where available, JSON round-trip otherwise. */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Falls through — a definition holding something unclonable is a bug the
      // validator should surface, not a reason to hand out a live reference.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Dev-time validation, run lazily on first use so it costs nothing at import. */
function ensureValidated(): void {
  reportTemplateIssuesOnce(templates, templateBlocks);
}

/** Registry entries by their `id` (not by their object key). */
function byId(): Map<string, TemplateDefinition> {
  const map = new Map<string, TemplateDefinition>();
  for (const key of Object.keys(templates)) {
    const template = templates[key];
    if (template?.id) map.set(template.id, template);
  }
  return map;
}

const slugOf = (template: TemplateDefinition): string => template.slug ?? template.id;

// ── Metadata ────────────────────────────────────────────────────────────────

/**
 * Every template's card data, in registry order. Deliberately builds no pages
 * and resolves only the thumbnail, so the template picker stays cheap however
 * many templates exist.
 */
export function listTemplates(): TemplateSummary[] {
  ensureValidated();
  return Object.keys(templates).map((key) => {
    const template = templates[key];
    return {
      id: template.id,
      name: template.name,
      slug: slugOf(template),
      description: template.description,
      thumbnail: template.thumbnail
        ? resolveTemplateAsset(template, template.thumbnail)
        : undefined,
      preview: template.preview ? resolveTemplateAsset(template, template.preview) : undefined,
      category: template.category,
      pageCount: template.pages.length,
      assetProvider: template.assetProvider ?? "local",
      remoteTemplateId: template.remoteTemplateId,
    };
  });
}

export function getTemplateSummary(id: string): TemplateSummary | null {
  return listTemplates().find((t) => t.id === id) ?? null;
}

// ── Definitions ─────────────────────────────────────────────────────────────

/**
 * The full definition for a template id (or its slug), deep-cloned so callers
 * can do as they like with it. Null when there is no such template.
 */
export function getTemplate(id: string | null | undefined): TemplateDefinition | null {
  ensureValidated();
  if (!id) return null;
  const map = byId();
  const found =
    map.get(id) ??
    Object.keys(templates)
      .map((key) => templates[key])
      .find((t) => slugOf(t) === id) ??
    templates[id];
  return found ? deepClone(found) : null;
}

export function hasTemplate(id: string | null | undefined): boolean {
  if (!id) return false;
  return byId().has(id) || !!templates[id];
}

// ── Page building ───────────────────────────────────────────────────────────

/** Resolve one of a template's page refs into a concrete page definition. */
function resolvePageRef(
  template: TemplateDefinition,
  ref: TemplateDefinition["pages"][number],
  index: number,
): TemplatePage | null {
  if (!isBlockRef(ref)) return { ...ref, order: ref.order };

  const block = templateBlocks[ref.block];
  if (!block) {
    // Validation has already reported this in dev. In production, skip the
    // page rather than hand the editor a broken document.
    console.warn(`[templates] ${template.id}: pages[${index}] references unknown block "${ref.block}"`);
    return null;
  }
  return {
    ...block,
    id: ref.id ?? block.id,
    name: ref.name ?? block.name,
    background: ref.background ?? block.background,
    order: ref.order,
  };
}

/** Apply an explicit `order` where one is given; stable otherwise. */
function sortPages(pages: TemplatePage[]): TemplatePage[] {
  if (!pages.some((p) => typeof p.order === "number")) return pages;
  return pages
    .map((page, i) => ({ page, i }))
    .sort((a, b) => {
      const ao = a.page.order;
      const bo = b.page.order;
      if (ao === undefined && bo === undefined) return a.i - b.i;
      if (ao === undefined) return -1;
      if (bo === undefined) return 1;
      return ao === bo ? a.i - b.i : ao - bo;
    })
    .map((entry) => entry.page);
}

/**
 * Compile a template into the Fabric pages the editor works with — the exact
 * shape of `pages[]` in a saved project, so `editor.loadTemplate(pages, id)`
 * takes them as-is.
 *
 * Freshly built on every call from cloned definitions, so two projects created
 * from the same template share nothing.
 */
export function buildTemplatePages(id: string | null | undefined): FabricPageJson[] {
  const template = getTemplate(id);
  if (!template) {
    console.warn(`[templates] no template registered for id "${id}"`);
    return [];
  }
  const resolved = template.pages
    .map((ref, i) => resolvePageRef(template, ref, i))
    .filter((page): page is TemplatePage => !!page);

  const defaults = {
    background: template.canvas?.background,
    version: template.canvas?.version,
  };
  return sortPages(resolved).map((page) => createPageJson(page, template, defaults));
}

// ── Remote (iFastNet-hosted) templates ──────────────────────────────────────

/** Is this template's media hosted on iFastNet rather than in /public? */
export function isRemoteTemplateId(id: string | null | undefined): boolean {
  return isRemoteTemplate(getTemplate(id));
}

/** Where a template's relative assets resolve from. Diagnostics / dev tooling. */
export function getTemplateAssetBaseUrl(id: string | null | undefined): string {
  return templateAssetBaseUrl(getTemplate(id));
}

/**
 * The iFastNet asset manifest for a template, or null when the template is
 * local (nothing to fetch) or unknown.
 *
 * Fetched ON DEMAND and cached for the session — call it when the user picks
 * the template, not on mount. Rejects with a TemplateManifestError if iFastNet
 * cannot be reached, so a caller can show a real message instead of applying a
 * template whose pictures will not arrive.
 *
 * Priming it before buildTemplatePages() is worthwhile but never required: with
 * the manifest cached, every asset resolves to the exact url iFastNet
 * published; without it, the resolver falls back to the deterministic
 * base + path join.
 */
export async function getTemplateManifest(
  id: string | null | undefined,
  options?: { force?: boolean; signal?: AbortSignal },
): Promise<RemoteTemplateManifest | null> {
  const template = getTemplate(id);
  if (!template || !isRemoteTemplate(template) || template.remoteTemplateId == null) return null;
  return getRemoteTemplateManifest(template.remoteTemplateId, options);
}

/** The declared canvas size for a template, or null if it isn't registered. */
export function getTemplateCanvas(id: string | null | undefined) {
  const template = getTemplate(id);
  return template ? { ...template.canvas } : null;
}

// ── Shared blocks ───────────────────────────────────────────────────────────

/** A block definition by id, deep-cloned. */
export function getBlock(blockId: string): TemplateBlock | null {
  ensureValidated();
  const block = templateBlocks[blockId];
  return block ? deepClone(block) : null;
}

/**
 * One shared block compiled to a Fabric page. This is what the editor calls for
 * the blank canvas's envelope page, for the gallery page the Photos panel adds,
 * and for the countdown / guestbook elements dropped from the Elements panel.
 *
 * A FRESH page every call — the old code pushed the shared module export
 * straight into `pages[]`, where a later edit could write through to it.
 */
export function buildBlockPage(blockId: string): FabricPageJson {
  const block = getBlock(blockId);
  if (!block) {
    console.warn(`[templates] no block registered for id "${blockId}"`);
    return { version: undefined, background: "#ffffff", objects: [] };
  }
  // Blocks live at the /public root today, matching what saved projects store.
  return createPageJson(block, "/", undefined);
}

/** The Fabric objects of a block, without the page wrapper. */
export function buildBlockObjects(blockId: string): Record<string, unknown>[] {
  return buildBlockPage(blockId).objects;
}

/**
 * How many photo slots the gallery block ships with. They are free starter
 * photos and must not count against a package's gallery budget.
 */
export function getGalleryStarterCount(): number {
  const block = templateBlocks[RUNTIME_BLOCKS.gallery];
  if (!block) return 0;
  return block.elements.filter(
    (el) =>
      el.type === "gallerySlot" ||
      (typeof (el as { name?: string }).name === "string" &&
        (el as { name: string }).name.startsWith("galleryImage")),
  ).length;
}

export { RUNTIME_BLOCKS };
