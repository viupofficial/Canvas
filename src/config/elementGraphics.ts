// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN GRAPHICS for the Elements tab.
//
// The ornaments our own templates are built from — the bismillah headers, the
// rule lines, the wax seals, the date plates, the floral border — offered as
// loose pieces the user can drop onto any page. Nothing new is hosted for this:
// each entry points at a file a template already ships, and goes through the
// same resolver, so a local one stays a /public path and a remote one resolves
// to its url on the iFastNet host.
//
// The grouping is by LOOK, not by host: "Bismillah z&z.svg" is a file from the
// royal template but reads as a classic header, so that is where it sits.
//
// ── WHAT DOES *NOT* BELONG HERE ─────────────────────────────────────────────
// A loose graphic can be dropped anywhere and scaled up, so two kinds of
// template file are deliberately left out however pretty they look:
//
//   1. Artwork carrying somebody else's names. The ivory seal shared by Ivory
//      Decree / Sepia Paper / Pureline has "Maya & Asyraaf" under its monogram,
//      and Text-Logo/DA_initials.svg reads "Diana & Adrian"; both are illegible
//      at template size but plain once enlarged. Same for TEFI.png and z&z.png.
//      Crimson Velvet's seal is stamped "B&G", which is why that is the one
//      offered below.
//   2. SVGs whose root tag declares only a viewBox (B&G.svg, Bordeline.svg,
//      bismillah.svg, ornament border1.svg). They render as a stretched
//      top-left crop — see the SVG note in src/config/templates.ts.
//
// Full-page textures (PAPER.png, the HD_* sheets) are Background-tab material,
// not ornaments, so they are left out too.
//
// The date plates are not here either, for a happier reason: Text-Logo/date.svg
// and date.png both have the date burnt into the artwork, so as a flat picture
// they could not be corrected. The Elements panel offers a "Date Plate" built
// from real textboxes instead — see the datePlate block in
// src/config/templates.ts.
//
// Resolution is deliberately done at render time (getElementGraphics()) rather
// than at module load: the remote manifest warms up asynchronously, and a value
// frozen at import would miss the exact spelling it publishes.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveTemplateAsset, type TemplateAssetContext } from "./templateAssetResolver";

/** The ornament families shown in the Graphics section. */
export type ElementGraphicGroupName = "Classic" | "Royal" | "Floral" | "Backgrounds";

/** Assets sitting at the /public root, like the Full Invitation template's. */
const CLASSIC_SOURCE: TemplateAssetContext = "/";

/**
 * The Tunku Ismail x Farah Elise media folder on vi-up.com. Spelled here rather
 * than imported from `templates` so the Elements panel does not pull the whole
 * template registry in; it must stay in step with that template's
 * assetProvider/remoteTemplateId.
 */
const ROYAL_SOURCE: TemplateAssetContext = {
  assetProvider: "ifastnet",
  remoteTemplateId: 11,
};

/** The Crimson Velvet media folder — same caveat as ROYAL_SOURCE above. */
const VELVET_SOURCE: TemplateAssetContext = {
  assetProvider: "ifastnet",
  remoteTemplateId: 2,
};

/** The Pureline media folder — same caveat as ROYAL_SOURCE above. */
const PURELINE_SOURCE: TemplateAssetContext = {
  assetProvider: "ifastnet",
  remoteTemplateId: 8,
};

/** The Ivory Decree media folder — same caveat as ROYAL_SOURCE above. */
const IVORY_SOURCE: TemplateAssetContext = {
  assetProvider: "ifastnet",
  remoteTemplateId: 1,
};

/** The Sepia Paper media folder — same caveat as ROYAL_SOURCE above. */
const SEPIA_SOURCE: TemplateAssetContext = {
  assetProvider: "ifastnet",
  remoteTemplateId: 7,
};

type ElementGraphicDef = {
  /** Stable key — used for React keys only, never persisted. */
  id: string;
  label: string;
  /** The reference exactly as the host spells it; the resolver encodes it. */
  asset: string;
  source: TemplateAssetContext;
  /**
   * Whole-page sheet: place it scaled to COVER the artboard and send it to the
   * back, rather than shrunk to fit like an ornament. It stays selectable, so
   * one dropped by mistake can still be moved or deleted.
   */
  cover?: boolean;
};

export type ElementGraphic = Omit<ElementGraphicDef, "source"> & { url: string };

export type ElementGraphicGroup = {
  name: ElementGraphicGroupName;
  graphics: ElementGraphic[];
};

const GRAPHIC_GROUPS: { name: ElementGraphicGroupName; items: ElementGraphicDef[] }[] = [
  {
    name: "Classic",
    items: [
      { id: "classic-bismillah", label: "Bismillah", asset: "bismillah.png", source: CLASSIC_SOURCE },
      { id: "classic-bismillah-crest", label: "Bismillah Crest", asset: "Bismillah z&z.svg", source: ROYAL_SOURCE },
    ],
  },
  {
    name: "Royal",
    items: [
      { id: "royal-line-1", label: "Divider I", asset: "line1.png", source: ROYAL_SOURCE },
      { id: "royal-line-2", label: "Divider II", asset: "line2.png", source: ROYAL_SOURCE },
      {
        id: "royal-seal",
        label: "Wax Seal",
        asset: "Envelope Intro (2)/Envelope Intro/seal.png",
        source: ROYAL_SOURCE,
      },
      // Crimson Velvet's seal: 1254px square, gold, stamped "B&G" — the only one
      // of the three template seals that carries no particular couple's mark.
      {
        id: "royal-seal-gold",
        label: "Gold Wax Seal",
        asset: "Envelope Intro (2)/Envelope Intro/seal.png",
        source: VELVET_SOURCE,
      },
    ],
  },
  {
    // Whole-page sheets. The templates place these as full-bleed page images
    // (see idFullBleed / spFullBleed in src/config/templates.ts), which is
    // exactly what `cover` reproduces — so dropping one here gives the same
    // result the designs get, without a Vercel copy of the file.
    name: "Backgrounds",
    items: [
      // All three are authored on the same 1080x1920 frame as the artboard.
      { id: "bg-ivory-damask", label: "Ivory Damask", asset: "HD_Vintage Floral.png", source: IVORY_SOURCE, cover: true },
      { id: "bg-sepia-kraft", label: "Sepia Kraft", asset: "HD_Classic Paper.png", source: SEPIA_SOURCE, cover: true },
      { id: "bg-crimson-velvet", label: "Crimson Velvet", asset: "Crimson Velvet.png", source: VELVET_SOURCE, cover: true },
      // 3530x2209 and landscape, so covering a portrait page crops its sides —
      // which is what the templates do with it too.
      { id: "bg-paper-sheet", label: "Paper Sheet", asset: "PAPER.png", source: PURELINE_SOURCE, cover: true },
    ],
  },
  {
    name: "Floral",
    items: [
      // Watercolour border, 1080x1920 — a whole-page frame rather than a small
      // ornament. placedImageScale() shrinks it to fit the artboard on drop.
      { id: "floral-frame", label: "Floral Frame", asset: "Border Flower/7.png", source: PURELINE_SOURCE },
    ],
  },
];

/**
 * The library with every asset resolved to a url the browser can load. Entries
 * that resolve to nothing are dropped rather than rendered as a broken tile.
 */
export function getElementGraphics(): ElementGraphicGroup[] {
  return GRAPHIC_GROUPS.map(({ name, items }) => ({
    name,
    graphics: items
      .map(({ source, ...rest }) => ({ ...rest, url: resolveTemplateAsset(source, rest.asset) }))
      .filter((g) => g.url !== ""),
  })).filter((group) => group.graphics.length > 0);
}
