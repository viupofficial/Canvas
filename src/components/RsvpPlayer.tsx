"use client";

import { useEffect, useRef, useState } from "react";
import { collectFontFamilies, preloadFonts } from "@/src/lib/fonts";
import MusicPlayer from "@/src/components/MusicPlayer";

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
};

// Shown by the on-page Guestbook element while the event has no wishes yet.
// Deliberately neutral — fake sample wishes (Ali/Siti/…) read as real entries
// to guests on a live invite.
const GUESTBOOK_EMPTY_TEXT = "No guestbook entries yet.";

export default function RsvpPlayer({ pages, envelope, musicUrl, borderUrl, eventDate, guestMessages, fillMode = "fit" }: RsvpPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

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
  }, [current, pages]);

  // Swipe / scroll / keyboard navigation between pages.
  useEffect(() => {
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
  }, [pages.length]);

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
    const startGallerySlideshow = (rc: any) => {
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
      const gid = setInterval(() => {
        if (cancelled) return;
        gi = (gi + 1) % imgs.length;
        show();
      }, 5000);
      cancellers.push(() => clearInterval(gid));
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
    const startGuestbook = (rc: any) => {
      const objs = rc.getObjects();
      const msgBox = objs.find((o: any) => o?.name === "guestMessage");
      const senderBox = objs.find((o: any) => o?.name === "guestSender");
      if (!msgBox && !senderBox) return;
      const list = guestMessages && guestMessages.length ? guestMessages : null;
      if (!list) {
        msgBox?.set("text", GUESTBOOK_EMPTY_TEXT);
        senderBox?.set("text", "");
        rc.requestRenderAll();
        return;
      }
      let i = 0;
      const show = () => {
        const entry = list[i];
        msgBox?.set("text", `“${entry.message}”`);
        senderBox?.set("text", `- ${entry.sender}`);
        rc.requestRenderAll();
      };
      show();
      if (list.length < 2) return;
      const wid = setInterval(() => {
        if (cancelled) return;
        i = (i + 1) % list.length;
        show();
      }, 4000);
      cancellers.push(() => clearInterval(wid));
    };

    root.innerHTML = "";
    wrappersRef.current = [];
    pageCanvasesRef.current = [];
    bgHomeRef.current = [];
    prevCurrentRef.current = 0;
    setCurrent(0);
    currentRef.current = 0;

    import("fabric").then((mod: any) => {
      if (cancelled) return;
      const fabric = mod.fabric ?? mod.default ?? mod;
      pages.forEach((pageData: any, index: number) => {
        const wrapper = document.createElement("div");
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
        wrapper.id = "page-" + index;
        wrappersRef.current[index] = wrapper;

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
            startAnimations(rc);
            startGallerySlideshow(rc);
            startCountdown(rc);
            startGuestbook(rc);
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
      root.innerHTML = "";
      wrappersRef.current = [];
    };
  }, [pages, borderUrl, eventDate, guestMessages]);

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
        <MusicPlayer
          url={musicUrl}
          start={musicStarted}
          visible
          style={{ position: "fixed", left: 12, bottom: 80, zIndex: 10 }}
        />
      )}
    </>
  );
}
