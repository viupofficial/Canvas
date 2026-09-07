// ─────────────────────────────────────────────────────────────────────────────
// Element factory: TemplateElement ──▶ plain Fabric object JSON.
//
// It deliberately produces JSON, not live Fabric instances. Every consumer in
// the editor already speaks JSON — pages are stored as JSON, `loadFromJSON`
// paints them and `enlivenObjects` revives a dropped element — so emitting JSON
// keeps the template layer completely outside the runtime and means images are
// only fetched when Fabric actually enlivens a page (nothing is preloaded when
// the registry is imported).
//
// The composite types (countdownBox, guestbookNav) exist so a template author
// cannot forget the markers the runtime depends on: `countdownUnit` on the value
// box, `prevBtn`/`nextBtn` on the pager glyphs. Their default styling is the
// stock Vi-Up look and every part of it can be overridden per element.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveElementSource, type TemplateAssetContext } from "./templateAssetResolver";
import { crossOriginFor } from "./remoteTemplates";
import {
  TEMPLATE_PAGE_VERSION,
  type FabricPageJson,
  type TemplateBlock,
  type TemplateCountdownBoxElement,
  type TemplateElement,
  type TemplateGallerySlotElement,
  type TemplateGuestbookNavElement,
  type TemplateImageElement,
  type TemplatePage,
  type TemplateRawElement,
  type TemplateShapeElement,
  type TemplateTextElement,
} from "./templateTypes";

type FabricObject = Record<string, unknown>;

/** Asset-resolution context — a template, or just its baseAssetPath. */
export type AssetContext = TemplateAssetContext;

/** Assign only when the author actually supplied a value, so the emitted JSON
 *  carries no `undefined` keys and stays identical to hand-written page JSON. */
function put(target: FabricObject, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

/** Geometry / layering / interaction shared by every non-raw element. */
function applyBase(out: FabricObject, el: Exclude<TemplateElement, TemplateRawElement>): void {
  put(out, "left", el.x ?? el.left);
  put(out, "top", el.y ?? el.top);
  put(out, "width", el.width);
  put(out, "height", el.height);
  put(out, "scaleX", el.scaleX);
  put(out, "scaleY", el.scaleY);
  put(out, "angle", el.angle);
  put(out, "opacity", el.opacity);
  put(out, "originX", el.originX);
  put(out, "originY", el.originY);
  put(out, "flipX", el.flipX);
  put(out, "flipY", el.flipY);
  put(out, "visible", el.visible);
  put(out, "selectable", el.selectable);
  put(out, "evented", el.evented);
  put(out, "locked", el.locked);
  put(out, "name", el.name);
  put(out, "linkUrl", el.linkUrl);
  put(out, "url", el.url);
  put(out, "action", el.action);
  put(out, "animationType", el.animationType);
  put(out, "animation", el.animation);
  put(out, "targetPage", el.targetPage);
}

/** `props` is the verbatim escape hatch and therefore wins over everything. */
function applyExtraProps(out: FabricObject, el: { props?: Record<string, unknown> }): void {
  if (el.props) Object.assign(out, el.props);
}

function buildText(el: TemplateTextElement): FabricObject {
  const out: FabricObject = { type: el.fabricType ?? el.variant ?? "textbox" };
  applyBase(out, el);
  put(out, "text", el.text);
  put(out, "fontFamily", el.fontFamily);
  put(out, "fontSize", el.fontSize);
  put(out, "fontWeight", el.fontWeight);
  put(out, "fontStyle", el.fontStyle);
  put(out, "textAlign", el.textAlign);
  put(out, "fill", el.fill);
  put(out, "lineHeight", el.lineHeight);
  put(out, "charSpacing", el.charSpacing);
  put(out, "underline", el.underline);
  put(out, "linethrough", el.linethrough);
  put(out, "stroke", el.stroke);
  put(out, "strokeWidth", el.strokeWidth);
  applyExtraProps(out, el);
  return out;
}

function buildImage(el: TemplateImageElement, ctx: AssetContext): FabricObject {
  const out: FabricObject = { type: el.fabricType ?? "image" };
  applyBase(out, el);
  const src = resolveElementSource(ctx, el);
  put(out, "src", src);
  // Fabric's Image.fromObject() passes this straight to the <img> when the page
  // is revived, so a remotely hosted picture MUST carry it or the first
  // toDataURL() (thumbnail, PDF, publish preview) throws on a tainted canvas.
  // Local /public images are same-origin and keep emitting nothing at all, so
  // their JSON is byte-identical to what earlier builds produced.
  put(out, "crossOrigin", el.crossOrigin ?? crossOriginFor(src));
  applyExtraProps(out, el);
  return out;
}

function buildShape(el: TemplateShapeElement): FabricObject {
  const out: FabricObject = { type: el.fabricType ?? el.shape };
  applyBase(out, el);
  put(out, "fill", el.fill);
  put(out, "stroke", el.stroke);
  put(out, "strokeWidth", el.strokeWidth);
  put(out, "rx", el.rx);
  put(out, "ry", el.ry);
  put(out, "radius", el.radius);
  put(out, "points", el.points);
  put(out, "path", el.path);
  put(out, "shapeKind", el.shapeKind);
  put(out, "pointCount", el.pointCount);
  put(out, "innerRatio", el.innerRatio);
  // A Fabric Line takes its endpoints positionally, not as named props.
  if (el.shape === "line" && el.coords) put(out, "coords", el.coords);
  applyExtraProps(out, el);
  return out;
}

function buildGallerySlot(el: TemplateGallerySlotElement, ctx: AssetContext): FabricObject {
  const out: FabricObject = { type: el.fabricType ?? "image" };
  applyBase(out, el);
  const src = resolveElementSource(ctx, el);
  put(out, "src", src);
  put(out, "crossOrigin", crossOriginFor(src));
  // The name is the contract with the Photos panel, the package photo counter
  // and the slideshow — always derived, never left to the author.
  out.name = el.name ?? `galleryImage${el.index}`;
  applyExtraProps(out, el);
  return out;
}

// ── Composite defaults (the stock Vi-Up look) ───────────────────────────────

const COUNTDOWN_BOX_DEFAULTS = {
  boxTop: 140,
  boxWidth: 70,
  boxHeight: 90,
  boxFill: "#f5f5f5",
  boxRadius: 10,
  labelTop: 130,
  labelWidth: 56,
  labelFontSize: 12,
  labelFill: "#333",
  valueTop: 160,
  valueWidth: 56,
  valueFontSize: 22,
  valueFill: "#000",
  value: "00",
} as const;

const GUESTBOOK_NAV_DEFAULTS = {
  top: 262,
  size: 44,
  radius: 12,
  fill: "#f2ede9",
  stroke: "#e6ddd6",
  strokeWidth: 1,
  fontSize: 22,
  glyphFill: "#333",
} as const;

/**
 * One countdown unit → [backing rect, label, value].
 *
 * The value box carries `countdownUnit` (the lowercased label), which is the
 * only thing the ticker in CanvasEditor and in the published player looks for.
 */
function buildCountdownBox(el: TemplateCountdownBoxElement): FabricObject[] {
  const d = COUNTDOWN_BOX_DEFAULTS;
  const left = el.x ?? el.left ?? 0;
  const top = el.y ?? el.top;
  // A `top` on the element shifts the whole box; the three parts keep their
  // relative offsets from the backing rect.
  const shift = top === undefined ? 0 : top - d.boxTop;

  const box: FabricObject = {
    type: "rect",
    left,
    top: d.boxTop + shift,
    width: el.width ?? d.boxWidth,
    height: el.height ?? d.boxHeight,
    fill: d.boxFill,
    rx: d.boxRadius,
    ry: d.boxRadius,
  };
  if (el.box) Object.assign(box, stripUndefined(el.box as FabricObject));

  const label: FabricObject = {
    type: "textbox",
    text: el.label,
    left,
    top: d.labelTop + shift,
    originX: "center",
    width: d.labelWidth,
    fontSize: d.labelFontSize,
    fontStyle: "italic",
    textAlign: "center",
    fill: d.labelFill,
  };
  if (el.labelStyle) Object.assign(label, stripUndefined(el.labelStyle as FabricObject));

  const value: FabricObject = {
    type: "textbox",
    text: el.value ?? d.value,
    left,
    top: d.valueTop + shift,
    originX: "center",
    width: d.valueWidth,
    fontSize: d.valueFontSize,
    fontWeight: "bold",
    textAlign: "center",
    fill: d.valueFill,
    countdownUnit: el.label.toLowerCase(),
  };
  if (el.valueStyle) Object.assign(value, stripUndefined(el.valueStyle as FabricObject));

  // Element-level name/props apply to the value box — the meaningful part.
  put(value, "name", el.name);
  applyExtraProps(value, el);

  return [box, label, value];
}

/** One guestbook pager → [rounded pill, arrow glyph]. */
function buildGuestbookNav(el: TemplateGuestbookNavElement): FabricObject[] {
  const d = GUESTBOOK_NAV_DEFAULTS;
  const left = el.x ?? el.left ?? 0;
  const top = el.y ?? el.top ?? d.top;
  const prefix = el.direction === "prev" ? "prev" : "next";
  const glyph = el.glyph ?? (el.direction === "prev" ? "←" : "→");

  const box: FabricObject = {
    type: "rect",
    left,
    top,
    width: el.width ?? d.size,
    height: el.height ?? d.size,
    rx: d.radius,
    ry: d.radius,
    originX: "center",
    originY: "center",
    fill: d.fill,
    stroke: d.stroke,
    strokeWidth: d.strokeWidth,
    name: `${prefix}BtnBg`,
  };
  if (el.box) Object.assign(box, stripUndefined(el.box as FabricObject));

  const arrow: FabricObject = {
    type: "textbox",
    text: glyph,
    left,
    top,
    width: el.width ?? d.size,
    originX: "center",
    originY: "center",
    fontSize: d.fontSize,
    textAlign: "center",
    fill: d.glyphFill,
    name: `${prefix}Btn`,
  };
  if (el.glyphStyle) Object.assign(arrow, stripUndefined(el.glyphStyle as FabricObject));

  applyExtraProps(arrow, el);
  return [box, arrow];
}

function stripUndefined(obj: FabricObject): FabricObject {
  const out: FabricObject = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

/**
 * Build one element. Returns an array because composites expand to several
 * Fabric objects; simple types return a single-entry array.
 *
 * An unknown type yields nothing rather than throwing — a bad definition must
 * never take a live invitation down. templateValidation reports it in dev.
 */
export function createElementJson(el: TemplateElement, ctx: AssetContext): FabricObject[] {
  switch (el.type) {
    case "text":
      return [buildText(el)];
    case "image":
      return [buildImage(el, ctx)];
    case "shape":
      return [buildShape(el)];
    case "gallerySlot":
      return [buildGallerySlot(el, ctx)];
    case "countdownBox":
      return buildCountdownBox(el);
    case "guestbookNav":
      return buildGuestbookNav(el);
    case "raw":
      return [{ ...el.object }];
    default: {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[templates] unknown element type — skipped:",
          (el as { type?: unknown })?.type,
        );
      }
      return [];
    }
  }
}

/**
 * Order elements for emission. Array order is the z-order Fabric uses; an
 * explicit `zIndex` overrides it, sorted stably so unnumbered elements keep
 * their relative positions.
 */
function orderElements(elements: TemplateElement[]): TemplateElement[] {
  if (!elements.some((el) => typeof el.zIndex === "number")) return elements;
  return elements
    .map((el, i) => ({ el, i, z: typeof el.zIndex === "number" ? el.zIndex : null }))
    .sort((a, b) => {
      if (a.z === null && b.z === null) return a.i - b.i;
      if (a.z === null) return -1;
      if (b.z === null) return 1;
      return a.z === b.z ? a.i - b.i : a.z - b.z;
    })
    .map((entry) => entry.el);
}

/**
 * Build one page into the Fabric canvas JSON the editor stores in `pages[]`.
 * `defaults` supply the page-level fallbacks the owning template provides.
 */
export function createPageJson(
  page: TemplatePage | TemplateBlock,
  ctx: AssetContext,
  defaults?: { background?: string; version?: string; width?: number; height?: number },
): FabricPageJson {
  const objects: FabricObject[] = [];
  for (const el of orderElements(page.elements ?? [])) {
    objects.push(...createElementJson(el, ctx));
  }
  const out: FabricPageJson = {
    version: defaults?.version ?? TEMPLATE_PAGE_VERSION,
    background: page.background ?? defaults?.background ?? "#ffffff",
    objects,
  };
  // An explicit backgroundImage wins — it is already a finished Fabric object.
  if (page.backgroundImage !== undefined) {
    out.backgroundImage = page.backgroundImage;
  } else if (page.backgroundAsset) {
    const bg = buildBackgroundImage(
      page.backgroundAsset,
      ctx,
      defaults?.width ?? TEMPLATE_ARTBOARD.width,
      defaults?.height ?? TEMPLATE_ARTBOARD.height,
    );
    if (bg) out.backgroundImage = bg;
  }
  return out;
}

/** Artboard the templates in this repo are authored against. Only a fallback:
 *  createPageJson prefers the owning template's own canvas size. */
const TEMPLATE_ARTBOARD = { width: 396, height: 704 } as const;

/**
 * Turn a template's `backgroundAsset` into the exact Fabric backgroundImage
 * shape CanvasEditor.setBackgroundImage produces, so the Background panel reads
 * it back as a normal picture background (fit/scale/offset all editable) rather
 * than as something it does not recognise.
 *
 * The geometry mirrors that function deliberately: centre origin at the page
 * centre, and a base scale from the chosen fit. `bgMeta` is what getBackground
 * reads to recover the panel-facing settings — the raw transform alone cannot
 * say which fit produced it.
 */
function buildBackgroundImage(
  bg: NonNullable<TemplatePage["backgroundAsset"]>,
  ctx: AssetContext,
  w: number,
  h: number,
): FabricObject | null {
  const src = bg.src
    ? bg.src
    : resolveElementSource(ctx, { type: "image", asset: bg.asset } as TemplateImageElement);
  if (!src) return null;

  const natW = bg.naturalWidth > 0 ? bg.naturalWidth : w;
  const natH = bg.naturalHeight > 0 ? bg.naturalHeight : h;
  const fit = bg.fit ?? "cover";
  let scaleX: number;
  let scaleY: number;
  if (fit === "stretch") {
    scaleX = w / natW;
    scaleY = h / natH;
  } else {
    const s = fit === "contain"
      ? Math.min(w / natW, h / natH)
      : Math.max(w / natW, h / natH);
    scaleX = s;
    scaleY = s;
  }

  const opacity = bg.opacity ?? 1;
  const out: FabricObject = { type: "image" };
  put(out, "src", src);
  put(out, "crossOrigin", crossOriginFor(src));
  put(out, "originX", "center");
  put(out, "originY", "center");
  put(out, "left", w / 2);
  put(out, "top", h / 2);
  put(out, "scaleX", scaleX);
  put(out, "scaleY", scaleY);
  put(out, "opacity", opacity);
  put(out, "bgMeta", {
    fit,
    tile: false,
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    opacity,
    flipX: false,
    flipY: false,
  });
  return out;
}
