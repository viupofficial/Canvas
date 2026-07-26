/**
 * How the invitation is *presented* to a guest — the one place this is decided,
 * shared by the editor (Inspector → Artboard toggle), the local preview
 * (/preview-local), the published page (/e/[slug]) and the published payload
 * written by exportHTML.
 *
 *  - "page"   : the existing page-by-page player — one page at a time, swipe /
 *               wheel / keyboard navigation, animated background between pages.
 *  - "scroll" : "Continuous Scroll" — every page stacked vertically in one
 *               scrolling container, with a single shared background layer that
 *               interpolates between the pages' saved background transforms as
 *               the guest scrolls.
 *
 * This only ever changes *presentation*. The invitation keeps its page-by-page
 * structure everywhere else, and the editor canvas stays strictly page-based.
 */
export type PresentationMode = "page" | "scroll";

/** Invitations saved before this setting existed must keep behaving exactly as
 *  they do today, so anything unrecognised (including `undefined`) is "page". */
export const DEFAULT_PRESENTATION_MODE: PresentationMode = "page";

export function normalizePresentationMode(value: unknown): PresentationMode {
  return value === "scroll" ? "scroll" : DEFAULT_PRESENTATION_MODE;
}

export function isContinuousScroll(value: unknown): boolean {
  return normalizePresentationMode(value) === "scroll";
}
