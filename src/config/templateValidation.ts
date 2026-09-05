// ─────────────────────────────────────────────────────────────────────────────
// Development-time template validation.
//
// A malformed template should be loud in dev and harmless in production: every
// problem is collected and reported through console.warn / console.error, and
// NOTHING here ever throws. A live invitation must not go blank because a
// template author mistyped an element type.
//
// It runs once, lazily, the first time the registry is used — not at import
// time — and it never touches the network, so no template asset is fetched just
// to be checked.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveElementSource } from "./templateAssetResolver";
import {
  EDITOR_CANVAS_HEIGHT,
  EDITOR_CANVAS_WIDTH,
  TEMPLATE_ELEMENT_TYPES,
  isBlockRef,
  type TemplateBlock,
  type TemplateDefinition,
  type TemplateElement,
  type TemplatePage,
} from "./templateTypes";

export type TemplateIssue = {
  level: "error" | "warning";
  /** "template:full-template / page:gallery / element:photo-1" */
  where: string;
  message: string;
};

const isDev = () => process.env.NODE_ENV !== "production";

const elementLabel = (el: TemplateElement, index: number): string =>
  el.key ? `element:${el.key}` : `element[${index}]:${String((el as { type?: unknown }).type)}`;

function validateElement(
  el: TemplateElement,
  index: number,
  where: string,
  assetCtx: Pick<TemplateDefinition, "baseAssetPath"> | string | undefined,
  issues: TemplateIssue[],
): void {
  const at = `${where} / ${elementLabel(el, index)}`;
  const type = (el as { type?: unknown }).type;

  if (!TEMPLATE_ELEMENT_TYPES.includes(type as never)) {
    issues.push({
      level: "error",
      where: at,
      message: `unknown element type ${JSON.stringify(type)} — it will be skipped. Known types: ${TEMPLATE_ELEMENT_TYPES.join(", ")}.`,
    });
    return;
  }

  // Both spellings of the same coordinate is almost always a copy/paste slip,
  // and the alias silently wins — worth saying out loud.
  const base = el as { x?: number; left?: number; y?: number; top?: number };
  if (base.x !== undefined && base.left !== undefined) {
    issues.push({ level: "warning", where: at, message: "both `x` and `left` are set — `x` wins." });
  }
  if (base.y !== undefined && base.top !== undefined) {
    issues.push({ level: "warning", where: at, message: "both `y` and `top` are set — `y` wins." });
  }

  switch (el.type) {
    case "text":
      if (typeof el.text !== "string") {
        issues.push({ level: "error", where: at, message: "a text element needs a `text` string." });
      }
      break;

    case "image":
    case "gallerySlot": {
      if (!el.asset && !el.src) {
        issues.push({
          level: "error",
          where: at,
          message: "needs an `asset` (relative to baseAssetPath) or a `src`.",
        });
        break;
      }
      const resolved = resolveElementSource(assetCtx, el);
      if (!resolved) {
        issues.push({ level: "error", where: at, message: "asset resolved to an empty url." });
      } else if (resolved.includes("\\")) {
        issues.push({
          level: "warning",
          where: at,
          message: `asset url contains a backslash (${resolved}) — asset paths are urls, use "/".`,
        });
      } else if (/\s/.test(resolved)) {
        issues.push({
          level: "warning",
          where: at,
          message: `asset url contains whitespace (${resolved}) — it may 404 once deployed.`,
        });
      }
      if (el.type === "gallerySlot" && !(Number.isInteger(el.index) && el.index > 0)) {
        issues.push({
          level: "error",
          where: at,
          message: "gallerySlot needs a 1-based integer `index` (it becomes galleryImage{index}).",
        });
      }
      break;
    }

    case "shape":
      if (!el.shape) {
        issues.push({ level: "error", where: at, message: "a shape element needs a `shape`." });
      }
      break;

    case "countdownBox":
      if (!el.label) {
        issues.push({
          level: "error",
          where: at,
          message: "countdownBox needs a `label` — its lowercase form becomes `countdownUnit`.",
        });
      }
      break;

    case "guestbookNav":
      if (el.direction !== "prev" && el.direction !== "next") {
        issues.push({
          level: "error",
          where: at,
          message: 'guestbookNav needs `direction: "prev" | "next"`.',
        });
      }
      break;

    case "raw":
      if (!el.object || typeof el.object !== "object") {
        issues.push({ level: "error", where: at, message: "a raw element needs an `object`." });
      }
      break;
  }
}

function validatePage(
  page: TemplatePage | TemplateBlock,
  where: string,
  assetCtx: Pick<TemplateDefinition, "baseAssetPath"> | string | undefined,
  issues: TemplateIssue[],
): void {
  const at = `${where} / page:${page.id}`;

  if (!Array.isArray(page.elements)) {
    issues.push({ level: "error", where: at, message: "`elements` must be an array." });
    return;
  }

  const seenKeys = new Set<string>();
  page.elements.forEach((el, i) => {
    const key = (el as { key?: string }).key;
    if (key) {
      if (seenKeys.has(key)) {
        issues.push({ level: "error", where: at, message: `duplicate element key "${key}".` });
      }
      seenKeys.add(key);
    }
    validateElement(el, i, at, assetCtx, issues);
  });

  // galleryImage{n} indices must be unique — the slideshow and the photo
  // counter both key off the name, so a collision loses a photo.
  const slotNames = new Set<string>();
  page.elements.forEach((el) => {
    if (el.type !== "gallerySlot") return;
    const name = el.name ?? `galleryImage${el.index}`;
    if (slotNames.has(name)) {
      issues.push({ level: "error", where: at, message: `duplicate gallery slot name "${name}".` });
    }
    slotNames.add(name);
  });
}

/** Check one template definition. Never throws. */
export function validateTemplate(
  template: TemplateDefinition,
  blocks: Record<string, TemplateBlock>,
): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const where = `template:${template?.id ?? "<missing id>"}`;

  if (!template?.id) issues.push({ level: "error", where, message: "missing `id`." });
  if (!template?.name) issues.push({ level: "error", where, message: "missing `name`." });

  const canvas = template?.canvas;
  if (!canvas || !(canvas.width > 0) || !(canvas.height > 0)) {
    issues.push({
      level: "error",
      where,
      message: "`canvas` needs positive `width` and `height`.",
    });
  } else if (canvas.width !== EDITOR_CANVAS_WIDTH || canvas.height !== EDITOR_CANVAS_HEIGHT) {
    issues.push({
      level: "warning",
      where,
      message: `canvas is ${canvas.width}×${canvas.height}, but the editor artboard is fixed at ${EDITOR_CANVAS_WIDTH}×${EDITOR_CANVAS_HEIGHT} — this design will not line up.`,
    });
  }

  if (!Array.isArray(template?.pages) || template.pages.length === 0) {
    issues.push({ level: "error", where, message: "has no `pages`." });
    return issues;
  }

  const seenPageIds = new Set<string>();
  template.pages.forEach((ref, i) => {
    let page: TemplatePage | TemplateBlock | null = null;

    if (isBlockRef(ref)) {
      const block = blocks[ref.block];
      if (!block) {
        issues.push({
          level: "error",
          where: `${where} / pages[${i}]`,
          message: `references unknown block "${ref.block}". Known blocks: ${Object.keys(blocks).join(", ")}.`,
        });
        return;
      }
      page = { ...block, id: ref.id ?? block.id };
    } else {
      page = ref;
      if (!page?.id) {
        issues.push({ level: "error", where: `${where} / pages[${i}]`, message: "missing page `id`." });
        return;
      }
    }

    if (seenPageIds.has(page.id)) {
      issues.push({ level: "error", where, message: `duplicate page id "${page.id}".` });
    }
    seenPageIds.add(page.id);

    validatePage(page, where, template, issues);
  });

  return issues;
}

/** Check the whole registry — cross-template uniqueness plus every block. */
export function validateRegistry(
  registry: Record<string, TemplateDefinition>,
  blocks: Record<string, TemplateBlock>,
): TemplateIssue[] {
  const issues: TemplateIssue[] = [];

  const seenIds = new Map<string, string>();
  const seenSlugs = new Map<string, string>();
  for (const registryKey of Object.keys(registry)) {
    const template = registry[registryKey];
    const id = template?.id;
    if (id) {
      const owner = seenIds.get(id);
      if (owner) {
        issues.push({
          level: "error",
          where: "registry",
          message: `duplicate template id "${id}" on both "${owner}" and "${registryKey}".`,
        });
      } else {
        seenIds.set(id, registryKey);
      }
    }
    const slug = template?.slug ?? id;
    if (slug) {
      const owner = seenSlugs.get(slug);
      if (owner) {
        issues.push({
          level: "error",
          where: "registry",
          message: `duplicate template slug "${slug}" on both "${owner}" and "${registryKey}".`,
        });
      } else {
        seenSlugs.set(slug, registryKey);
      }
    }
    issues.push(...validateTemplate(template, blocks));
  }

  // Blocks are validated once on their own too, because the editor pulls some
  // of them (gallery / countdown / guestbook / envelope) without any template.
  for (const blockKey of Object.keys(blocks)) {
    const block = blocks[blockKey];
    if (!block?.id) {
      issues.push({ level: "error", where: `block:${blockKey}`, message: "missing `id`." });
      continue;
    }
    validatePage(block, "blocks", "/", issues);
  }

  return issues;
}

let reported = false;

/**
 * Report the registry's problems to the console — once per session, dev only.
 * Safe to call from anywhere; it is a no-op in production.
 */
export function reportTemplateIssuesOnce(
  registry: Record<string, TemplateDefinition>,
  blocks: Record<string, TemplateBlock>,
): void {
  if (reported || !isDev()) return;
  reported = true;
  try {
    const issues = validateRegistry(registry, blocks);
    for (const issue of issues) {
      const line = `[templates] ${issue.where}: ${issue.message}`;
      if (issue.level === "error") console.error(line);
      else console.warn(line);
    }
  } catch (e) {
    // Validation is a development aid — it must never become the failure.
    console.warn("[templates] validation itself failed", e);
  }
}
