"use client";
import React from "react";
import {
  Copy,
  Crop,
  Lock,
  MoreHorizontal,
  Move,
  Palette,
  Pencil,
  Trash2,
  Type,
} from "lucide-react";

/** Sections of the phone inspector sheet the bubble can jump to. */
export type BubbleSection =
  | "position"
  | "typography"
  | "border"
  | "color"
  | "appearance"
  | "layers"
  | "artboard";

/** Selection box in canvas backstore coordinates, as fabric reports it. */
export type BubbleRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  isImage: boolean;
  isText: boolean;
};

/** Where the canvas element sits inside the stage, and at what CSS scale. */
export type BubbleCanvasBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
};

// Gap between the selection box and the bubble, and the margin the bubble keeps
// from the canvas edges when it is clamped back inside.
const GAP = 10;
const EDGE = 6;

const btn =
  "shrink-0 h-9 w-9 rounded-full flex items-center justify-center " +
  "text-[#7D5B59] active:bg-[#EDE2DE] transition-colors";

/**
 * The phone/touch counterpart to the desktop inspector column: a small pill
 * that floats next to whatever is selected, the way Canva's does, instead of a
 * full-width sheet parked over the bottom of the artboard.
 *
 * It only carries the one-tap actions (duplicate, lock, delete) and shortcuts
 * into the inspector sheet — the sheet itself still owns every real control, so
 * nothing here duplicates its logic.
 */
export default function SelectionBubble({
  rect,
  canvasBox,
  onOpenSection,
  onDuplicate,
  onLock,
  onDelete,
  onEditImage,
  onCropImage,
}: {
  rect: BubbleRect | null;
  canvasBox: BubbleCanvasBox | null;
  /** Opens the inspector sheet on that section (null = leave it where it was). */
  onOpenSection: (section: BubbleSection | null) => void;
  onDuplicate: () => void;
  onLock: () => void;
  onDelete: () => void;
  onEditImage: () => void;
  onCropImage: () => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  // The bubble is clamped inside the artboard, so its placement depends on its
  // own size. Measured rather than assumed — the button row varies by element
  // type (text and images each add one).
  const [size, setSize] = React.useState({ w: 0, h: 40 });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
          ? prev
          : { w: r.width, h: r.height }
      );
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [rect?.isText, rect?.isImage]);

  if (!rect || !canvasBox) return null;

  const s = canvasBox.scale;
  const selLeft = canvasBox.left + rect.left * s;
  const selTop = canvasBox.top + rect.top * s;
  const selW = rect.width * s;
  const selH = rect.height * s;

  // Above the selection by default; below it when the element is near the top of
  // the artboard and the bubble would be cut off (or cover the header).
  const above = selTop - GAP - size.h >= canvasBox.top + EDGE;
  const top = above ? selTop - GAP - size.h : selTop + selH + GAP;

  const half = size.w / 2;
  const centerX = selLeft + selW / 2;
  const minX = canvasBox.left + EDGE + half;
  const maxX = canvasBox.left + canvasBox.width - EDGE - half;
  // maxX < minX means the bubble is wider than the artboard: centre it and let
  // its own horizontal scroll reach the rest of the buttons.
  const left = size.w === 0 ? centerX : Math.min(Math.max(centerX, minX), Math.max(minX, maxX));

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Element actions"
      data-tutorial="selection-bubble"
      className={
        "absolute z-40 pc:hidden flex items-center gap-0.5 px-1 py-1 " +
        "max-w-[calc(100%-12px)] overflow-x-auto no-scrollbar " +
        "bg-white/95 backdrop-blur-sm rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.18)] " +
        "border border-[#EDE2DE]"
      }
      style={{
        left,
        top: Math.max(top, EDGE),
        transform: "translateX(-50%)",
        // Bubble taps must never fall through to the canvas underneath.
        touchAction: "manipulation",
      }}
      // The canvas listens on pointer/mouse down to start a drag or clear the
      // selection; a tap on the bubble is neither.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {rect.isText && (
        <button type="button" className={btn} aria-label="Text options" title="Text"
          onClick={() => onOpenSection("typography")}>
          <Type size={18} />
        </button>
      )}

      <button type="button" className={btn} aria-label="Color options" title="Color"
        onClick={() => onOpenSection("color")}>
        <Palette size={18} />
      </button>

      {rect.isImage && (
        <>
          <button type="button" className={btn} aria-label="Edit image" title="Edit image"
            onClick={onEditImage}>
            <Pencil size={18} />
          </button>
          <button type="button" className={btn} aria-label="Crop image" title="Crop"
            onClick={onCropImage}>
            <Crop size={18} />
          </button>
        </>
      )}

      <button type="button" className={btn} aria-label="Position and size" title="Position"
        onClick={() => onOpenSection("position")}>
        <Move size={18} />
      </button>

      <button type="button" className={btn} aria-label="Duplicate" title="Duplicate"
        onClick={onDuplicate}>
        <Copy size={18} />
      </button>

      <button type="button" className={btn} aria-label="Lock" title="Lock"
        onClick={onLock}>
        <Lock size={18} />
      </button>

      <button type="button" className={`${btn} text-red-500 active:bg-red-50`}
        aria-label="Delete" title="Delete" onClick={onDelete}>
        <Trash2 size={18} />
      </button>

      <span className="shrink-0 h-5 w-px bg-[#EDE2DE] mx-0.5" aria-hidden />

      <button type="button" className={btn} aria-label="More options" title="More"
        onClick={() => onOpenSection(null)}>
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
