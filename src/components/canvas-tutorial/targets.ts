// DOM targeting for the canvas walkthrough.
//
// The editor renders the desktop rail and the phone rail at the same time and
// hides one with CSS, so a `data-tutorial` selector legitimately matches more
// than one element. Everything here exists to answer one question safely:
// "which copies of this control can the user actually see right now?" — without
// nth-child, generated class names or deep DOM paths.

export type Rect = { top: number; left: number; width: number; height: number };

/**
 * Is this element genuinely rendered for the user?
 *
 * Rules out the CSS-hidden twin rail (`hidden pc:flex` → zero-size box) and the
 * collapsed phone-preview drawer (`w-0 overflow-hidden` ancestor, where the
 * button itself still reports a box).
 *
 * Deliberately NOT a viewport test: both rails are their own scrollers (the
 * desktop column scrolls vertically, the phone strip horizontally), so a
 * perfectly real control can start outside the viewport. Judging those as
 * hidden would both stall the launch gate and blank the spotlight — instead
 * they are scrolled into view before measuring (see scrollTargetsIntoView).
 */
export function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;

  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (Number(style.opacity) === 0) return false;

  // A collapsed ancestor clips everything inside it. `display: contents`
  // ancestors have no box of their own and must not be judged this way.
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const pStyle = window.getComputedStyle(parent);
    if (pStyle.display === "none") return false;
    if (pStyle.display !== "contents") {
      const pRect = parent.getBoundingClientRect();
      if (pRect.width < 2 || pRect.height < 2) return false;
    }
    parent = parent.parentElement;
  }

  return true;
}

/** Every visible element matching any of these selectors. */
export function resolveTargets(selectors: string[]): HTMLElement[] {
  if (typeof document === "undefined") return [];
  const found: HTMLElement[] = [];
  for (const selector of selectors) {
    let matches: NodeListOf<Element>;
    try {
      matches = document.querySelectorAll(selector);
    } catch {
      continue; // A malformed selector must never take the canvas down.
    }
    matches.forEach((el) => {
      if (el instanceof HTMLElement && isElementVisible(el)) found.push(el);
    });
  }
  return found;
}

/**
 * Bounding box covering all visible targets, in viewport coordinates, clamped
 * to the viewport and padded a little so the spotlight breathes. Returns null
 * when nothing is visible — the caller then shows a centred card rather than
 * pointing at empty space.
 */
export function unionRect(elements: HTMLElement[], padding = 6): Rect | null {
  if (elements.length === 0) return null;

  let top = Infinity;
  let left = Infinity;
  let bottom = -Infinity;
  let right = -Infinity;

  for (const el of elements) {
    const r = el.getBoundingClientRect();
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    bottom = Math.max(bottom, r.bottom);
    right = Math.max(right, r.right);
  }

  top = Math.max(0, top - padding);
  left = Math.max(0, left - padding);
  bottom = Math.min(window.innerHeight, bottom + padding);
  right = Math.min(window.innerWidth, right + padding);

  if (bottom - top < 2 || right - left < 2) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Wait until at least one target of every listed selector group is on screen.
 *
 * This is the "is it safe to show the overlay yet?" gate: the editor mounts
 * asynchronously (Fabric init, design load), and a tooltip must never point at
 * a control that hasn't rendered. Resolves false on timeout, in which case the
 * tutorial simply does not open — the canvas is untouched either way.
 */
export function waitForTargets(
  selectorGroups: string[][],
  { timeoutMs = 15000, intervalMs = 200 }: { timeoutMs?: number; intervalMs?: number } = {},
): { promise: Promise<boolean>; cancel: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const stop = () => {
    if (timer) clearInterval(timer);
    if (deadline) clearTimeout(deadline);
    timer = null;
    deadline = null;
  };

  const promise = new Promise<boolean>((resolve) => {
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      stop();
      resolve(value);
    };

    const check = () => selectorGroups.every((group) => resolveTargets(group).length > 0);

    if (check()) return settle(true);
    timer = setInterval(() => {
      if (check()) settle(true);
    }, intervalMs);
    deadline = setTimeout(() => settle(false), timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      settled = true;
      stop();
    },
  };
}

/**
 * Bring a step's targets into view inside their own scroller (the desktop rail
 * scrolls vertically, the phone rail horizontally). `block/inline: "nearest"`
 * keeps the movement minimal and never scrolls the canvas itself.
 *
 * The LAST target is scrolled first and the first one second, so a multi-control
 * step (RSVP + Money Gift at the end of the rail) ends up showing the whole
 * group rather than just its first item — with the first item always winning if
 * the group is taller/wider than the scroller.
 *
 * `behavior: "instant"` — NOT "auto". The phone rail carries Tailwind's
 * `scroll-smooth` (`scroll-behavior: smooth`), and "auto" defers to that CSS
 * property, so the scroller animates and the spotlight gets measured mid-flight
 * (it lands on the wrong rail items). "instant" overrides the CSS and moves the
 * scroller synchronously, before the measurement.
 */
export function scrollTargetsIntoView(elements: HTMLElement[]) {
  if (elements.length === 0) return;
  const order = [elements[elements.length - 1], elements[0]];
  for (const el of order) {
    try {
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    } catch {
      /* older engines — the highlight still lands, just without the nudge */
    }
  }
}
