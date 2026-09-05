// ─────────────────────────────────────────────────────────────────────────────
// Template schema.
//
// A template DESCRIBES a design: which pages it has, what sits on each page and
// where. It deliberately holds no behaviour — the countdown ticker, the gallery
// slideshow, the guestbook cycler, the envelope lock and every RSVP / Money Gift
// / Calendar / Location feature stay in the editor and the published player,
// keyed off the functional markers (`name`, `countdownUnit`) that elements carry.
//
// Everything here compiles down to the SAME plain Fabric canvas JSON the editor
// has always stored, so saved projects, publishing and undo/redo are untouched:
//
//   TemplateDefinition ──(templateElementFactory)──▶ { version, background, objects[] }
//
// See src/config/templates.ts for the definitions themselves.
// ─────────────────────────────────────────────────────────────────────────────

import type { TemplateAssetProvider } from "./remoteTemplates";

export type { TemplateAssetProvider };

/** A Fabric canvas page exactly as the editor stores it in `pages[]`. */
export type FabricPageJson = {
  version?: string;
  background?: string;
  backgroundImage?: unknown;
  objects: Record<string, unknown>[];
};

/**
 * The editor's canvas backstore is fixed at this size (CANVAS_REF_WIDTH /
 * CANVAS_REF_HEIGHT in CanvasEditor.tsx) and the floating footer is laid out
 * against it. A template that declares anything else would draw off the
 * artboard, so validation warns about it rather than letting the design
 * silently shift. Kept here so template authors have one number to read.
 */
export const EDITOR_CANVAS_WIDTH = 396;
export const EDITOR_CANVAS_HEIGHT = 704;

/** Fabric JSON `version` stamped on every page the registry builds. */
export const TEMPLATE_PAGE_VERSION = "7.0.0";

// ── Elements ────────────────────────────────────────────────────────────────

export type OriginX = "left" | "center" | "right";
export type OriginY = "top" | "center" | "bottom";

/** Geometry, layering and interaction — shared by every element type. */
export type TemplateElementBase = {
  /**
   * Design-time identifier, unique within its page. Used by the dev validator
   * to report duplicates and to point at the offending element in a warning.
   * NOT emitted to Fabric — the editor mints its own runtime layer ids.
   */
  key?: string;
  /**
   * Fabric's `name`. This one IS emitted and IS functional: the editor and the
   * published player find elements by it (`envelope-head`, `galleryImage1`,
   * `guestMessage`, `prevBtn`, …). Round-tripped via FABRIC_EXPORT_PROPS.
   */
  name?: string;

  // Position. `x`/`y` are friendly aliases for Fabric's `left`/`top`; give one
  // or the other, not both (the validator flags it if you give both).
  x?: number;
  y?: number;
  left?: number;
  top?: number;

  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  /** Rotation in degrees — Fabric's `angle`. */
  angle?: number;
  opacity?: number;
  originX?: OriginX;
  originY?: OriginY;
  flipX?: boolean;
  flipY?: boolean;

  /**
   * Stacking order within the page. Elements are emitted in array order by
   * default (which is what Fabric treats as z-order); set this only when you
   * want to author out of order. Sorting is stable, so elements without a
   * zIndex keep their relative array position.
   */
  zIndex?: number;

  visible?: boolean;
  selectable?: boolean;
  evented?: boolean;
  /** The editor's own lock flag (FABRIC_EXPORT_PROPS), not Fabric's lockMovement*. */
  locked?: boolean;

  // Interactive props the editor already persists and the player already reads.
  linkUrl?: string;
  url?: string;
  action?: string;
  animationType?: string;
  animation?: string;
  targetPage?: number;

  /**
   * Override the Fabric `type` string the factory would emit. Only needed for
   * legacy fidelity (a few migrated objects were authored as "Textbox" with a
   * capital T); prefer the element `type` and let the factory decide.
   */
  fabricType?: string;

  /**
   * Escape hatch: extra Fabric properties copied onto the emitted object
   * verbatim, after everything above. Use it for anything the schema does not
   * model yet, rather than widening the schema for a one-off.
   */
  props?: Record<string, unknown>;
};

export type TemplateTextElement = TemplateElementBase & {
  type: "text";
  text: string;
  /** Which Fabric text class to emit. Defaults to a wrapping textbox. */
  variant?: "textbox" | "text" | "i-text";
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  fill?: string;
  lineHeight?: number;
  /** Fabric's letter spacing, in 1/1000 em. */
  charSpacing?: number;
  underline?: boolean;
  linethrough?: boolean;
  stroke?: string;
  strokeWidth?: number;
};

export type TemplateImageElement = TemplateElementBase & {
  type: "image";
  /**
   * Path RELATIVE to the template's baseAssetPath — "envelope.webp". Resolved
   * by resolveTemplateAsset(), so where the files are hosted can change in one
   * place. Use `src` instead for an absolute or root-relative URL.
   */
  asset?: string;
  /** Absolute URL, root-relative path or data: URL — used as-is. */
  src?: string;
  crossOrigin?: string;
};

export type TemplateShapeKind =
  | "rect"
  | "ellipse"
  | "circle"
  | "triangle"
  | "polygon"
  | "polyline"
  | "line"
  | "path";

export type TemplateShapeElement = TemplateElementBase & {
  type: "shape";
  shape: TemplateShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Rounded-rect corner radii. */
  rx?: number;
  ry?: number;
  /** Circle radius. */
  radius?: number;
  points?: { x: number; y: number }[];
  /** Line endpoints, [x1, y1, x2, y2]. */
  coords?: [number, number, number, number];
  /** SVG path data, for shape: "path". */
  path?: string;
  /**
   * Parametric polygon/star metadata the Inspector uses to rebuild `points`
   * when the user changes the point count or the star's inner ratio.
   */
  shapeKind?: "polygon" | "star";
  pointCount?: number;
  innerRatio?: number;
};

/**
 * One photo frame on the gallery page. Emits an image named `galleryImage{index}`
 * — the marker the Photos panel, the package photo counter and the slideshow all
 * detect the gallery by. Runtime sizing/layout stays with the editor.
 */
export type TemplateGallerySlotElement = TemplateElementBase & {
  type: "gallerySlot";
  /** 1-based; becomes `galleryImage{index}`. */
  index: number;
  asset?: string;
  src?: string;
};

/**
 * One Day / Hour / Minute / Second box of the "Counting Days" element. Expands
 * to three objects — the rounded backing rect, the label, and the value box
 * carrying `countdownUnit`, which is what the ticker rewrites every second in
 * both the editor and the published invitation.
 */
export type TemplateCountdownBoxElement = TemplateElementBase & {
  type: "countdownBox";
  /** Displayed label ("Day"). The emitted `countdownUnit` is its lowercase form. */
  label: string;
  /** Placeholder digits shown before the ticker takes over. */
  value?: string;
  /** Per-part overrides, for designs that need a different look. */
  box?: Partial<TemplateShapeElement>;
  labelStyle?: Partial<TemplateTextElement>;
  valueStyle?: Partial<TemplateTextElement>;
};

/**
 * A guestbook pager button. Expands to the rounded pill plus the arrow glyph —
 * Fabric textboxes cannot paint a rounded background, so it has always been two
 * objects. The names (`prevBtnBg` / `prevBtn`) are preserved for the player.
 */
export type TemplateGuestbookNavElement = TemplateElementBase & {
  type: "guestbookNav";
  direction: "prev" | "next";
  glyph?: string;
  box?: Partial<TemplateShapeElement>;
  glyphStyle?: Partial<TemplateTextElement>;
};

/**
 * Literal Fabric object JSON, passed through untouched. The last resort for
 * something the schema cannot express; anything used more than once should
 * become a real element type instead.
 */
export type TemplateRawElement = {
  type: "raw";
  key?: string;
  zIndex?: number;
  object: Record<string, unknown>;
};

export type TemplateElement =
  | TemplateTextElement
  | TemplateImageElement
  | TemplateShapeElement
  | TemplateGallerySlotElement
  | TemplateCountdownBoxElement
  | TemplateGuestbookNavElement
  | TemplateRawElement;

/** Every element type the factory knows how to build. */
export const TEMPLATE_ELEMENT_TYPES = [
  "text",
  "image",
  "shape",
  "gallerySlot",
  "countdownBox",
  "guestbookNav",
  "raw",
] as const;

export type TemplateElementType = (typeof TEMPLATE_ELEMENT_TYPES)[number];

// ── Pages ───────────────────────────────────────────────────────────────────

export type TemplatePage = {
  /** Unique within the template. */
  id: string;
  name?: string;
  /** Optional explicit ordering; pages are otherwise used in array order. */
  order?: number;
  /** Solid page background. Defaults to the template's canvas.background. */
  background?: string;
  /** Passed straight to Fabric's `backgroundImage` (with its bgMeta, if any). */
  backgroundImage?: unknown;
  elements: TemplateElement[];
};

/**
 * A reusable page — envelope, gallery, guestbook, countdown … A template lists
 * blocks by id instead of repeating their elements, and the editor pulls the
 * same blocks when the user adds a gallery page or drops a countdown onto the
 * canvas, so there is exactly one definition of each.
 */
export type TemplateBlock = Omit<TemplatePage, "order">;

export type TemplateBlockRef = {
  block: string;
  /** Override the page id (defaults to the block id). */
  id?: string;
  name?: string;
  background?: string;
  order?: number;
};

/** How a template lists a page: reuse a block, or spell the page out inline. */
export type TemplatePageRef = TemplateBlockRef | TemplatePage;

// ── Templates ───────────────────────────────────────────────────────────────

export type TemplateCanvasConfig = {
  width: number;
  height: number;
  /** Page background when a page does not set its own. */
  background?: string;
  /** Fabric JSON version stamped on each page. Defaults to TEMPLATE_PAGE_VERSION. */
  version?: string;
};

/**
 * Which footer features this design is built around. Purely descriptive: RSVP,
 * Money Gift, Calendar, Location, Contact and music are event-data driven
 * (EventDataContext → EventFooter) and are wired globally, not per template.
 * Recorded so a template can document its intent — nothing reads it to decide
 * behaviour, and adding a flag here does not switch a feature on.
 */
export type TemplateFeatureHints = {
  rsvp?: boolean;
  moneyGift?: boolean;
  calendar?: boolean;
  location?: boolean;
  contact?: boolean;
  music?: boolean;
  guestbook?: boolean;
  countdown?: boolean;
  gallery?: boolean;
};

export type TemplateDefinition = {
  /** Stable id. Referenced by the editor's applied-template state — never rename. */
  id: string;
  name: string;
  slug?: string;
  description?: string;
  /** Card image in the Templates panel. Resolved through the asset resolver. */
  thumbnail?: string;
  /** Larger preview image, for a future template gallery. Resolved the same way. */
  preview?: string;
  category?: string;
  version?: string;
  /**
   * Who hosts this template's media.
   *
   *   "local" (default)  files in Vercel's /public, addressed by baseAssetPath.
   *   "ifastnet"         files on vi-up.com, addressed by remoteTemplateId.
   *
   * Nothing else in the app branches on this — the resolver turns both into an
   * ordinary URL and Fabric cannot tell the difference. See
   * src/config/templateAssetResolver.ts.
   */
  assetProvider?: TemplateAssetProvider;
  /**
   * The template's numeric id on iFastNet. Required when assetProvider is
   * "ifastnet"; it is what addresses both the asset folder
   * (https://vi-up.com/uploads/templates/{id}/) and the manifest endpoint
   * (…/api/template-assets.php?template_id={id}). Unrelated to `id` above,
   * which is this registry's own stable key.
   */
  remoteTemplateId?: string | number;
  /**
   * Where this template's files live. Elements then reference them by bare
   * filename ("envelope.webp") and the resolver joins the two, so moving the
   * assets to another host is a one-line change here.
   *
   * For a remote template this is an OPTIONAL SUBFOLDER inside the template's
   * remote directory, not a full path — usually leave it unset.
   */
  baseAssetPath?: string;
  canvas: TemplateCanvasConfig;
  features?: TemplateFeatureHints;
  pages: TemplatePageRef[];
};

/** Metadata only — enough to draw a template card without building any page. */
export type TemplateSummary = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  thumbnail?: string;
  preview?: string;
  category?: string;
  pageCount: number;
  /** Where this template's media is hosted — the picker shows remote ones differently. */
  assetProvider: TemplateAssetProvider;
  /** Its id on iFastNet, when assetProvider is "ifastnet". */
  remoteTemplateId?: string | number;
};

export const isBlockRef = (page: TemplatePageRef): page is TemplateBlockRef =>
  typeof (page as { block?: unknown }).block === "string";
