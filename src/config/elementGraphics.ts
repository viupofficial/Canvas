// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN GRAPHICS for the Elements tab.
//
// The ornaments our own templates are built from — the bismillah headers, the
// rule lines, the wax seal — offered as loose pieces the user can drop onto any
// page. Nothing new is hosted for this: each entry points at a file a template
// already ships, and goes through the same resolver, so a local one stays a
// /public path and a royal one resolves to its url on the iFastNet host.
//
// The grouping is by LOOK, not by host: "Bismillah z&z.svg" is a file from the
// royal template but reads as a classic header, so that is where it sits.
//
// Resolution is deliberately done at render time (getElementGraphics()) rather
// than at module load: the remote manifest warms up asynchronously, and a value
// frozen at import would miss the exact spelling it publishes.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveTemplateAsset, type TemplateAssetContext } from "./templateAssetResolver";

/** The two ornament families shown in the Graphics section. */
export type ElementGraphicGroupName = "Classic" | "Royal";

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

type ElementGraphicDef = {
  /** Stable key — used for React keys only, never persisted. */
  id: string;
  label: string;
  /** The reference exactly as the host spells it; the resolver encodes it. */
  asset: string;
  source: TemplateAssetContext;
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
