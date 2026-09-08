/**
 * The editor's single phone/desktop boundary, in JS form.
 *
 * The CSS half lives in globals.css as `--breakpoint-pc`, which is what every
 * `pc:` utility compiles against. The two MUST stay in step: a `pc:`-hidden
 * control and a JS check that disagrees about the current layout is how the
 * phone gets desktop behaviour (or the reverse) at the seam.
 *
 * Desktop/laptop layout starts at PC_MIN_WIDTH_PX; anything narrower is the
 * phone layout (bottom tool rail, chrome-free full-bleed canvas).
 */
export const PC_MIN_WIDTH_PX = 769;

/** Matches exactly the widths where the editor renders its phone layout. */
export const PHONE_VIEWPORT_QUERY = `(max-width: ${PC_MIN_WIDTH_PX - 1}px)`;

/** True when the editor is currently in its phone layout. SSR-safe (false). */
export function isPhoneViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(PHONE_VIEWPORT_QUERY).matches
  );
}
