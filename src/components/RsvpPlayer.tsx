"use client";

import { useEffect, useRef, useState } from "react";
import { collectFontFamilies, preloadFonts } from "@/src/lib/fonts";
import MusicPlayer from "@/src/components/MusicPlayer";
import { normalizePresentationMode, type PresentationMode } from "@/src/lib/presentationMode";

export type EnvPos = {
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  originX: "left" | "center" | "right";
  originY: "top" | "center" | "bottom";
};

// Custom element on the envelope page beyond the recognized parts (e.g. the
// couple's names) — extracted by extract-envelope.ts and rendered on the cover.
export type EnvelopeExtraItem = {
  kind: "text" | "image";
  text?: string;
  src?: string;
  pos?: EnvPos;
  style?: any;
};

export type EnvelopeData = {
  headSrc: string;
  sealSrc: string;
  bodySrc: string;
  logoSrc: string;
  bgColor: string;
  titleText: string;
  subtitleText: string;
  pressText: string;
  headPos?: EnvPos;
  sealPos?: EnvPos;
  bodyPos?: EnvPos;
  logoPos?: EnvPos;
  titlePos?: EnvPos;
  subtitlePos?: EnvPos;
  pressPos?: EnvPos;
  titleStyle?: any;
  subtitleStyle?: any;
  pressStyle?: any;
  extras?: EnvelopeExtraItem[];
};

const STAGE_W = 396;
const STAGE_H = 704;

// ── Continuous-scroll shared background ─────────────────────────────────────
// In scroll mode each page's background is lifted OFF its fabric canvas and
// painted by one shared DOM layer behind the whole scrolling column, so pages
// that carry the same picture share a single background whose transform is
// interpolated from the scroll position instead of being re-drawn per page.
//
// A background picture is described in stage (396×704) coordinates. The <img>
// is laid out once at its natural size and everything fabric encoded in
// left/top/scale/angle/flip is folded into ONE css transform — so moving from
// one page's background to the next animates a single GPU-accelerated property.
type BgImageBox = {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  // transform-origin, in unscaled image pixels (fabric's origin point).
  originX: number;
  originY: number;
  // Translation that lands the origin point where fabric put it.
  x: number;
  y: number;
  // Mirroring is folded in as a negative scale.
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
};

type PageBackground = { color: string | null; image: BgImageBox | null };

// A page's background moves to its own saved transform as soon as that page
// becomes active — never tied to raw scroll position. Kept just slow enough to
// read as a smooth glide rather than a snap, while still landing well before
// the guest has finished scrolling into the page.
const BG_TRANSFORM_MS = 880;
const BG_CROSSFADE_MS = 680;
const BG_IMAGE_TRANSITION =
  `transform ${BG_TRANSFORM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 600ms ease-out`;
const BG_COLOR_TRANSITION = `background-color ${BG_CROSSFADE_MS}ms ease-out`;
const BG_LAYER_TRANSITION = `opacity ${BG_CROSSFADE_MS}ms ease-out`;

/** Fabric's origin keyword → its fraction along that axis. */
const originFraction = (origin: string) =>
  origin === "center" ? 0.5 : origin === "right" || origin === "bottom" ? 1 : 0;

/**
 * Read a loaded page canvas' background as a shared-layer descriptor.
 *
 * Returns null when the page paints something the shared layer can't take over
 * safely — today that means a fabric Pattern / gradient on `backgroundColor`
 * (tiled backgrounds). Those keep rendering on their own canvas exactly as they
 * do in page mode; the shared layer simply holds its previous state behind them.
 */
function readSharedBackground(rc: any): PageBackground | null {
  const bgColor = rc.backgroundColor;
  // Pattern / gradient objects stay on the canvas — see above.
  if (bgColor && typeof bgColor === "object") return null;

  let image: BgImageBox | null = null;
  const bi = rc.backgroundImage as any;
  if (bi) {
    const el = bi.getElement?.() as HTMLImageElement | undefined;
    const src: string | null = bi.getSrc?.() ?? el?.src ?? null;
    const natW = (el?.naturalWidth || bi.width || 0) as number;
    const natH = (el?.naturalHeight || bi.height || 0) as number;
    if (src && natW > 0 && natH > 0) {
      // fabric places the image so that its origin point sits at (left, top) and
      // rotates/scales about that point — which maps exactly onto a CSS
      // transform-origin at the same point plus a translate.
      const originX = originFraction(String(bi.originX ?? "left")) * natW;
      const originY = originFraction(String(bi.originY ?? "top")) * natH;
      image = {
        src,
        naturalWidth: natW,
        naturalHeight: natH,
        originX,
        originY,
        x: (bi.left ?? 0) - originX,
        y: (bi.top ?? 0) - originY,
        scaleX: (bi.scaleX ?? 1) * (bi.flipX ? -1 : 1),
        scaleY: (bi.scaleY ?? 1) * (bi.flipY ? -1 : 1),
        angle: bi.angle ?? 0,
        opacity: bi.opacity ?? 1,
      };
    }
  }

  // No explicit colour behaves like the player's own canvas default (white),
  // which is what page mode shows for a page that never set one.
  const color = typeof bgColor === "string" && bgColor ? bgColor : "#ffffff";
  return { color, image };
}

function originOffset(pos: EnvPos | undefined) {
  const p = pos ?? { left: 0, top: 0, width: 0, height: 0, angle: 0, originX: "left" as const, originY: "top" as const };
  let dx = 0, dy = 0;
  if (p.originX === "center") dx = -p.width / 2;
  else if (p.originX === "right") dx = -p.width;
  if (p.originY === "center") dy = -p.height / 2;
  else if (p.originY === "bottom") dy = -p.height;
  return { x: p.left + dx, y: p.top + dy };
}

function posStyle(pos: EnvPos | undefined): React.CSSProperties {
  if (!pos || (pos.width === 0 && pos.height === 0)) return { display: "none" };
  const { x, y } = originOffset(pos);
  return {
    position: "absolute",
    left: x,
    top: y,
    width: pos.width,
    height: pos.height,
    // Tailwind preflight sets img { max-width: 100% }, which clamps parts wider
    // than the 396px stage (the head/body overflow it by design) and squashes
    // them out of alignment with the fabric-rendered editor canvas.
    maxWidth: "none",
    transform: pos.angle ? `rotate(${pos.angle}deg)` : undefined,
    transformOrigin: "top left",
  };
}

export type RsvpPlayerProps = {
  pages: any[];
  envelope: EnvelopeData | null;
  musicUrl: string | null;
  borderUrl: string | null;
  // The event date the "Counting Days" element ticks towards (the saved Calendar
  // date). Bare "YYYY-MM-DD" is treated as local midnight.
  eventDate?: string | null;
  // Wishes shown by the on-page "Guestbook" element. Falls back to a sample set.
  guestMessages?: { message: string; sender: string }[];
  // How the fixed 396×704 stage fits the viewport:
  //  - "fit"   (default): contain — never cropped, never enlarged past 1×. Used
  //            by the live invite so the design is always fully visible.
  //  - "cover": fill the whole frame edge-to-edge (scaled up, edges cropped).
  //            Used by the in-app preview so it looks full-bleed on a phone.
  fillMode?: "fit" | "cover";
  // "page" (default) keeps the page-by-page player; "scroll" stacks every page
  // vertically in one continuous scrolling container behind a shared, scroll-
  // interpolated background. See src/lib/presentationMode.ts.
  presentationMode?: PresentationMode;
};

// Shown by the on-page Guestbook element while the event has no wishes yet.
// Deliberately neutral — fake sample wishes (Ali/Siti/…) read as real entries
// to guests on a live invite.
const GUESTBOOK_EMPTY_TEXT = "No guestbook entries yet.";

export default function RsvpPlayer({
  pages,
  envelope,
  musicUrl,
  borderUrl,
  eventDate,
  guestMessages,
  fillMode = "fit",
  presentationMode,
}: RsvpPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isScroll = normalizePresentationMode(presentationMode) === "scroll";

  const [gone, setGone] = useState(!envelope);
  const [animating, setAnimating] = useState(false);
  // Audible playback can only begin after a user gesture. With an envelope we
  // wait for the seal click; without one we start right away.
  const [musicStarted, setMusicStarted] = useState(!envelope);

  // Page-by-page ("play mode") navigation state.
  const [current, setCurrent] = useState(0);
  const [scale, setScale] = useState(1);
  // Uniform scale for the full-screen envelope cover. The cover card lives in a
  // fixed 396×704 coordinate space; we shrink the *whole* card to fit the screen
  // so every element keeps its exact relative position (no per-element drift).
  const [coverScale, setCoverScale] = useState(1);
  const pagerRef = useRef<HTMLDivElement>(null);
  const wrappersRef = useRef<HTMLDivElement[]>([]);
  const currentRef = useRef(0);
  const goneRef = useRef(!envelope);

  // Per-page background transition: we keep each page's background on its own
  // canvas, but when navigating we animate the incoming page's background
  // transform from the page we left to its own resting values — so a background
  // that differs in scale/position appears to smoothly zoom/pan between pages.
  const pageCanvasesRef = useRef<any[]>([]);
  // Resting background transform of each page, captured after it loads.
  const bgHomeRef = useRef<Array<{ scaleX: number; scaleY: number; left: number; top: number; opacity: number; src: string | null } | null>>([]);
  const bgAnimRef = useRef<number | null>(null);
  const prevCurrentRef = useRef(0);

  // ── Continuous-scroll state (unused in page mode) ─────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const bgLayerARef = useRef<HTMLDivElement>(null);
  const bgLayerBRef = useRef<HTMLDivElement>(null);
  const bgColorARef = useRef<HTMLDivElement>(null);
  const bgColorBRef = useRef<HTMLDivElement>(null);
  const bgImgARef = useRef<HTMLImageElement>(null);
  const bgImgBRef = useRef<HTMLImageElement>(null);
  // Each page's background, lifted off its canvas and handed to the shared layer.
  const pageBgRef = useRef<Array<PageBackground | null>>([]);
  // Lets the async page loads nudge the scroll controller once a background
  // descriptor becomes available (canvases finish loading after the first paint).
  const requestBgSyncRef = useRef<(() => void) | null>(null);
  // Page nearest the viewport centre. A ref, not state: this updates on scroll
  // and must never re-render the player (and never touches editor selection).
  const activeScrollPageRef = useRef(0);

  // Keep refs in sync so the imperative (non-React) event handlers below read
  // the latest values without re-binding on every change.
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { goneRef.current = gone; }, [gone]);

  // The envelope cover is DOM text, and its page was extracted OUT of `pages`,
  // so the per-page canvas font preloading below never sees its families —
  // request them here or the cover renders in the fallback serif. Being DOM,
  // the spans re-render themselves automatically once each font arrives.
  useEffect(() => {
    if (!envelope) return;
    const families = new Set<string>();
    for (const s of [envelope.titleStyle, envelope.subtitleStyle, envelope.pressStyle]) {
      if (s?.fontFamily) families.add(String(s.fontFamily));
    }
    for (const ex of envelope.extras ?? []) {
      if (ex?.style?.fontFamily) families.add(String(ex.style.fontFamily));
    }
    if (families.size) preloadFonts([...families]);
  }, [envelope]);

  useEffect(() => {
    if (!envelope) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [envelope]);

  useEffect(() => {
    if (gone) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }, [gone]);

  function handleSealClick() {
    if (animating || gone) return;
    setAnimating(true);
    // The click is the user gesture that unlocks audible playback.
    setMusicStarted(true);
    setTimeout(() => {
      setTimeout(() => setGone(true), 500);
    }, 1000);
  }

  const goTo = (i: number) =>
    setCurrent(() => Math.max(0, Math.min(pages.length - 1, i)));

  // Fit one full page (396×704) into the available viewport, leaving room at the
  // bottom for the sticky footer nav bar.
  useEffect(() => {
    const FOOTER_RESERVE = 96;
    const PAD = 16;
    const calc = () => {
      if (fillMode === "cover") {
        // Fill the whole frame edge-to-edge (uniform scale, edges cropped by the
        // pager's overflow:hidden). The "cover" of the design over the viewport.
        const s = Math.max(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
        setScale(s);
        setCoverScale(s);
        return;
      }
      const availH = window.innerHeight - FOOTER_RESERVE - PAD;
      const availW = Math.min(window.innerWidth, 440) - PAD;
      setScale(Math.min(availW / STAGE_W, availH / STAGE_H, 1));
      // The envelope cover is full-bleed (no footer/pad to reserve): fit the whole
      // card into the raw viewport, never enlarging past its native size.
      setCoverScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H, 1));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [fillMode]);

  // Page change is an instant opacity switch: the active page goes to opacity 1,
  // the rest to 0. The canvas itself never scales, moves, or resizes — the design
  // stays visually stable, and a hard cut avoids the foreground appearing to morph.
  // The background, however, animates: the incoming page's background starts at
  // the background transform of the page we just left and eases to its own, so a
  // 100%→120% scale (or a position change) plays out as a smooth zoom/pan.
  useEffect(() => {
    // Continuous scroll has no "current page" to switch to — every page is laid
    // out at once and the background is driven by scroll position instead.
    if (isScroll) return;
    const prev = prevCurrentRef.current;
    prevCurrentRef.current = current;

    wrappersRef.current.forEach((w, i) => {
      if (!w) return;
      const active = i === current;
      w.style.opacity = active ? "1" : "0";
      w.style.zIndex = active ? "2" : "1";
    });

    if (bgAnimRef.current != null) {
      cancelAnimationFrame(bgAnimRef.current);
      bgAnimRef.current = null;
    }
    if (prev === current) return;

    const rc = pageCanvasesRef.current[current];
    const img = rc?.backgroundImage;
    const home = bgHomeRef.current[current];
    const from = bgHomeRef.current[prev];
    // Only tween when both pages carry the same background image — otherwise the
    // two transforms describe different pictures and morphing between them is
    // meaningless, so the page just shows its own resting background.
    if (!img || !home || !from || !from.src || from.src !== home.src) {
      if (img && home) {
        img.set({ scaleX: home.scaleX, scaleY: home.scaleY, left: home.left, top: home.top, opacity: home.opacity });
        img.setCoords?.();
        rc?.requestRenderAll();
      }
      return;
    }

    const DURATION = 600;
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    // Snap to the starting (previous-page) transform synchronously so the freshly
    // shown page doesn't flash its own resting background for one frame.
    img.set({ scaleX: from.scaleX, scaleY: from.scaleY, left: from.left, top: from.top, opacity: from.opacity });
    img.setCoords?.();
    rc.requestRenderAll();
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      const e = easeOut(p);
      img.set({
        scaleX: lerp(from.scaleX, home.scaleX, e),
        scaleY: lerp(from.scaleY, home.scaleY, e),
        left: lerp(from.left, home.left, e),
        top: lerp(from.top, home.top, e),
        opacity: lerp(from.opacity, home.opacity, e),
      });
      img.setCoords?.();
      rc.requestRenderAll();
      if (p < 1) bgAnimRef.current = requestAnimationFrame(step);
      else bgAnimRef.current = null;
    };
    bgAnimRef.current = requestAnimationFrame(step);

    return () => {
      if (bgAnimRef.current != null) {
        cancelAnimationFrame(bgAnimRef.current);
        bgAnimRef.current = null;
      }
    };
  }, [current, pages, isScroll]);

  // Swipe / scroll / keyboard navigation between pages. Page mode only — in
  // scroll mode the container scrolls natively and hijacking it would fight it.
  useEffect(() => {
    if (isScroll) return;
    const el = pagerRef.current;
    if (!el) return;

    const next = () => goTo(currentRef.current + 1);
    const prev = () => goTo(currentRef.current - 1);
    const blocked = () => !goneRef.current || pages.length <= 1;

    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      if (blocked()) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel < 600 || Math.abs(e.deltaY) < 15) return;
      lastWheel = now;
      e.deltaY > 0 ? next() : prev();
    };

    let startY = 0;
    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
    const onTouchEnd = (e: TouchEvent) => {
      if (blocked()) return;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dy) < 40) return;
      dy < 0 ? next() : prev();
    };

    const onKey = (e: KeyboardEvent) => {
      if (blocked()) return;
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); next(); }
      else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); prev(); }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [pages.length, isScroll]);

  useEffect(() => {
    if (!rootRef.current) return;
    if (typeof window === "undefined") return;

    const w = 396;
    const h = 704;
    const root = rootRef.current;
    const createdCanvases: any[] = [];
    const cancellers: Array<() => void> = [];
    let cancelled = false;

    // Animate objects on a view-only canvas based on their `animation` property.
    // Base values are captured once; one-shots ease to those targets, loops
    // oscillate around them. Mutating here is safe — the player never saves back.
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
    const ANIMS = new Set(["fade-in", "slide-up", "zoom-in", "float", "pulse"]);
    const startAnimations = (rc: any) => {
      const animated: Array<{ obj: any; type: string; top: number; opacity: number; scaleX: number; scaleY: number }> = [];
      rc.forEachObject((obj: any) => {
        const type = obj?.animation;
        if (!type || !ANIMS.has(type)) return;
        const base = {
          obj,
          type,
          top: obj.top ?? 0,
          opacity: obj.opacity ?? 1,
          scaleX: obj.scaleX ?? 1,
          scaleY: obj.scaleY ?? 1,
        };
        animated.push(base);
        // Seed the start state for one-shot intros so they don't flash at target.
        if (type === "fade-in") obj.set({ opacity: 0 });
        else if (type === "slide-up") obj.set({ opacity: 0, top: base.top + 24 });
        else if (type === "zoom-in") obj.set({ opacity: 0, scaleX: base.scaleX * 0.85, scaleY: base.scaleY * 0.85 });
        obj.setCoords?.();
      });
      if (!animated.length) return;

      const start = performance.now();
      let rafId = 0;
      const tick = (now: number) => {
        if (cancelled) return;
        const t = now - start;
        let active = false;
        for (const a of animated) {
          const obj = a.obj;
          switch (a.type) {
            case "fade-in": {
              const p = Math.min(t / 600, 1);
              obj.opacity = a.opacity * easeOut(p);
              if (p < 1) active = true;
              break;
            }
            case "slide-up": {
              const p = Math.min(t / 600, 1);
              const e = easeOut(p);
              obj.opacity = a.opacity * e;
              obj.top = a.top + 24 * (1 - e);
              if (p < 1) active = true;
              break;
            }
            case "zoom-in": {
              const p = Math.min(t / 500, 1);
              const e = easeOut(p);
              obj.opacity = a.opacity * e;
              const s = 0.85 + 0.15 * e;
              obj.scaleX = a.scaleX * s;
              obj.scaleY = a.scaleY * s;
              if (p < 1) active = true;
              break;
            }
            case "float": {
              const off = -8 * (0.5 - 0.5 * Math.cos((t / 3000) * Math.PI * 2));
              obj.top = a.top + off;
              active = true;
              break;
            }
            case "pulse": {
              const s = 1 + 0.05 * (0.5 - 0.5 * Math.cos((t / 1800) * Math.PI * 2));
              obj.scaleX = a.scaleX * s;
              obj.scaleY = a.scaleY * s;
              active = true;
              break;
            }
          }
          obj.setCoords?.();
        }
        rc.requestRenderAll();
        if (active) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      cancellers.push(() => cancelAnimationFrame(rafId));
    };

    // Gallery slideshow: the gallery page's photos all share one slot (named
    // galleryImage1, galleryImage2, …). Show one at a time, advancing every 5s,
    // looping through every photo. No-op on pages without a gallery.
    //
    // The guest can also swipe the photo sideways to flip through it by hand —
    // swipe right for the next photo, swipe left for the previous one — and the
    // 5s clock restarts so the photo they just picked gets a full turn.
    const startGallerySlideshow = (rc: any, wrapper: HTMLElement, index: number) => {
      const imgs = rc
        .getObjects()
        .filter((o: any) => typeof o?.name === "string" && o.name.startsWith("galleryImage"));
      if (!imgs.length) return;
      let gi = 0;
      const show = () => {
        imgs.forEach((o: any, n: number) => o.set({ visible: n === gi }));
        rc.requestRenderAll();
      };
      show();
      if (imgs.length < 2) return; // a single photo never needs to cycle
      let gid: ReturnType<typeof setInterval>;
      const startTimer = () => {
        gid = setInterval(() => {
          if (cancelled) return;
          gi = (gi + 1) % imgs.length;
          show();
        }, 5000);
      };
      startTimer();
      cancellers.push(() => clearInterval(gid));

      const step = (dir: number) => {
        gi = (gi + dir + imgs.length) % imgs.length;
        show();
        clearInterval(gid);
        startTimer();
      };

      // Hit area = the photo slot itself, in screen pixels. Recomputed per
      // gesture because the stage is CSS-scaled to the viewport and (in scroll
      // mode) travels with the scroller.
      const overPhoto = (clientX: number, clientY: number) => {
        // Page mode stacks every page in the same spot, so only the page the
        // guest is actually looking at may answer.
        if (!isScroll && currentRef.current !== index) return false;
        const box = wrapper.getBoundingClientRect();
        if (!box.width) return false;
        const s = box.width / w; // uniform: the stage never scales non-uniformly
        const b = imgs[gi].getBoundingRect();
        const x = clientX - box.left;
        const y = clientY - box.top;
        return (
          x >= b.left * s && x <= (b.left + b.width) * s &&
          y >= b.top * s && y <= (b.top + b.height) * s
        );
      };

      const SWIPE_MIN = 40;
      let x0 = 0;
      let y0 = 0;
      let tracking = false;

      const begin = (x: number, y: number) => {
        tracking = overPhoto(x, y);
        x0 = x;
        y0 = y;
      };
      const finish = (x: number, y: number, e: Event) => {
        if (!tracking) return;
        tracking = false;
        const dx = x - x0;
        const dy = y - y0;
        // Sideways only — a mostly-vertical drag still belongs to page
        // navigation (page mode) or to the scroller (scroll mode).
        if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;
        step(dx > 0 ? 1 : -1);
        // Consumed here. These listeners sit on the stage, below the pager that
        // handles page swipes, so stopping propagation keeps a diagonal flick
        // from also turning the page.
        e.stopPropagation();
      };

      const onTouchStart = (e: TouchEvent) => {
        const t = e.touches[0];
        if (t) begin(t.clientX, t.clientY);
      };
      const onTouchEnd = (e: TouchEvent) => {
        const t = e.changedTouches[0];
        if (t) finish(t.clientX, t.clientY, e);
      };
      const onMouseDown = (e: MouseEvent) => begin(e.clientX, e.clientY);
      const onMouseUp = (e: MouseEvent) => finish(e.clientX, e.clientY, e);

      root.addEventListener("touchstart", onTouchStart, { passive: true });
      root.addEventListener("touchend", onTouchEnd, { passive: true });
      root.addEventListener("mousedown", onMouseDown);
      root.addEventListener("mouseup", onMouseUp);
      cancellers.push(() => {
        root.removeEventListener("touchstart", onTouchStart);
        root.removeEventListener("touchend", onTouchEnd);
        root.removeEventListener("mousedown", onMouseDown);
        root.removeEventListener("mouseup", onMouseUp);
      });
    };

    // "Counting Days" countdown: rewrite each value box (tagged with
    // countdownUnit = day/hour/minute/second) every second towards eventDate.
    // No-op on pages without a countdown.
    const startCountdown = (rc: any) => {
      const boxes = rc
        .getObjects()
        .filter((o: any) => o?.type === "textbox" && typeof o?.countdownUnit === "string");
      if (!boxes.length) return;

      const target = (() => {
        if (!eventDate) return null;
        const d = /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
          ? new Date(`${eventDate}T00:00:00`)
          : new Date(eventDate);
        return isNaN(d.getTime()) ? null : d;
      })();

      const tick = () => {
        if (cancelled) return;
        let days = 0, hours = 0, minutes = 0, seconds = 0;
        if (target) {
          const diff = target.getTime() - Date.now();
          if (diff > 0) {
            days = Math.floor(diff / 86400000);
            hours = Math.floor((diff / 3600000) % 24);
            minutes = Math.floor((diff / 60000) % 60);
            seconds = Math.floor((diff / 1000) % 60);
          }
        }
        const byUnit: Record<string, number> = { day: days, hour: hours, minute: minutes, second: seconds };
        let touched = false;
        boxes.forEach((o: any) => {
          const next = String(byUnit[o.countdownUnit] ?? 0).padStart(2, "0");
          if (o.text !== next) { o.set("text", next); touched = true; }
        });
        if (touched) rc.requestRenderAll();
      };
      tick();
      const cid = setInterval(tick, 1000);
      cancellers.push(() => clearInterval(cid));
    };

    // Guestbook: cycle the wishes through the message/sender textboxes (tagged
    // name = guestMessage / guestSender) every 4s. No-op on pages without one.
    // With no real entries yet, show a neutral placeholder instead — it is
    // replaced automatically once entries arrive (the guestMessages prop change
    // rebuilds the canvases), so the template wording never shows alongside
    // real wishes.
    const startGuestbook = (rc: any): (() => void) | undefined => {
      const objs = rc.getObjects();
      const msgBox = objs.find((o: any) => o?.name === "guestMessage");
      const senderBox = objs.find((o: any) => o?.name === "guestSender");
      if (!msgBox && !senderBox) return;

      // Wishes are guest-written, so the message box's height changes with every
      // entry — a long one grows straight through whatever the design placed
      // around it (the "Guestbook" title above, the ← → buttons below). After
      // each swap we re-flow the pair inside the band those two reserve: the
      // message starts under the title, the sender follows it, and if the pair
      // still reaches the buttons the message shrinks until it clears them.
      const height = (o: any) => (o.height ?? 0) * (o.scaleY ?? 1);
      const originShift = (o: any) =>
        o.originY === "center" ? height(o) / 2 : o.originY === "bottom" ? height(o) : 0;
      const topOf = (o: any) => (o.top ?? 0) - originShift(o);
      const bottomOf = (o: any) => topOf(o) + height(o);
      const setTopOf = (o: any, y: number) => {
        o.set("top", y + originShift(o));
        o.setCoords?.();
      };

      // The element's own title — still the plain "Guestbook" textbox even after
      // the designer restyles or moves it. Only treated as a ceiling when it
      // actually sits above the message's resting place.
      const titleBox = objs.find(
        (o: any) =>
          o !== msgBox &&
          o !== senderBox &&
          typeof o?.text === "string" &&
          o.text.trim().toLowerCase() === "guestbook",
      );
      const buttons = objs.filter((o: any) => /^(prev|next)Btn(Bg)?$/.test(String(o?.name ?? "")));

      // Kept clear of the title above and of the buttons below.
      const TITLE_GAP = 12;
      const BUTTON_GAP = 16;
      const SENDER_GAP = 8;
      const MIN_FONT_SIZE = 9;

      // The design's own resting layout, captured while the boxes still hold the
      // template's placeholder text.
      const restingTop = msgBox ? topOf(msgBox) : 0;
      const senderRestingTop = senderBox ? topOf(senderBox) : 0;
      const restingBottom = senderBox ? bottomOf(senderBox) : msgBox ? bottomOf(msgBox) : 0;
      const baseFontSize = msgBox?.fontSize ?? 16;
      const buttonsTop = (() => {
        const tops = buttons.map(topOf).filter((y: number) => y > restingTop);
        return tops.length ? Math.min(...tops) : null;
      })();
      // Breathing room above the buttons — but never more than the design itself
      // leaves there, or a tight template (where the sender already sits just
      // above the arrows) would shrink every wish for no reason.
      const floor =
        buttonsTop == null
          ? Infinity
          : buttonsTop - Math.max(0, Math.min(BUTTON_GAP, buttonsTop - restingBottom));

      const relayout = () => {
        if (!msgBox) {
          senderBox?.setCoords?.();
          return;
        }
        // Re-measured every pass: the title's own height only settles once its
        // webfont has loaded.
        const ceiling = titleBox ? bottomOf(titleBox) + TITLE_GAP : -Infinity;
        const top = Math.max(restingTop, ceiling);

        // Lay the pair out at a given size and report where it ends.
        const flow = (size: number) => {
          if (msgBox.fontSize !== size) msgBox.set("fontSize", size);
          msgBox.initDimensions?.();
          setTopOf(msgBox, top);
          if (!senderBox) return bottomOf(msgBox);
          senderBox.initDimensions?.();
          setTopOf(senderBox, Math.max(senderRestingTop, bottomOf(msgBox) + SENDER_GAP));
          return bottomOf(senderBox);
        };

        let size = baseFontSize;
        let bottom = flow(size);
        while (bottom > floor && size > MIN_FONT_SIZE) {
          size -= 1;
          bottom = flow(size);
        }
      };

      const list = guestMessages && guestMessages.length ? guestMessages : null;
      if (!list) {
        msgBox?.set("text", GUESTBOOK_EMPTY_TEXT);
        senderBox?.set("text", "");
        relayout();
        rc.requestRenderAll();
        return relayout;
      }
      let i = 0;
      const show = () => {
        const entry = list[i];
        msgBox?.set("text", `“${entry.message}”`);
        senderBox?.set("text", `- ${entry.sender}`);
        relayout();
        rc.requestRenderAll();
      };
      show();
      if (list.length < 2) return relayout;
      const wid = setInterval(() => {
        if (cancelled) return;
        i = (i + 1) % list.length;
        show();
      }, 4000);
      cancellers.push(() => clearInterval(wid));
      return relayout;
    };

    // Scroll mode: a page's entrance animations should play when the guest
    // reaches it, not all at once on load. Pages finish loading asynchronously,
    // so a section may become visible before (seen) or after (pending) its
    // canvas is ready — handle both, and only ever run each page once.
    const pendingAnimations = new Map<Element, () => void>();
    const seenSections = new Set<Element>();
    const sectionObserver = isScroll
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const run = pendingAnimations.get(entry.target);
              if (run) {
                pendingAnimations.delete(entry.target);
                run();
              } else {
                seenSections.add(entry.target);
              }
              // One-shot: never restart from small scroll movements.
              sectionObserver?.unobserve(entry.target);
            }
          },
          { root: scrollRef.current, threshold: 0.2 },
        )
      : null;
    const armAnimations = (section: Element, run: () => void) => {
      if (!isScroll) { run(); return; }
      if (seenSections.has(section)) run();
      else pendingAnimations.set(section, run);
    };

    root.innerHTML = "";
    wrappersRef.current = [];
    pageCanvasesRef.current = [];
    bgHomeRef.current = [];
    pageBgRef.current = [];
    prevCurrentRef.current = 0;
    setCurrent(0);
    currentRef.current = 0;

    import("fabric").then((mod: any) => {
      if (cancelled) return;
      const fabric = mod.fabric ?? mod.default ?? mod;
      pages.forEach((pageData: any, index: number) => {
        const wrapper = document.createElement("div");
        if (isScroll) {
          // Continuous scroll: the same page wrappers, stacked vertically in
          // document order instead of layered on top of each other. Each stays a
          // separate section (own canvas, own elements, own animations) and they
          // butt up against each other exactly, so there are no seams or gaps.
          wrapper.style.cssText =
            `position:relative;width:${w}px;height:${h}px;line-height:0;` +
            `pointer-events:none;user-select:none;`;
        } else {
          // Every page is stacked in the same spot and stays there — the canvas
          // never moves or scales. The foreground switches instantly (no opacity
          // crossfade, so text/elements never appear to morph between pages); the
          // background is animated separately in the page-change effect, easing
          // from the previous page's transform to this page's own.
          wrapper.style.cssText =
            `position:absolute;top:0;left:0;width:${w}px;height:${h}px;line-height:0;` +
            `pointer-events:none;user-select:none;` +
            `opacity:${index === 0 ? 1 : 0};` +
            `z-index:${index === 0 ? 2 : 1};`;
        }
        wrapper.id = "page-" + index;
        wrappersRef.current[index] = wrapper;
        sectionObserver?.observe(wrapper);

        const canvasEl = document.createElement("canvas");
        canvasEl.id = "canvas-" + index;
        wrapper.appendChild(canvasEl);
        root.appendChild(wrapper);

        const rc = new fabric.Canvas(canvasEl, {
          selection: false,
          preserveObjectStacking: true,
          interactive: false,
          skipTargetFind: true,
        });
        rc.setDimensions({ width: w, height: h });
        rc.backgroundColor = "#ffffff";
        createdCanvases.push(rc);
        pageCanvasesRef.current[index] = rc;

        if (pageData) {
          // fabric v7: loadFromJSON(json, reviver) returns a Promise and the 2nd
          // arg is a per-object reviver, NOT a completion callback. We need to run
          // this once *after* the page (including its background image) has fully
          // loaded, so use the promise — otherwise rc.backgroundImage is still
          // unset and the background transition below never arms.
          rc.loadFromJSON(pageData).then(() => {
            if (cancelled) return;
            rc.discardActiveObject();
            // Capture this page's resting background transform so navigation can
            // animate the incoming background from the page we left to here.
            const bi = rc.backgroundImage as any;
            bgHomeRef.current[index] = bi
              ? {
                  scaleX: bi.scaleX ?? 1,
                  scaleY: bi.scaleY ?? 1,
                  left: bi.left ?? w / 2,
                  top: bi.top ?? h / 2,
                  opacity: bi.opacity ?? 1,
                  src: bi.getSrc?.() ?? bi._element?.src ?? null,
                }
              : null;
            // Scroll mode: hand this page's background to the shared layer and
            // clear it off the canvas, so the one shared background stays
            // visible through every page as the guest scrolls. Pages whose
            // background the shared layer can't take over (tiled patterns) keep
            // painting it themselves, exactly as in page mode.
            if (isScroll) {
              const shared = readSharedBackground(rc);
              pageBgRef.current[index] = shared;
              if (shared) {
                rc.backgroundImage = undefined;
                // Empty (not "#ffffff") so the canvas stays transparent and the
                // shared background shows through the page's own artwork.
                rc.backgroundColor = "";
              }
              requestBgSyncRef.current?.();
            }
            const toRemove: any[] = [];
            rc.forEachObject((obj: any) => {
              if (obj?.isBorder) {
                toRemove.push(obj);
                return;
              }
              if (borderUrl && obj?.type && String(obj.type).toLowerCase() === "image" && typeof obj.src === "string") {
                const path = obj.src.replace(/^https?:\/\/[^/]+/, "");
                if (path === borderUrl || obj.src === borderUrl) {
                  toRemove.push(obj);
                  return;
                }
              }
              obj.set({ selectable: false, hasControls: false, hasBorders: false, evented: false });
              obj.setCoords();
            });
            toRemove.forEach((o) => rc.remove(o));
            // Page mode runs these immediately (unchanged); scroll mode waits
            // until the page section actually scrolls into view.
            armAnimations(wrapper, () => startAnimations(rc));
            startGallerySlideshow(rc, wrapper, index);
            startCountdown(rc);
            const relayoutGuestbook = startGuestbook(rc);
            rc.requestRenderAll();
            // Webfonts used by this page may not be ready at first paint; load
            // them, then repaint so text renders with the correct family. A
            // plain repaint isn't enough: fabric caches per-character widths
            // measured with whatever font was active at first paint, so the
            // cache must be cleared and every text object re-measured or line
            // wrapping stays computed against the fallback serif.
            const families = collectFontFamilies(pageData);
            if (families.length) {
              const refreshText = (obj: any) => {
                const t = String(obj?.type ?? "").toLowerCase();
                if (t === "textbox" || t === "text" || t === "i-text") {
                  obj.initDimensions?.();
                  obj.setCoords?.();
                }
                (obj?._objects ?? []).forEach(refreshText);
              };
              const repaintWithFonts = () => {
                if (cancelled) return;
                for (const f of families) {
                  // v6/7 exposes cache.clearFontCache; v5 used util.clearFabricFontCache.
                  try { fabric.cache?.clearFontCache?.(f); } catch {}
                  try { fabric.util?.clearFabricFontCache?.(f); } catch {}
                }
                rc.forEachObject(refreshText);
                // The guestbook's spacing was computed against the fallback
                // serif; now that the real faces are measured, re-flow it so the
                // message still clears the title and the ← → buttons.
                relayoutGuestbook?.();
                rc.requestRenderAll();
              };
              preloadFonts(families).then(repaintWithFonts);
              // Safety net: some faces (e.g. weights we didn't explicitly ask
              // for) can land after preloadFonts resolves — repaint once more
              // when the document's font loading fully settles.
              (document as any).fonts?.ready?.then?.(repaintWithFonts);
            }
          });
        }
      });
    });

    return () => {
      cancelled = true;
      cancellers.forEach((c) => { try { c(); } catch {} });
      createdCanvases.forEach((c) => { try { c.dispose(); } catch {} });
      sectionObserver?.disconnect();
      pendingAnimations.clear();
      seenSections.clear();
      root.innerHTML = "";
      wrappersRef.current = [];
      pageCanvasesRef.current = [];
      pageBgRef.current = [];
    };
  }, [pages, borderUrl, eventDate, guestMessages, isScroll]);

  // ── Continuous scroll: shared background, driven by the ACTIVE PAGE ───────
  // The background does NOT follow raw scroll position. Each page owns a saved
  // background transform; while the guest scrolls within a page that transform
  // stays put, and the moment a different page becomes active the shared layer
  // animates to that page's values in one short, quick move.
  //
  //  - same picture on the new page → the SAME layer stays and only its css
  //    transform animates. Nothing is re-loaded, crossfaded, or duplicated;
  //  - different picture → a quick crossfade, with the new picture already at
  //    its own scale/position the instant it appears. The outgoing layer stays
  //    fully opaque underneath until it is covered, so nothing ever flashes.
  //
  // Active-page detection is an IntersectionObserver over the page sections
  // (root = the scroller, middle band), so nothing is recomputed per scroll
  // frame and the transform is written only when the index actually changes.
  useEffect(() => {
    if (!isScroll) return;
    const scroller = scrollRef.current;
    const layerA = bgLayerARef.current;
    const layerB = bgLayerBRef.current;
    const colorA = bgColorARef.current;
    const colorB = bgColorBRef.current;
    const imgA = bgImgARef.current;
    const imgB = bgImgBRef.current;
    if (!scroller || !layerA || !layerB || !colorA || !colorB || !imgA || !imgB) return;

    const layers = [layerA, layerB];
    const colorEls = [colorA, colorB];
    const imgEls = [imgA, imgB];

    // Guests who ask for less motion get the same background changes with no
    // animation at all — scrolling itself is untouched.
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reduceMotion = !!motionQuery?.matches;
    const applyTransitions = () => {
      for (let i = 0; i < 2; i++) {
        imgEls[i].style.transition = reduceMotion ? "none" : BG_IMAGE_TRANSITION;
        colorEls[i].style.transition = reduceMotion ? "none" : BG_COLOR_TRANSITION;
        layers[i].style.transition = reduceMotion ? "none" : BG_LAYER_TRANSITION;
      }
    };
    applyTransitions();

    const applyImage = (el: HTMLImageElement, box: BgImageBox | null) => {
      if (!box) {
        el.style.display = "none";
        delete el.dataset.src;
        return;
      }
      if (el.dataset.src !== box.src) {
        el.dataset.src = box.src;
        el.src = box.src;
      }
      el.style.display = "block";
      el.style.width = box.naturalWidth + "px";
      el.style.height = box.naturalHeight + "px";
      el.style.opacity = String(box.opacity);
      el.style.transformOrigin = box.originX + "px " + box.originY + "px";
      // One composited property carries position, scale and rotation, so the
      // page-to-page change is a single hardware-accelerated transition.
      el.style.transform =
        "translate3d(" + box.x + "px, " + box.y + "px, 0) " +
        "rotate(" + box.angle + "deg) " +
        "scale(" + box.scaleX + ", " + box.scaleY + ")";
    };

    const paint = (slot: number, bg: PageBackground) => {
      colorEls[slot].style.backgroundColor = bg.color ?? "transparent";
      applyImage(imgEls[slot], bg.image);
    };

    // Write to a layer without animating it there from wherever it happened to
    // be — an incoming picture must appear already at its own scale/position.
    const paintInstantly = (slot: number, bg: PageBackground) => {
      const imgTransition = imgEls[slot].style.transition;
      const colorTransition = colorEls[slot].style.transition;
      imgEls[slot].style.transition = "none";
      colorEls[slot].style.transition = "none";
      paint(slot, bg);
      layers[slot].getBoundingClientRect(); // flush before restoring transitions
      imgEls[slot].style.transition = imgTransition;
      colorEls[slot].style.transition = colorTransition;
    };

    let visibleSlot = 0;
    let painted = false;
    let retireTimer: ReturnType<typeof setTimeout> | null = null;

    const showBackground = (bg: PageBackground) => {
      if (retireTimer) { clearTimeout(retireTimer); retireTimer = null; }

      if (!painted) {
        // First paint of the invitation: seed the visible layer outright.
        painted = true;
        visibleSlot = 0;
        paintInstantly(0, bg);
        layers[0].style.zIndex = "1";
        layers[0].style.opacity = "1";
        layers[1].style.zIndex = "0";
        layers[1].style.opacity = "0";
        return;
      }

      const shownSrc = imgEls[visibleSlot].dataset.src ?? null;
      const nextSrc = bg.image?.src ?? null;
      if (nextSrc === shownSrc) {
        // Same picture (or both colour-only): keep this very layer and let its
        // css transition animate scale/position to the new page's values.
        paint(visibleSlot, bg);
        return;
      }

      // Different picture: bring it up on the other layer, already positioned,
      // and fade it in over the outgoing one.
      const nextSlot = visibleSlot === 0 ? 1 : 0;
      const outgoing = visibleSlot;
      layers[nextSlot].style.transition = "none";
      layers[nextSlot].style.opacity = "0";
      paintInstantly(nextSlot, bg);
      layers[nextSlot].style.zIndex = "1";
      layers[outgoing].style.zIndex = "0";
      // Commit opacity:0 before switching the transition back on, or the fade
      // would be skipped and the new picture would pop in.
      layers[nextSlot].getBoundingClientRect();
      layers[nextSlot].style.transition = reduceMotion ? "none" : BG_LAYER_TRANSITION;
      layers[nextSlot].style.opacity = "1";
      visibleSlot = nextSlot;
      // The outgoing layer is only retired once it is fully covered — dropping
      // it any earlier is what would show a blank frame mid-crossfade.
      retireTimer = setTimeout(() => {
        layers[outgoing].style.opacity = "0";
        retireTimer = null;
      }, reduceMotion ? 0 : BG_CROSSFADE_MS + 60);
    };

    let activeIndex = -1;
    const applyActive = (index: number) => {
      // Pages that paint their own (tiled) background have no descriptor; they
      // are opaque, so the shared layer just holds what it had behind them.
      const bg = pageBgRef.current[index];
      if (!bg) return;
      showBackground(bg);
    };

    const intersecting = new Set<number>();
    const observed = new Set<Element>();

    // Of the sections crossing the middle band, the active one is whichever sits
    // closest to the centre of the viewport. Runs only on observer callbacks
    // (never per scroll frame) and over at most a couple of elements.
    const pickActive = () => {
      if (!intersecting.size) return;
      const rootRect = scroller.getBoundingClientRect();
      const middle = rootRect.top + rootRect.height / 2;
      let best = -1;
      let bestDistance = Infinity;
      for (const index of intersecting) {
        const section = wrappersRef.current[index];
        if (!section) continue;
        const rect = section.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - middle);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      }
      // Fires only on a real change of page — equally in both scroll
      // directions — so small movements can't restart the animation.
      if (best < 0 || best === activeIndex) return;
      activeIndex = best;
      activeScrollPageRef.current = best;
      applyActive(best);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = wrappersRef.current.indexOf(entry.target as HTMLDivElement);
          if (index < 0) continue;
          if (entry.isIntersecting) intersecting.add(index);
          else intersecting.delete(index);
        }
        pickActive();
      },
      // A page becomes active once it covers the middle of the invitation.
      { root: scroller, rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );

    // Sections and their background descriptors both arrive asynchronously (the
    // page canvases load one by one), so the build effect calls this as each
    // page lands.
    const sync = () => {
      for (const section of wrappersRef.current) {
        if (section && !observed.has(section)) {
          observed.add(section);
          observer.observe(section);
        }
      }
      if (activeIndex < 0) {
        activeIndex = 0;
        activeScrollPageRef.current = 0;
      }
      // Re-apply in case THIS page is the active one and its descriptor only
      // just became available. Re-painting identical values is a no-op.
      applyActive(activeIndex);
    };
    requestBgSyncRef.current = sync;
    sync();

    const onMotionChange = () => {
      reduceMotion = !!motionQuery?.matches;
      applyTransitions();
    };
    motionQuery?.addEventListener?.("change", onMotionChange);

    return () => {
      if (retireTimer) clearTimeout(retireTimer);
      requestBgSyncRef.current = null;
      observer.disconnect();
      intersecting.clear();
      observed.clear();
      motionQuery?.removeEventListener?.("change", onMotionChange);
    };
  }, [isScroll, pages]);

  // The envelope must be opened before the guest can reach the rest of the
  // invitation — scrolling can't be allowed to bypass the opening animation.
  // `overflow: hidden` alone only stops *user* scrolling: the container can
  // still be moved programmatically (anchor jumps, focus, scrollIntoView), so
  // pin it back to the top until the envelope has been opened.
  useEffect(() => {
    if (!isScroll) return;
    const scroller = scrollRef.current;
    if (!scroller || gone) return;
    scroller.scrollTop = 0;
    const pinToTop = () => {
      if (scroller.scrollTop !== 0) scroller.scrollTop = 0;
    };
    scroller.addEventListener("scroll", pinToTop, { passive: true });
    return () => scroller.removeEventListener("scroll", pinToTop);
  }, [isScroll, gone]);

  return (
    <>
      {envelope && !gone && (
        <>
          <style>{`
            .env-cover {
              position: fixed; inset: 0; z-index: 9999;
              background-color: ${envelope.bgColor};
              overflow: hidden;
              display: flex; flex-direction: column;
              align-items: center; justify-content: center;
              transition: opacity 0.5s ease;
            }
            .env-cover.env-fading { opacity: 0; pointer-events: none; }
            .env-part { transition: transform 1s ease, opacity 1s ease; }
            /* Exit translate is card-relative (the card is 704px tall), not vh, so
               the open animation behaves identically at any cover scale. */
            .env-move-up   { transform: translateY(-820px) !important; opacity: 0 !important; }
            .env-move-down { transform: translateY(820px)  !important; opacity: 0 !important; }
          `}</style>

          <div className={`env-cover${animating ? " env-fading" : ""}`}>
            <div
              style={{
                position: "relative",
                width: STAGE_W,
                height: STAGE_H,
                // Scale the entire card as one unit so every absolutely-positioned
                // element keeps its exact relative position — no element-by-element
                // drift when the preview is smaller than the native 396×704 stage.
                transform: `scale(${coverScale})`,
                transformOrigin: "center",
                flexShrink: 0,
              }}
            >
              <span
                className={`env-part${animating ? " env-move-up" : ""}`}
                style={{
                  ...posStyle(envelope.titlePos),
                  zIndex: 5,
                  display: envelope.titlePos && envelope.titlePos.width > 0 ? "flex" : "none",
                  alignItems: "flex-start",
                  justifyContent: envelope.titleStyle?.textAlign === "center" ? "center" : envelope.titleStyle?.textAlign === "right" ? "flex-end" : "flex-start",
                  fontFamily: envelope.titleStyle?.fontFamily ?? "serif",
                  fontStyle: envelope.titleStyle?.fontStyle ?? "italic",
                  fontWeight: envelope.titleStyle?.fontWeight ?? "normal",
                  fontSize: envelope.titleStyle?.fontSize ?? 20,
                  color: envelope.titleStyle?.fill ?? "#2f2f2f",
                  lineHeight: envelope.titleStyle?.lineHeight ?? 1.16,
                }}
              >
                {envelope.titleText}
              </span>

              <span
                className={`env-part${animating ? " env-move-up" : ""}`}
                style={{
                  ...posStyle(envelope.subtitlePos),
                  zIndex: 5,
                  display: envelope.subtitlePos && envelope.subtitlePos.width > 0 ? "flex" : "none",
                  alignItems: "flex-start",
                  justifyContent: envelope.subtitleStyle?.textAlign === "center" ? "center" : envelope.subtitleStyle?.textAlign === "right" ? "flex-end" : "flex-start",
                  fontFamily: envelope.subtitleStyle?.fontFamily ?? "serif",
                  fontStyle: envelope.subtitleStyle?.fontStyle ?? "italic",
                  fontWeight: envelope.subtitleStyle?.fontWeight ?? "normal",
                  fontSize: envelope.subtitleStyle?.fontSize ?? 16,
                  color: envelope.subtitleStyle?.fill ?? "#2f2f2f",
                  lineHeight: envelope.subtitleStyle?.lineHeight ?? 1.16,
                }}
              >
                {envelope.subtitleText}
              </span>

              {envelope.logoSrc && envelope.logoPos && envelope.logoPos.width > 0 && (
                <img
                  className={`env-part${animating ? " env-move-up" : ""}`}
                  src={envelope.logoSrc}
                  alt="logo"
                  style={{ ...posStyle(envelope.logoPos), zIndex: 5 }}
                />
              )}

              {/* Custom elements the user placed on the envelope page (e.g. the
                  couple's names). Elements in the top half exit upward with the
                  head/seal, bottom-half ones exit downward with the body. */}
              {(envelope.extras ?? []).map((ex, i) => {
                if (!ex?.pos || ex.pos.width <= 0) return null;
                const { y } = originOffset(ex.pos);
                const exitCls =
                  y + ex.pos.height / 2 < STAGE_H / 2 ? " env-move-up" : " env-move-down";
                const cls = `env-part${animating ? exitCls : ""}`;
                if (ex.kind === "image" && ex.src) {
                  return (
                    <img
                      key={`extra-${i}`}
                      className={cls}
                      src={ex.src}
                      alt=""
                      style={{ ...posStyle(ex.pos), zIndex: 5, pointerEvents: "none" }}
                    />
                  );
                }
                if (ex.kind !== "text") return null;
                return (
                  <span
                    key={`extra-${i}`}
                    className={cls}
                    style={{
                      ...posStyle(ex.pos),
                      zIndex: 5,
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent:
                        ex.style?.textAlign === "center"
                          ? "center"
                          : ex.style?.textAlign === "right"
                          ? "flex-end"
                          : "flex-start",
                      fontFamily: ex.style?.fontFamily ?? "serif",
                      fontStyle: ex.style?.fontStyle ?? "normal",
                      fontWeight: ex.style?.fontWeight ?? "normal",
                      fontSize: ex.style?.fontSize ?? 20,
                      color: ex.style?.fill ?? "#2f2f2f",
                      lineHeight: ex.style?.lineHeight ?? 1.16,
                      textAlign: (ex.style?.textAlign as any) ?? "left",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {ex.text}
                  </span>
                );
              })}

              <span
                className={`env-part${animating ? " env-move-down" : ""}`}
                style={{
                  ...posStyle(envelope.pressPos),
                  zIndex: 5,
                  display: envelope.pressPos && envelope.pressPos.width > 0 ? "flex" : "none",
                  alignItems: "flex-start",
                  justifyContent: envelope.pressStyle?.textAlign === "center" ? "center" : envelope.pressStyle?.textAlign === "right" ? "flex-end" : "flex-start",
                  fontFamily: envelope.pressStyle?.fontFamily ?? "serif",
                  fontStyle: envelope.pressStyle?.fontStyle ?? "italic",
                  fontWeight: envelope.pressStyle?.fontWeight ?? "normal",
                  fontSize: envelope.pressStyle?.fontSize ?? 14,
                  color: envelope.pressStyle?.fill ?? "#555",
                  lineHeight: envelope.pressStyle?.lineHeight ?? 1.16,
                }}
              >
                {envelope.pressText}
              </span>

              <img
                className={`env-part${animating ? " env-move-up" : ""}`}
                src={envelope.headSrc}
                alt="envelope head"
                style={{ ...posStyle(envelope.headPos), zIndex: 3, pointerEvents: "none" }}
              />

              <img
                className={`env-part${animating ? " env-move-up" : ""}`}
                src={envelope.sealSrc}
                alt="seal"
                onClick={handleSealClick}
                style={{ ...posStyle(envelope.sealPos), zIndex: 4, cursor: "pointer" }}
              />

              <img
                className={`env-part${animating ? " env-move-down" : ""}`}
                src={envelope.bodySrc}
                alt="envelope body"
                style={{ ...posStyle(envelope.bodyPos), zIndex: 2, pointerEvents: "none" }}
              />
            </div>
          </div>
        </>
      )}

      {/* Flow spacer: gives <main> a full viewport of height so the sticky
          footer nav bar pins to the bottom over the fixed pager below. */}
      <div aria-hidden style={{ height: "100dvh", pointerEvents: "none" }} />

      {/* Paginated "play mode" stage — one page at a time. */}
      {!isScroll && (
        <div
          ref={pagerRef}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // "fit" reserves room for the sticky footer nav; "cover" fills edge-to-edge.
            paddingBottom: fillMode === "cover" ? 0 : 96,
            overflow: "hidden",
            touchAction: "none",
          }}
        >
          <div
            ref={rootRef}
            style={{
              width: STAGE_W,
              height: STAGE_H,
              position: "relative",
              overflow: "hidden",
              transform: `scale(${scale})`,
              transformOrigin: "center",
              flexShrink: 0,
            }}
          />
        </div>
      )}

      {isScroll && (
        <>
          {/* Shared background layer — pinned behind the scrolling pages and
              framed exactly like a single page-mode page, so the artwork keeps
              the scale and framing it was designed against. Page canvases are
              transparent in scroll mode, so this shows through all of them. */}
          <div
            aria-hidden
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: STAGE_W * scale,
                height: STAGE_H * scale,
                position: "relative",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {/* Inner box keeps the layers in stage (396×704) coordinates, so
                  the controller can write each page's saved transform verbatim. */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: STAGE_W,
                  height: STAGE_H,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                {[
                  { layer: bgLayerARef, color: bgColorARef, img: bgImgARef, opacity: 1 },
                  { layer: bgLayerBRef, color: bgColorBRef, img: bgImgBRef, opacity: 0 },
                ].map((slot, i) => (
                  <div
                    key={i}
                    ref={slot.layer}
                    style={{ position: "absolute", inset: 0, opacity: slot.opacity }}
                  >
                    {/* Each layer carries its own flat colour BEHIND its own
                        picture, so fading the layer in never lets the layer
                        below (or the bare page) flash through. */}
                    <div ref={slot.color} style={{ position: "absolute", inset: 0 }} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={slot.img}
                      alt=""
                      style={{ position: "absolute", display: "none", maxWidth: "none" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Continuous stage — every page stacked vertically, one scroller.
              Locked until the envelope is opened so the guest can't scroll past
              the opening animation. */}
          <div
            ref={scrollRef}
            // .scroll-invitation-container hides the scrollbar in every browser
            // without disabling scrolling — see globals.css.
            className="scroll-invitation-container"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1,
              overflowY: gone ? "auto" : "hidden",
              overscrollBehaviorY: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div
              style={{
                // Centre on desktop; on a viewport narrower than the scaled page
                // the sides crop (like page mode) rather than scrolling sideways.
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingBottom: fillMode === "cover" ? 0 : 96,
              }}
            >
              <div
                style={{
                  width: STAGE_W * scale,
                  height: STAGE_H * scale * Math.max(1, pages.length),
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <div
                  ref={rootRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: STAGE_W,
                    height: STAGE_H * Math.max(1, pages.length),
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {borderUrl && (
        <img
          src={borderUrl}
          alt=""
          aria-hidden
          style={{
            position: "fixed",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 396,
            maxWidth: "100%",
            height: "100vh",
            pointerEvents: "none",
            zIndex: /bordeline\.svg$/i.test(borderUrl) ? 110 : 10,
            objectFit: "fill",
          }}
        />
      )}

      {musicUrl && (
        // Background music only — no `visible`, so the browser's native media
        // bar never paints over the invitation. Playback is driven by
        // `musicStarted` (the envelope seal click, or immediately when there is
        // no envelope).
        <MusicPlayer url={musicUrl} start={musicStarted} />
      )}
    </>
  );
}
