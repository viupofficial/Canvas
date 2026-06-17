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
};

const DEFAULT_GUEST_MESSAGES = [
  { message: "Semoga bahagia hingga ke syurga ❤️", sender: "Ali" },
  { message: "Congrats! Stay strong together 💍", sender: "Siti" },
  { message: "Love you guys!! 🎉", sender: "Aiman" },
];

export default function RsvpPlayer({ pages, envelope, musicUrl, borderUrl, eventDate, guestMessages }: RsvpPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const [gone, setGone] = useState(!envelope);
  const [animating, setAnimating] = useState(false);
  // Audible playback can only begin after a user gesture. With an envelope we
  // wait for the seal click; without one we start right away.
  const [musicStarted, setMusicStarted] = useState(!envelope);

  // Page-by-page ("play mode") navigation state.
  const [current, setCurrent] = useState(0);
  const [scale, setScale] = useState(1);
  const pagerRef = useRef<HTMLDivElement>(null);
  const wrappersRef = useRef<HTMLDivElement[]>([]);
  const currentRef = useRef(0);
  const goneRef = useRef(!envelope);

  // Keep refs in sync so the imperative (non-React) event handlers below read
  // the latest values without re-binding on every change.
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { goneRef.current = gone; }, [gone]);

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
      const availH = window.innerHeight - FOOTER_RESERVE - PAD;
      const availW = Math.min(window.innerWidth, 440) - PAD;
      setScale(Math.min(availW / STAGE_W, availH / STAGE_H, 1));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // Slide the active page into view; neighbours sit just off-stage so the
  // transition animates the page element (not the canvas drawing) on change.
  useEffect(() => {
    wrappersRef.current.forEach((w, i) => {
      if (!w) return;
      const offset = i - current;
      w.style.transform = `translateY(${offset * 100}%)`;
      w.style.opacity = Math.abs(offset) <= 1 ? "1" : "0";
      w.style.zIndex = offset === 0 ? "2" : "1";
    });
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
    const startGuestbook = (rc: any) => {
      const objs = rc.getObjects();
      const msgBox = objs.find((o: any) => o?.name === "guestMessage");
      const senderBox = objs.find((o: any) => o?.name === "guestSender");
      if (!msgBox && !senderBox) return;
      const list = (guestMessages && guestMessages.length ? guestMessages : DEFAULT_GUEST_MESSAGES);
      if (!list.length) return;
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
    setCurrent(0);
    currentRef.current = 0;

    import("fabric").then((mod: any) => {
      if (cancelled) return;
      const fabric = mod.fabric ?? mod.default ?? mod;
      pages.forEach((pageData: any, index: number) => {
        const wrapper = document.createElement("div");
        // Each page is a full-stage slide stacked vertically; only the active
        // one sits at translateY(0). Transition animates page-to-page changes.
        wrapper.style.cssText =
          `position:absolute;top:0;left:0;width:${w}px;height:${h}px;line-height:0;` +
          `pointer-events:none;user-select:none;will-change:transform,opacity;` +
          `transition:transform 0.55s cubic-bezier(0.22,1,0.36,1),opacity 0.4s ease;` +
          `transform:translateY(${index * 100}%);opacity:${index <= 1 ? 1 : 0};` +
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

        if (pageData) {
          rc.loadFromJSON(pageData, () => {
            rc.discardActiveObject();
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
            // them, then repaint so text renders with the correct family.
            const families = collectFontFamilies(pageData);
            if (families.length) {
              preloadFonts(families).then(() => {
                if (!cancelled) rc.requestRenderAll();
              });
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
            .env-move-up   { transform: translateY(-110vh) !important; opacity: 0 !important; }
            .env-move-down { transform: translateY(110vh)  !important; opacity: 0 !important; }

            .env-head {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              height: auto !important;
              transform-origin: left top;
              z-index: 3;
              pointer-events: none;
            }

            .env-seal {
              position: absolute !important;
              left: 140px !important;
              top: 280px !important;
              width: 100px !important;
              height: 100px !important;
              transform-origin: left top;
              z-index: 4;
              cursor: pointer;
            }

            .env-body {
              position: absolute !important;
              left: 0 !important;
              bottom: -130px !important;
              width: 110% !important;
              height: 150% !important;
              transform-origin: left bottom;
              z-index: 2;
              pointer-events: none;
            }

            .env-press {
              left: 163.608px !important;
              top: 400px !important;
              width: 52.7832px !important;
              height: 93.79px !important;
            }
            @media (max-width: 375px) {
              .env-press {
                top: 380px !important;
              }
            }
          `}</style>

          <div className={`env-cover${animating ? " env-fading" : ""}`}>
            <div
              style={{
                position: "relative",
                width: STAGE_W,
                height: STAGE_H,
                maxWidth: "100%",
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

              <span
                className={`env-part env-press${animating ? " env-move-down" : ""}`}
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
                className={`env-part env-head${animating ? " env-move-up" : ""}`}
                src={envelope.headSrc}
                alt="envelope head"
              />

              <img
                className={`env-part env-seal${animating ? " env-move-up" : ""}`}
                src={envelope.sealSrc}
                alt="seal"
                onClick={handleSealClick}
              />

              <img
                className={`env-part env-body${animating ? " env-move-down" : ""}`}
                src={envelope.bodySrc}
                alt="envelope body"
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
          paddingBottom: 96,
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

        {/* Page indicator dots */}
        {pages.length > 1 && (
          <div
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              zIndex: 5,
            }}
          >
            {pages.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to page ${i + 1}`}
                onClick={() => goTo(i)}
                style={{
                  width: 8,
                  height: 8,
                  padding: 0,
                  border: "none",
                  borderRadius: "50%",
                  cursor: "pointer",
                  background:
                    i === current ? "rgba(60,60,60,0.9)" : "rgba(60,60,60,0.25)",
                  transform: i === current ? "scale(1.35)" : "scale(1)",
                  transition: "transform 0.25s ease, background 0.25s ease",
                }}
              />
            ))}
          </div>
        )}
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
