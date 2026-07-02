"use client";

import React from "react";

/**
 * Figma-style numeric scrubber wrapper. Hovering the wrapped label/input shows
 * an ew-resize cursor and a horizontal drag adjusts the value (`step` per px
 * of movement, clamped to min/max via `onScrub`); a plain click (<3px) falls
 * through so the wrapped input focuses and typing works as normal. Drags are
 * ignored while focus is already inside the field, so selecting text in a
 * focused input still works. Used by the Inspector fields, the RSVP opacity
 * fields, and mirrored by the Background panel's NumberField.
 */
export default function Scrubbable({
  value, onScrub, step = 1, min, max, className, children,
}: {
  value: number;
  onScrub: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const scrubbedRef = React.useRef(false);

  const clamp = (v: number) => {
    if (min !== undefined && v < min) return min;
    if (max !== undefined && v > max) return max;
    return v;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Focus already inside this field → the user is editing; leave the drag
    // to native text selection.
    if (rootRef.current?.contains(document.activeElement)) return;
    const startX = e.clientX;
    const startValue = value;
    let active = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!active) {
        if (Math.abs(dx) < 3) return;
        active = true;
        scrubbedRef.current = true;
        // The mousedown may have focused the input in the meantime — blur it
        // so the caret doesn't sit in a field being scrubbed.
        if (rootRef.current?.contains(document.activeElement)) {
          (document.activeElement as HTMLElement).blur();
        }
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
      }
      ev.preventDefault();
      onScrub(clamp(Math.round(startValue + dx * step)));
    };
    const end = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (active) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <div
      ref={rootRef}
      className={`cursor-ew-resize select-none [&_input]:cursor-ew-resize [&_input:focus]:cursor-text ${className ?? ""}`}
      onPointerDown={onPointerDown}
      onClickCapture={(e) => {
        // Swallow the click that ends a scrub so it doesn't focus the input.
        if (scrubbedRef.current) {
          scrubbedRef.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
}
