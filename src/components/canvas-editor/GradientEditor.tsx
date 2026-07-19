import React from "react";
import Scrubbable from "@/src/components/canvas-editor/scrubbable";
import {
  type GradientDescriptor,
  type GradientStop,
  gradientAngle,
  gradientPreviewCss,
  parseColor,
  buildRgba,
  sortedStops,
} from "@/src/lib/gradient";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Figma-style gradient editor: a ramp with draggable stop handles (drag to
 * control how much each color dominates; click an empty spot to add a stop),
 * a per-stop list (color / position % / opacity % / remove), "+ Add stop",
 * and an angle control for linear gradients.
 *
 * Stateless: edits are reported via `onChange` as a fresh compact descriptor
 * ({ type, angle, colorStops } — no coords, so consumers re-derive direction
 * from the angle). Stop array order is kept stable (never re-sorted) so a
 * handle keeps its identity while being dragged across another one.
 */
export default function GradientEditor(props: {
  value: GradientDescriptor;
  onChange: (g: GradientDescriptor) => void;
}) {
  const { value } = props;
  const stops = value.colorStops;
  const angle = gradientAngle(value);

  const barRef = React.useRef<HTMLDivElement>(null);
  // Latest stops for pointer handlers — a drag fires many moves per render.
  const stopsRef = React.useRef(stops);
  stopsRef.current = stops;

  const emit = (next: Partial<Pick<GradientDescriptor, "type" | "angle" | "colorStops">>) =>
    props.onChange({
      type: next.type ?? value.type,
      angle: next.angle ?? angle,
      colorStops: next.colorStops ?? stopsRef.current,
    });
  // Drag closures outlive the render they were created in — always emit through
  // the latest version so they see fresh stops and the current onChange.
  const emitRef = React.useRef(emit);
  emitRef.current = emit;

  // Handle drag via window-level listeners (same pattern as Scrubbable): the
  // move target is wherever the cursor is, not the 14px handle, so the drag
  // never drops out mid-gesture.
  const beginHandleDrag = (i: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const off = Math.round(clamp01((ev.clientX - rect.left) / rect.width) * 100) / 100;
      const cur = stopsRef.current;
      if (cur[i] && off !== cur[i].offset) {
        emitRef.current({ colorStops: cur.map((s, j) => (j === i ? { ...s, offset: off } : s)) });
      }
    };
    const end = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const updateStop = (i: number, stop: GradientStop) =>
    emit({ colorStops: stopsRef.current.map((s, j) => (j === i ? stop : s)) });

  const removeStop = (i: number) => {
    if (stopsRef.current.length > 2) emit({ colorStops: stopsRef.current.filter((_, j) => j !== i) });
  };

  // "+ Add stop": insert in the middle of the widest gap, reusing its left color.
  const addStop = () => {
    const sorted = sortedStops(value);
    if (sorted.length < 2) return;
    let bestI = 0;
    for (let i = 1; i < sorted.length - 1; i++) {
      if (sorted[i + 1].offset - sorted[i].offset > sorted[bestI + 1].offset - sorted[bestI].offset) bestI = i;
    }
    emit({
      colorStops: [
        ...stopsRef.current,
        { offset: (sorted[bestI].offset + sorted[bestI + 1].offset) / 2, color: sorted[bestI].color },
      ],
    });
  };

  // Click on an empty part of the ramp: add a stop there, colored like the
  // nearest stop to its left (or the first stop when clicking before it).
  const addStopAt = (clientX: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    const off = Math.round(clamp01((clientX - r.left) / r.width) * 100) / 100;
    const sorted = sortedStops(value);
    let color = sorted[0]?.color ?? "#000000";
    for (const s of sorted) if (s.offset <= off) color = s.color;
    emit({ colorStops: [...stopsRef.current, { offset: off, color }] });
  };

  const numCls =
    "w-[30px] bg-transparent outline-none text-right font-[600] text-[13px] leading-none text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="flex flex-col gap-2 bg-[#F2E8E6] rounded-[12px] p-3">
      {/* Ramp with draggable handles — drag a handle to shift where its color
          takes over; the ramp itself always runs left→right like Figma's. */}
      <div
        ref={barRef}
        className="relative h-5 rounded-[6px] border border-[#EDE2DE] cursor-copy touch-none"
        style={{ background: gradientPreviewCss(value) }}
        title="Click to add a stop"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) addStopAt(e.clientX);
        }}
      >
        {stops.map((s, i) => (
          <div
            key={i}
            role="slider"
            aria-label={`Gradient stop ${i + 1} position`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(s.offset * 100)}
            title="Drag to adjust"
            className="absolute top-1/2 w-[14px] h-[14px] rounded-full border-2 border-white shadow-[0_0_0_1px_#0002,0_1px_3px_#0003] cursor-ew-resize touch-none"
            style={{
              left: `${s.offset * 100}%`,
              transform: "translate(-50%, -50%)",
              backgroundColor: parseColor(s.color).hex,
            }}
            onPointerDown={beginHandleDrag(i)}
          />
        ))}
      </div>

      {/* Stops: swatch · position % · opacity % · remove */}
      {stops.map((s, i) => {
        const sp = parseColor(s.color);
        return (
          <div key={i} className="flex items-center gap-2 bg-[#F8F1EF] rounded-[10px] px-2 py-1.5">
            <label
              className="relative inline-block w-6 h-6 rounded-[5px] border border-[#EDE2DE] cursor-pointer overflow-hidden shrink-0"
              style={{ backgroundColor: sp.hex }}
            >
              <input
                type="color"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={sp.hex}
                onChange={(e) => updateStop(i, { ...s, color: buildRgba(e.target.value, sp.opacity) })}
              />
            </label>
            <Scrubbable
              className="flex items-baseline gap-0.5"
              min={0}
              max={100}
              value={Math.round(s.offset * 100)}
              onScrub={(v) => updateStop(i, { ...s, offset: v / 100 })}
            >
              <input
                className={numCls}
                type="number"
                min={0}
                max={100}
                title="Stop position"
                value={Math.round(s.offset * 100)}
                onChange={(e) =>
                  updateStop(i, { ...s, offset: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })
                }
              />
              <span className="font-[600] text-[12px] leading-none text-[#B98587]">%</span>
            </Scrubbable>
            <div className="w-[2px] self-stretch bg-white shrink-0 ml-auto" />
            <Scrubbable
              className="flex items-baseline gap-0.5 shrink-0"
              min={0}
              max={100}
              value={sp.opacity}
              onScrub={(v) => updateStop(i, { ...s, color: buildRgba(sp.hex, v) })}
            >
              <input
                className={numCls}
                type="number"
                min={0}
                max={100}
                title="Stop opacity"
                value={sp.opacity}
                onChange={(e) => updateStop(i, { ...s, color: buildRgba(sp.hex, Number(e.target.value)) })}
              />
              <span className="font-[600] text-[12px] leading-none text-[#B98587]">%</span>
            </Scrubbable>
            <button
              type="button"
              title="Remove stop"
              aria-label="Remove stop"
              disabled={stops.length <= 2}
              onClick={() => removeStop(i)}
              className="shrink-0 w-5 h-5 rounded-[5px] flex items-center justify-center text-[#7D5B59] hover:bg-[#EDE2DE] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addStop}
          className="flex-1 rounded-[10px] px-2 py-[6px] text-[12px] font-[600] bg-[#F8F1EF] text-[#7D5B59] border border-[#EDE2DE] hover:bg-[#EDE2DE] transition-colors"
        >
          + Add stop
        </button>
        {value.type === "linear" && (
          <Scrubbable
            className="flex items-center gap-1 rounded-[10px] px-2 py-[6px] bg-[#F8F1EF] border border-[#EDE2DE]"
            min={0}
            max={360}
            value={angle}
            onScrub={(v) => emit({ angle: ((v % 360) + 360) % 360 })}
          >
            <input
              className="w-[34px] bg-transparent outline-none text-right font-[600] text-[13px] leading-none text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              min={0}
              max={360}
              title="Gradient angle"
              value={angle}
              onChange={(e) => emit({ angle: ((Number(e.target.value) % 360) + 360) % 360 })}
            />
            <span className="font-[600] text-[13px] leading-none text-[#B98587]">°</span>
          </Scrubbable>
        )}
      </div>
    </div>
  );
}

/** Compact Solid / Linear / Radial dropdown shared by the color pickers. */
export function FillTypeSelect(props: {
  label: string;
  value: "solid" | "linear" | "radial";
  onChange: (mode: "solid" | "linear" | "radial") => void;
}) {
  return (
    <select
      aria-label={`${props.label} fill type`}
      className="text-[11px] font-[600] text-[#7D5B59] bg-[#F2E8E6B2] border border-[#EDE2DE] rounded-[6px] px-1.5 py-0.5 outline-none cursor-pointer"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as "solid" | "linear" | "radial")}
    >
      <option value="solid">Solid</option>
      <option value="linear">Linear</option>
      <option value="radial">Radial</option>
    </select>
  );
}
