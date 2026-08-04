"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * Swipeable gallery used by every surface that shows Money Gift (editor canvas
 * footer, local preview, published page, live preview panel). One slide per
 * saved account — bank, account number and that account's QR travel together,
 * so a guest always reads a number next to the QR it belongs to.
 *
 * Horizontal swiping is native scroll + CSS scroll-snap, so touch and trackpad
 * gestures behave the same everywhere — including inside the editor canvas,
 * which renders the footer under a CSS transform. Mouse click-and-drag is added
 * on top for desktop; its deltas are screen-space, so they are divided by the
 * measured transform scale before being applied to scrollLeft.
 */
export default function GiftCarousel({
  slides,
  width = "100%",
  className = "",
  showDots = true,
  itemLabel = "account",
}: {
  /** Slide contents, in swipe order. */
  slides: React.ReactNode[];
  /** Track width — each slide fills it. Defaults to the container's width. */
  width?: number | string;
  className?: string;
  showDots?: boolean;
  /** Noun used in the accessible labels ("account 1 of 2"). */
  itemLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const count = slides.length;

  // Scroll fires every frame while swiping — coalesce to one read per frame.
  const rafRef = useRef<number | null>(null);
  const nearestIndex = () => {
    const el = trackRef.current;
    if (!el) return 0;
    const per = el.clientWidth || 1;
    return Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / per)));
  };

  const handleScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setIndex(nearestIndex());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // Removing an account in the editor while the card is open can leave the track
  // scrolled past the last slide — pull it back into range.
  useEffect(() => {
    if (count === 0 || index <= count - 1) return;
    const el = trackRef.current;
    const next = count - 1;
    setIndex(next);
    if (el) el.scrollTo({ left: next * (el.clientWidth || 0) });
  }, [count, index]);

  const goTo = (i: number) => {
    const el = trackRef.current;
    const next = Math.max(0, Math.min(count - 1, i));
    setIndex(next);
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  const drag = useRef<{ id: number; x: number; left: number; scale: number } | null>(null);
  const snapRestoreRef = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Touch already scrolls natively; hijacking it would fight the browser.
    if (count < 2 || e.pointerType === "touch") return;
    // Let the guest select the account number / hit the copy button instead of
    // starting a drag on it.
    if ((e.target as HTMLElement).closest("input, button, a, textarea")) return;
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
    drag.current = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, scale: scale || 1 };
    // Snapping would fight every scrollLeft write during the drag.
    el.style.scrollSnapType = "none";
    if (snapRestoreRef.current != null) window.clearTimeout(snapRestoreRef.current);
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = trackRef.current;
    if (!d || !el || d.id !== e.pointerId) return;
    el.scrollLeft = d.left - (e.clientX - d.x) / d.scale;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = trackRef.current;
    if (!d || !el || d.id !== e.pointerId) return;
    drag.current = null;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    goTo(nearestIndex());
    // Let the smooth scroll land before snapping is armed again, or it would
    // yank the track to the nearest slide mid-animation.
    snapRestoreRef.current = window.setTimeout(() => {
      if (trackRef.current) trackRef.current.style.scrollSnapType = "";
    }, 400);
  };

  useEffect(
    () => () => {
      if (snapRestoreRef.current != null) window.clearTimeout(snapRestoreRef.current);
    },
    [],
  );

  if (count === 0) return null;
  const multi = count > 1;

  return (
    <div className={`qr-carousel${className ? ` ${className}` : ""}`} style={{ width }}>
      <div
        ref={trackRef}
        className="qr-carousel-track"
        style={{ width, cursor: multi ? "grab" : "default" }}
        onScroll={multi ? handleScroll : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role={multi ? "group" : undefined}
        aria-roledescription={multi ? "carousel" : undefined}
        aria-label={multi ? `${itemLabel} ${index + 1} of ${count}` : undefined}
        tabIndex={multi ? 0 : undefined}
        onKeyDown={(e) => {
          if (!multi) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            goTo(index + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            goTo(index - 1);
          }
        }}
      >
        {slides.map((slide, i) => (
          <div
            className="qr-carousel-slide"
            key={i}
            aria-hidden={multi && i !== index ? true : undefined}
          >
            {slide}
          </div>
        ))}
      </div>

      {showDots && multi && (
        <div className="qr-carousel-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`qr-carousel-dot${i === index ? " is-active" : ""}`}
              aria-label={`Show ${itemLabel} ${i + 1}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
