// updated
import React from "react";
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { FONT_GROUPS } from "@/src/lib/fonts";
import LayersPanel from "@/src/components/canvas-editor/LayersPanel";
import ArtboardPanel from "@/src/components/canvas-editor/ArtboardPanel";
import Scrubbable from "@/src/components/canvas-editor/scrubbable";
import GradientEditor, { FillTypeSelect } from "@/src/components/canvas-editor/GradientEditor";
import {
  type GradientDescriptor,
  isGradientValue,
  parseColor,
  buildRgba,
  invertHex,
  solidToGradient,
  gradientToSolid,
} from "@/src/lib/gradient";
import type { LayerInfo } from "@/src/components/CanvasEditor";
import {
  DEFAULT_PRESENTATION_MODE,
  type PresentationMode,
} from "@/src/lib/presentationMode";

// Revert (undo) icon.
function RevertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

// Invert (negative) icon — half-filled circle.
function InvertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
    </svg>
  );
}

// Swap fill ↔ stroke icon — two overlapping squares (one filled, one outlined).
function SwapColorsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="10" y="10" width="11" height="11" rx="1.5" />
    </svg>
  );
}

const colorIconBtn =
  "h-[34px] w-[34px] shrink-0 rounded-[10px] flex items-center justify-center bg-[#F2E8E6B2] text-[#7D5B59] border border-[#EDE2DE] hover:bg-[#EDE2DE] transition-colors";

/**
 * A single color row: swatch + color picker, hex input, opacity %, and
 * per-row Revert / Invert buttons. Stateless w.r.t. the element — it derives
 * everything from `value` and reports edits via `onChange` (a full color string).
 * Defined at module scope so React keeps the inputs mounted (no focus loss).
 */
function ColorRow(props: {
  label: string;
  value: string | GradientDescriptor | undefined | null;
  displayDefault: string;
  onChange: (color: string | GradientDescriptor) => void;
  onRevert: () => void;
  onInvert: () => void;
  // Fill and Stroke render through fabric's toLive() and support gradients;
  // object backgroundColor is painted as a raw ctx.fillStyle string, so it
  // stays solid-only.
  allowGradient?: boolean;
}) {
  const grad = props.allowGradient && isGradientValue(props.value) ? props.value : null;

  const { hex, opacity } = parseColor(grad ? null : (props.value as any), props.displayDefault);
  const display = hex.replace("#", "").toUpperCase();

  // Local text state lets the user type a partial hex without it being
  // overwritten on every keystroke; we only commit when it's a valid 6-digit hex.
  const [text, setText] = React.useState(display);
  React.useEffect(() => {
    setText(display);
  }, [display]);

  const setMode = (mode: 'solid' | 'linear' | 'radial') => {
    if (mode === 'solid') {
      if (grad) props.onChange(gradientToSolid(grad, props.displayDefault));
    } else if (grad) {
      if (grad.type !== mode) props.onChange({ ...grad, type: mode });
    } else {
      props.onChange(solidToGradient(buildRgba(hex, opacity), mode));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-[11px] text-[#7D5B5980] font-[600]">{props.label}</label>
        {props.allowGradient && (
          <FillTypeSelect label={props.label} value={grad ? grad.type : 'solid'} onChange={setMode} />
        )}
      </div>

      {grad ? (
        <GradientEditor value={grad} onChange={props.onChange} />
      ) : (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2 flex-1 min-w-0">
          <label
            className="relative inline-block w-6 h-6 rounded-[5px] border border-[#EDE2DE] cursor-pointer overflow-hidden shrink-0"
            style={{ backgroundColor: hex }}
          >
            <input
              type="color"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              value={hex}
              onChange={(e) => props.onChange(buildRgba(e.target.value, opacity))}
            />
          </label>
          <input
            className="flex-1 min-w-0 bg-transparent outline-none uppercase tracking-tight font-[600] text-[13px] leading-none text-[#7D5B59]"
            value={text}
            maxLength={6}
            onChange={(e) => {
              const v = e.target.value.replace("#", "");
              setText(v.toUpperCase());
              if (/^[0-9a-fA-F]{6}$/.test(v)) props.onChange(buildRgba("#" + v, opacity));
            }}
          />
          <div className="w-[2px] self-stretch -my-2 bg-white shrink-0 ml-auto" />
          <Scrubbable
            className="flex items-baseline gap-0.5 shrink-0 pl-1"
            min={0}
            max={100}
            value={opacity}
            onScrub={(v) => props.onChange(buildRgba(hex, v))}
          >
            <input
              className="w-[30px] bg-transparent outline-none text-right font-[600] text-[15px] leading-none text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => props.onChange(buildRgba(hex, Number(e.target.value)))}
            />
            <span className="font-[600] text-[15px] leading-none text-[#B98587]">%</span>
          </Scrubbable>
        </div>
        {/* Revert / Invert buttons disabled per request — no longer needed.
        <button type="button" title={`Revert ${props.label}`} aria-label={`Revert ${props.label}`} onClick={props.onRevert} className={colorIconBtn}>
          <RevertIcon />
        </button>
        <button type="button" title={`Invert ${props.label}`} aria-label={`Invert ${props.label}`} onClick={props.onInvert} className={colorIconBtn}>
          <InvertIcon />
        </button>
        */}
      </div>
      )}
    </div>
  );
}

/**
 * Figma-style "Spacing" control for a multi-selection (≥2 elements): shows the
 * gap between adjacent elements along their dominant layout axis, or "Mixed"
 * when the gaps differ. Typing a number standardises every gap to that value;
 * dragging (scrub) or the hover ‹ › steppers adjust each gap RELATIVELY, so
 * mixed gaps grow/shrink together while staying different. All measuring and
 * moving lives in the editor (editorRef.getSelectionSpacing / adjust / set).
 */
function SpacingRow(props: { editorRef?: React.RefObject<any> }) {
  const { editorRef } = props;
  const info = editorRef?.current?.getSelectionSpacing?.() ?? null;
  const display = info ? (info.mixed ? "Mixed" : String(info.value)) : "";

  // Local text state so typing isn't overwritten by re-renders; synced back to
  // the measured value whenever the field isn't being edited.
  const [text, setText] = React.useState(display);
  const [focused, setFocused] = React.useState(false);
  React.useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);

  if (!info) return null;

  const adjust = (d: number) => editorRef?.current?.adjustSelectionSpacing?.(d);
  const commit = () => {
    const v = Number(text);
    if (text.trim() !== "" && Number.isFinite(v)) {
      editorRef?.current?.setSelectionSpacing?.(Math.round(v));
    } else {
      setText(display); // invalid input → snap back to the measured value
    }
  };

  const stepBtnCls =
    "absolute top-1/2 -translate-y-1/2 h-[22px] w-[22px] rounded-full flex items-center justify-center " +
    "text-[#7D5B59] opacity-0 group-hover:opacity-100 hover:bg-[#EDE2DE] transition-opacity cursor-pointer";

  return (
    <Scrubbable
      value={info.value}
      onScrub={(v) => {
        // Scrubbable hands us an absolute target for the first gap; convert it
        // to a RELATIVE delta (read live, so it stays correct while dragging)
        // and shift every gap by it — "Mixed" gaps grow/shrink together.
        const cur = editorRef?.current?.getSelectionSpacing?.();
        if (!cur) return;
        const delta = v - cur.value;
        if (delta) adjust(delta);
      }}
    >
      <label className="block text-[11px] text-[#7D5B5980] font-[600] mb-1">
        Spacing {info.axis === "x" ? "(horizontal)" : "(vertical)"}
      </label>
      <div className="group relative flex items-center rounded-[100px] bg-[#F2E8E6B2]">
        {/* Spacing glyph (two bars) — makes way for the left stepper on hover */}
        <span className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[#7D5B59] opacity-100 group-hover:opacity-0 transition-opacity pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="2" y="2" width="12" height="3" rx="1" fill="currentColor" />
            <rect x="2" y="11" width="12" height="3" rx="1" fill="currentColor" />
            <path d="M8 6v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <button
          type="button"
          title="Decrease spacing"
          aria-label="Decrease spacing"
          onClick={() => adjust(-1)}
          className={`${stepBtnCls} left-[3px]`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <input
          className="w-full bg-transparent outline-none text-center px-[28px] py-[6px] text-[13px] text-[#7D5B59] font-[600]"
          type="text"
          inputMode="numeric"
          value={text}
          placeholder="Mixed"
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            else if (e.key === "ArrowUp") { e.preventDefault(); adjust(1); }
            else if (e.key === "ArrowDown") { e.preventDefault(); adjust(-1); }
          }}
        />
        <button
          type="button"
          title="Increase spacing"
          aria-label="Increase spacing"
          onClick={() => adjust(1)}
          className={`${stepBtnCls} right-[3px]`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </Scrubbable>
  );
}

/*************  ✨ Windsurf Command 🌟  *************/
/**
 * Inspector component
 * @param {{ selected: any | null; updateSelected: (patch: Record<string, any>) => void; }}
 * @returns {JSX.Element}
 */
// Sections of the Design tab, in the order they appear down the desktop
// column. On a phone the inspector shows exactly one of these at a time.
type DesignSection = "position" | "typography" | "border" | "color" | "appearance";
export type PhoneSection = DesignSection | "layers" | "artboard";

const PHONE_SECTIONS: { id: PhoneSection; label: string }[] = [
  { id: "position", label: "Position" },
  { id: "typography", label: "Typography" },
  { id: "border", label: "Border" },
  { id: "color", label: "Color Options" },
  { id: "appearance", label: "Appearance" },
  { id: "layers", label: "Layers" },
  { id: "artboard", label: "Artboard" },
];

export default function Inspector(props: {
  selected: any | null;
  updateSelected: (patch: Record<string, any>) => void;
  editorRef?: React.RefObject<any>;
  layers?: LayerInfo[];
  pageCount?: number;
  currentPageIndex?: number;
  // Artboard → Continuous Scroll, mirrored from the editor. Presentation only.
  presentationMode?: PresentationMode;
  // ── Phone sheet ──────────────────────────────────────────────────────────
  // On a phone this inspector is a bottom sheet, and the floating selection
  // bubble (canvas-editor/selection-bubble) decides when it opens and on which
  // section. Desktop ignores all three — it always shows the full column.
  phoneOpen?: boolean;
  phoneSection?: PhoneSection | null;
  onPhoneClose?: () => void;
}) {
  const {
    selected,
    updateSelected,
    editorRef,
    layers = [],
    pageCount = 1,
    currentPageIndex = 0,
    presentationMode = DEFAULT_PRESENTATION_MODE,
    phoneOpen = false,
    phoneSection = null,
    onPhoneClose,
  } = props;
  const [tab, setTab] = React.useState<"design" | "layers" | "artboard">("design");
  const [showTextStyles, setShowTextStyles] = React.useState(false);

  // ── PHONE INSPECTOR ──────────────────────────────────────────────────────
  // The inspector has no room for a column on a phone, so it becomes a sheet
  // above the tool rail showing one section at a time. The bubble bar pages
  // through the sections (swipe or arrows) and its hamburger lists them all.
  const [designSection, setDesignSection] =
    React.useState<DesignSection>("position");
  const [sectionMenuOpen, setSectionMenuOpen] = React.useState(false);

  // Which entry the bubble is currently on. Layers/Artboard are whole tabs;
  // everything else is a section of the Design tab.
  const phoneSectionId: PhoneSection =
    tab === "layers" ? "layers" : tab === "artboard" ? "artboard" : designSection;
  const phoneIndex = PHONE_SECTIONS.findIndex((s) => s.id === phoneSectionId);

  const goToSection = (id: PhoneSection) => {
    if (id === "layers" || id === "artboard") {
      setTab(id);
      return;
    }
    setTab("design");
    setDesignSection(id);
  };

  const stepSection = (delta: number) => {
    const next = PHONE_SECTIONS[phoneIndex + delta];
    if (next) goToSection(next.id);
  };

  // The bubble opens the sheet on a specific section (Color, Typography, …).
  // Re-applied whenever that request changes, so tapping the same button twice
  // after paging away still lands back on the section it names.
  React.useEffect(() => {
    if (phoneOpen && phoneSection) goToSection(phoneSection);
  }, [phoneOpen, phoneSection]);

  // A phone sheet parked over the canvas needs an escape that isn't the tiny
  // chevron; tapping the dimmed canvas closes it, as the tool sheet already does.
  const phoneSheetOpen = phoneOpen && !!selected;

  // Horizontal drag on the bubble pages between sections. Pointer events cover
  // touch and mouse; taps on the bubble's own buttons fall under the threshold
  // and are ignored.
  const swipeStartRef = React.useRef<number | null>(null);
  const onBubblePointerDown = (e: React.PointerEvent) => {
    swipeStartRef.current = e.clientX;
  };
  const onBubblePointerUp = (e: React.PointerEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (start == null) return;
    const dx = e.clientX - start;
    if (Math.abs(dx) < 40) return;
    stepSection(dx < 0 ? 1 : -1);
  };
  // When on, editing width or height scales both axes by the same factor so the
  // element resizes uniformly (keeps proportions).
  const [lockUniform, setLockUniform] = React.useState(false);

  // Snapshot of the element's colors captured the moment it is selected, so each
  // "Revert" can restore that element's original Fill / Background / Border.
  const colorSnapRef = React.useRef<{ key: string; fill: any; backgroundColor: any; stroke: any } | null>(null);

  const TEXT_STYLES = [
    { name: 'Heading', fontSize: 48, fontWeight: 'bold' },
    { name: 'Subheading', fontSize: 28, fontWeight: '600' },
    { name: 'Body', fontSize: 16, fontWeight: 'normal' },
  ];

  const inputCls =
    "w-full rounded-[100px] px-[10px] py-[6px] text-[13px] text-[#7D5B59] font-[600] bg-[#F2E8E6B2] outline-none";
  const labelCls = "block text-[11px] text-[#7D5B5980] font-[600] mb-1";
  // Desktop stacks every section down the column. The phone shows one section
  // at a time, laid out as a single horizontal strip of controls that scrolls
  // sideways — a toolbar rather than a form.
  const secCls = (id: DesignSection) => {
    const base =
      "flex border-b-[1px] border-[#EDE2DE] " +
      "flex-row items-end gap-2 overflow-x-auto px-3 py-2 [&>*]:shrink-0 " +
      "pc:flex-col pc:items-stretch pc:gap-3 pc:overflow-x-visible pc:p-4";
    return designSection === id ? base : `${base} hidden pc:flex`;
  };

  const bgParsed = parseColor(selected?.backgroundColor, '#F8F7F6');
  const strokeParsed = parseColor(selected?.stroke, '#F8F7F6');
  const fillParsed = parseColor(selected?.fill, '#000000');

  // Defaults used when an element had no original color to revert to.
  const DEFAULT_FILL = '#000000';
  const DEFAULT_BG = '#F8F7F6';
  const DEFAULT_STROKE = '#F8F7F6';

  // Fill color applies to both shapes and images (as a color overlay/tint).
  const supportsFill = !!selected;

  // A multi-selection (ActiveSelection) has no typography of its own; its child
  // objects are carried in `selected.objects`. Derive the shown value from the
  // children so the font controls reflect a shared value and edits apply to all.
  const childObjects: any[] = Array.isArray(selected?.objects) ? selected.objects : [];
  // Distinguishes "children disagree" (mixed) from "children have no such prop",
  // so the dropdowns can show a Mixed placeholder instead of a wrong default.
  const MIXED = '__mixed__';
  const sharedChildProp = (key: string) => {
    const vals = childObjects.map((o) => o?.[key]).filter((v) => v !== undefined && v !== null);
    if (!vals.length) return undefined;
    return vals.every((v) => v === vals[0]) ? vals[0] : MIXED;
  };
  const displayFontFamily = selected?.fontFamily ?? sharedChildProp('fontFamily') ?? 'Arial';
  const displayFontWeight = selected?.fontWeight ?? sharedChildProp('fontWeight') ?? 'normal';

  // Capture the element's colors once per selection (keyed by a signature that
  // doesn't change when only colors are edited) so Revert restores the original.
  if (selected) {
    const key = `${selected.id ?? ''}|${selected.type ?? ''}|${selected.name ?? ''}|${selected.width ?? ''}|${selected.height ?? ''}`;
    if (!colorSnapRef.current || colorSnapRef.current.key !== key) {
      colorSnapRef.current = {
        key,
        fill: selected.fill,
        backgroundColor: selected.backgroundColor,
        stroke: selected.stroke,
      };
    }
  }
  const orig = colorSnapRef.current;

  // Quick actions (commented out for now — re-enable with the buttons below).
  // const revertAll = () => {
  //   const patch: Record<string, any> = {
  //     backgroundColor: orig?.backgroundColor ?? DEFAULT_BG,
  //     stroke: orig?.stroke ?? DEFAULT_STROKE,
  //   };
  //   if (supportsFill) patch.fill = orig?.fill ?? DEFAULT_FILL;
  //   updateSelected(patch);
  // };

  // const invertAll = () => {
  //   const patch: Record<string, any> = {
  //     backgroundColor: buildRgba(invertHex(bgParsed.hex), bgParsed.opacity),
  //     stroke: buildRgba(invertHex(strokeParsed.hex), strokeParsed.opacity),
  //   };
  //   if (supportsFill) patch.fill = buildRgba(invertHex(fillParsed.hex), fillParsed.opacity);
  //   updateSelected(patch);
  // };

  return (
    <>
      {/* Phone: tap-away backdrop. Deliberately transparent — the sheet is a
          transient panel over the artboard the user is still looking at. */}
      {phoneSheetOpen && (
        <div
          className="fixed inset-0 z-[44] pc:hidden"
          onClick={() => onPhoneClose?.()}
          aria-hidden
        />
      )}
    <aside
      className={[
        // Phone: a sheet that floats above the tool rail, opened on demand by
        // the floating selection bubble. Desktop: the sidebar column, unchanged.
        "fixed inset-x-0 bottom-[var(--mobile-rail-h)] z-[45] w-full h-auto max-h-[52vh]",
        "rounded-t-[18px] shadow-[0_-8px_24px_rgba(0,0,0,0.15)] bg-[#F8F7F6]",
        "pc:static pc:inset-auto pc:z-auto pc:h-full pc:max-h-none",
        "pc:rounded-none pc:shadow-none pc:bg-transparent",
        "pc:w-60 lg:w-80 min-w-0 lg:shrink-0 border-[#EDE2DE] border-[1px] overflow-y-auto",
        phoneSheetOpen ? "" : "hidden pc:block",
      ].join(" ")}
    >
      {/* ── Phone: section bubble ─────────────────────────────────────────
          Swipe across it (or use the arrows) to page through the inspector;
          the hamburger opens the full section list. */}
      <div className="pc:hidden sticky top-0 z-10 bg-[#F8F7F6] border-b-[1px] border-[#EDE2DE]">
        <span className="block mx-auto mt-1.5 h-1 w-9 rounded-full bg-[#BBA8A7]" />

        <div
          className="flex items-center gap-0.5 px-1.5 py-1 select-none touch-pan-y"
          onPointerDown={onBubblePointerDown}
          onPointerUp={onBubblePointerUp}
          onPointerCancel={() => (swipeStartRef.current = null)}
        >
          <button
            type="button"
            onClick={() => setSectionMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={sectionMenuOpen}
            aria-label="Choose inspector section"
            className="p-1.5 rounded-[10px] text-[#7D5B59] hover:bg-[#F2E8E6B2] shrink-0"
          >
            <Menu size={18} />
          </button>

          <button
            type="button"
            onClick={() => stepSection(-1)}
            disabled={phoneIndex <= 0}
            aria-label="Previous section"
            className="p-1 rounded-[10px] text-[#7D5B59] hover:bg-[#F2E8E6B2] disabled:opacity-25 shrink-0"
          >
            <ChevronLeft size={18} />
          </button>

          <span className="flex-1 text-center text-[13px] font-[700] text-[#7D5B59] truncate">
            {PHONE_SECTIONS[phoneIndex]?.label ?? "Inspector"}
          </span>

          <button
            type="button"
            onClick={() => stepSection(1)}
            disabled={phoneIndex >= PHONE_SECTIONS.length - 1}
            aria-label="Next section"
            className="p-1 rounded-[10px] text-[#7D5B59] hover:bg-[#F2E8E6B2] disabled:opacity-25 shrink-0"
          >
            <ChevronRight size={18} />
          </button>

          {selected && (
            <button
              type="button"
              onClick={() => editorRef?.current?.deleteActiveObject()}
              aria-label="Delete element"
              className="p-1 rounded-[10px] text-red-500 hover:bg-red-50 shrink-0"
            >
              <Trash2 size={17} />
            </button>
          )}

          <button
            type="button"
            onClick={() => onPhoneClose?.()}
            aria-label="Close inspector"
            className="p-1 rounded-[10px] text-[#7D5B59] hover:bg-[#F2E8E6B2] shrink-0"
          >
            <ChevronDown size={18} />
          </button>
        </div>

        {/* Position within the section list. */}
        <div className="flex items-center justify-center gap-1 pb-1.5">
          {PHONE_SECTIONS.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all ${
                i === phoneIndex ? "w-4 bg-[#7D5B59]" : "w-1.5 bg-[#D8C9C6]"
              }`}
            />
          ))}
        </div>

        {sectionMenuOpen && (
          <div
            className="fixed inset-0 z-[55]"
            onClick={() => setSectionMenuOpen(false)}
            aria-hidden
          />
        )}
        {sectionMenuOpen && (
          // Fixed, and anchored just above the tool rail: the sheet's height
          // follows its section, so a dropdown hanging off the bubble would
          // fall behind the rail whenever the active section is a short one.
          <div className="fixed left-2 bottom-[calc(var(--mobile-rail-h)+8px)] w-[190px] max-h-[280px] overflow-y-auto bg-white rounded-[12px] shadow-lg border border-[#EDE2DE] z-[60]">
            {PHONE_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  goToSection(s.id);
                  setSectionMenuOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-[13px] border-b border-[#F2E8E6B2] last:border-b-0 ${
                  s.id === phoneSectionId
                    ? "bg-[#F2E8E6B2] text-[#7D5B59] font-[700]"
                    : "text-[#7D5B59] hover:bg-[#F9F5F4]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
      <div className="hidden pc:block border-b-[1px] border-[#EDE2DE] pb-3 p-4">
        <h3 className="font-[600] text-[20px] capitalize">
          {tab === "layers" ? "Layers" : tab === "artboard" ? "Artboard" : selected?.type ?? "Inspector"}
        </h3>
      </div>

      {/* Tab switcher: Design / Layers / Artboard */}
      <div className="hidden pc:flex gap-1 p-2 border-b-[1px] border-[#EDE2DE]">
        {(["design", "layers", "artboard"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-[6px] rounded-[8px] text-[12px] font-[700] capitalize transition-colors ${
              tab === t ? "bg-[#7D5B59] text-white" : "bg-[#F2E8E6B2] text-[#7D5B59]"
            }`}
          >
            {t === "design" ? "Design" : t === "layers" ? "Layers" : "Artboard"}
          </button>
        ))}
      </div>

      {tab === "artboard" ? (
        <ArtboardPanel
          pageCount={pageCount}
          currentPageIndex={currentPageIndex}
          editorRef={editorRef}
          presentationMode={presentationMode}
        />
      ) : tab === "layers" ? (
        <LayersPanel
          layers={layers}
          activeLayerId={selected?.id ?? null}
          editorRef={editorRef}
        />
      ) : !selected ? (
        <div className="p-4 text-sm text-neutral-500">Select an element to customize it</div>
      ) : (
        <div className="flex flex-col">
          {/* ── Position ───────────────────────────────────────── */}
          <div className={secCls("position")}>
            <h5 className="hidden pc:block font-[600] text-[13px] text-[#7D5B59]">Position</h5>

            {/* Align to frame (object alignment — distinct from text paragraph
                align in Typography). Moves the selection to an edge/center of the
                active canvas/artboard via the editor's scene-coordinate logic. */}
            <div className="w-[200px] pc:w-auto">
              <label className={labelCls}>Align to frame</label>
              <div className="flex gap-1">
                {([
                  { key: "left", title: "Align left", Icon: AlignStartVertical },
                  { key: "horizontal-center", title: "Align horizontal center", Icon: AlignCenterVertical },
                  { key: "right", title: "Align right", Icon: AlignEndVertical },
                  { key: "top", title: "Align top", Icon: AlignStartHorizontal },
                  { key: "vertical-center", title: "Align vertical center", Icon: AlignCenterHorizontal },
                  { key: "bottom", title: "Align bottom", Icon: AlignEndHorizontal },
                ] as const).map(({ key, title, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    title={title}
                    aria-label={title}
                    onClick={() => editorRef?.current?.alignSelected?.(key)}
                    className="flex-1 py-[6px] rounded-[8px] border border-[#EDE2DE] bg-[#F2E8E6B2] text-[#7D5B59] hover:bg-[#EDE2DE] flex items-center justify-center transition-colors"
                  >
                    <Icon size={15} />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-[180px] pc:w-auto">
              <Scrubbable
                value={Math.round(selected.left ?? 0)}
                onScrub={(v) => updateSelected({ left: v })}
              >
                <label className={labelCls}>X</label>
                <input
                  className={inputCls}
                  type="number"
                  value={Math.round(selected.left ?? 0)}
                  onChange={(e) => updateSelected({ left: Number(e.target.value) })}
                />
              </Scrubbable>
              <Scrubbable
                value={Math.round(selected.top ?? 0)}
                onScrub={(v) => updateSelected({ top: v })}
              >
                <label className={labelCls}>Y</label>
                <input
                  className={inputCls}
                  type="number"
                  value={Math.round(selected.top ?? 0)}
                  onChange={(e) => updateSelected({ top: Number(e.target.value) })}
                />
              </Scrubbable>
            </div>

            {/* Width / Height — drive Fabric's scaleX/scaleY so the displayed
                size in the canvas matches the input. The lock on the right keeps
                both axes scaled by the same factor (uniform resize). */}
            <div className="flex items-end gap-2 w-[230px] pc:w-auto">
              <Scrubbable
                className="flex-1"
                min={1}
                value={Math.round((selected.width ?? 0) * (selected.scaleX ?? 1))}
                onScrub={(w) => {
                  const base = selected.width ?? w;
                  if (!base) return;
                  const s = w / base;
                  updateSelected(lockUniform ? { scaleX: s, scaleY: s } : { scaleX: s });
                }}
              >
                <label className={labelCls}>Width</label>
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  value={Math.round((selected.width ?? 0) * (selected.scaleX ?? 1))}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    const base = selected.width ?? w;
                    if (!base) return;
                    const s = w / base;
                    updateSelected(lockUniform ? { scaleX: s, scaleY: s } : { scaleX: s });
                  }}
                />
              </Scrubbable>
              <Scrubbable
                className="flex-1"
                min={1}
                value={Math.round((selected.height ?? 0) * (selected.scaleY ?? 1))}
                onScrub={(h) => {
                  const base = selected.height ?? h;
                  if (!base) return;
                  const s = h / base;
                  updateSelected(lockUniform ? { scaleX: s, scaleY: s } : { scaleY: s });
                }}
              >
                <label className={labelCls}>Height</label>
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  value={Math.round((selected.height ?? 0) * (selected.scaleY ?? 1))}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    const base = selected.height ?? h;
                    if (!base) return;
                    const s = h / base;
                    updateSelected(lockUniform ? { scaleX: s, scaleY: s } : { scaleY: s });
                  }}
                />
              </Scrubbable>
              <button
                type="button"
                onClick={() => setLockUniform((v) => !v)}
                title={lockUniform ? "Unlock width & height" : "Lock width & height (uniform resize)"}
                aria-label="Lock width and height"
                aria-pressed={lockUniform}
                className={`shrink-0 h-[34px] w-[34px] rounded-[10px] border flex items-center justify-center transition-colors ${
                  lockUniform
                    ? "bg-[#7D5B59] text-white border-[#7D5B59]"
                    : "bg-[#F2E8E6B2] text-[#7D5B59] border-[#EDE2DE]"
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  {lockUniform ? (
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  ) : (
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  )}
                </svg>
              </button>
            </div>

            {/* Angle / Rotation */}
            <Scrubbable
              className="w-[120px] pc:w-auto"
              value={Math.round(selected.angle ?? 0)}
              onScrub={(v) => updateSelected({ angle: ((v % 360) + 360) % 360 })}
            >
              <label className={labelCls}>Angle</label>
              <div className="flex items-center gap-2">
                <input
                  className={inputCls + " flex-1"}
                  type="number"
                  min={0}
                  max={360}
                  value={Math.round(selected.angle ?? 0)}
                  onChange={(e) => updateSelected({ angle: Number(e.target.value) % 360 })}
                />
                <span className="text-[13px] text-[#B98587] font-[600]">°</span>
              </div>
            </Scrubbable>

            {/* Spacing between selected elements — multi-selection only */}
            {childObjects.length >= 2 && <SpacingRow editorRef={editorRef} />}
          </div>

          {/* ── Typography ─────────────────────────────────────── */}
          <div className={secCls("typography")}>
            <div className="flex items-center justify-between relative">
              <h5 className="hidden pc:block font-[600] text-[13px] text-[#7D5B59]">Typography</h5>
              <button
                type="button"
                onClick={() => setShowTextStyles((v) => !v)}
                title="Text styles"
                className="p-1 rounded hover:bg-[#F2E8E6B2] text-[#7D5B59]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="2" y="3" width="3" height="3" rx="0.5" fill="currentColor" />
                  <rect x="7" y="3" width="7" height="1.5" rx="0.5" fill="currentColor" />
                  <rect x="2" y="8" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
                  <rect x="7" y="8.5" width="7" height="1.5" rx="0.5" fill="currentColor" />
                  <rect x="2" y="12.5" width="2" height="2" rx="0.5" fill="currentColor" />
                  <rect x="7" y="13" width="7" height="1.5" rx="0.5" fill="currentColor" />
                </svg>
              </button>
              {showTextStyles && (
                <div className="absolute right-0 top-7 z-10 w-44 rounded-lg border border-[#EDE2DE] bg-white shadow-md p-1">
                  <div className="text-[11px] text-[#7D5B5980] font-[600] px-2 py-1">Text styles</div>
                  {TEXT_STYLES.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => {
                        updateSelected({ fontSize: s.fontSize, fontWeight: s.fontWeight });
                        setShowTextStyles(false);
                      }}
                      className="block w-full text-left px-2 py-1.5 rounded hover:bg-[#F2E8E6B2] text-[#7D5B59]"
                      style={{ fontSize: `${Math.min(s.fontSize / 2, 18)}px`, fontWeight: s.fontWeight as any }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selected.text !== undefined && (
              <div>
                <label className={labelCls}>Text</label>
                <input
                  className={inputCls}
                  value={selected.text}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                />
              </div>
            )}

            {/* Font family + weight */}
            <div className="grid grid-cols-2 gap-3 w-[180px] pc:w-auto">
              <div>
                <label className={labelCls}>Font Family</label>
                <select
                  className={inputCls}
                  value={displayFontFamily}
                  onChange={(e) => updateSelected({ fontFamily: e.target.value })}
                >
                  {displayFontFamily === MIXED && (
                    <option value={MIXED} disabled hidden>
                      Mixed
                    </option>
                  )}
                  {FONT_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.fonts.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: f }}>
                          {f}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Weight</label>
                <select
                  className={inputCls}
                  value={displayFontWeight}
                  onChange={(e) => updateSelected({ fontWeight: e.target.value })}
                >
                  {displayFontWeight === MIXED && (
                    <option value={MIXED} disabled hidden>
                      Mixed
                    </option>
                  )}
                  <option value="100">Thin</option>
                  <option value="200">ExtraLight</option>
                  <option value="300">Light</option>
                  <option value="normal">Regular</option>
                  <option value="500">Medium</option>
                  <option value="600">SemiBold</option>
                  <option value="bold">Bold</option>
                  <option value="800">ExtraBold</option>
                  <option value="900">Black</option>
                </select>
              </div>
            </div>

            {/* Font size + line height */}
            <div className="grid grid-cols-2 gap-3 w-[180px] pc:w-auto">
              <Scrubbable
                min={1}
                value={selected.fontSize ?? 24}
                onScrub={(v) => updateSelected({ fontSize: v })}
              >
                <label className={labelCls}>Font Size</label>
                <input
                  className={inputCls}
                  type="number"
                  value={selected.fontSize ?? 24}
                  onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })}
                />
              </Scrubbable>
              <div>
                <label className={labelCls}>Line Height</label>
                <input
                  className={inputCls}
                  type="number"
                  step="0.1"
                  placeholder="Auto"
                  value={selected.lineHeight ?? ""}
                  onChange={(e) =>
                    updateSelected({
                      lineHeight: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            {/* Letter spacing */}
            <Scrubbable
              className="w-[110px] pc:w-auto"
              value={selected.charSpacing ?? 0}
              onScrub={(v) => updateSelected({ charSpacing: v })}
            >
              <label className={labelCls}>Letter Spacing</label>
              <input
                className={inputCls}
                type="number"
                step="1"
                value={selected.charSpacing ?? 0}
                onChange={(e) => updateSelected({ charSpacing: Number(e.target.value) })}
              />
            </Scrubbable>

            {/* Text align buttons */}
            <div className="w-[150px] pc:w-auto">
              <label className={labelCls}>Align Text</label>
              <div className="flex gap-1">
                {([
                  { key: "left", icon: "/ico_Left.svg" },
                  { key: "center", icon: "/ico_Center.svg" },
                  { key: "right", icon: "/ico_Right.svg" },
                  { key: "justify", icon: "/ico_Justify.svg" },
                ] as const).map(({ key: align, icon }) => (
                  <button
                    key={align}
                    title={align}
                    className={`flex-1 py-[6px] rounded-[8px] text-[11px] font-[700] border border-[#EDE2DE] flex items-center justify-center ${
                      (selected.textAlign ?? "left") === align
                        ? "bg-[#7D5B59] text-white border-[#7D5B59]"
                        : "bg-[#F2E8E6B2] text-[#7D5B59]"
                    }`}
                    onClick={() => updateSelected({ textAlign: align })}
                  >
                    <img src={icon} alt={align} className="h-[14px] w-[14px]" />
                    <span className="sr-only">{align}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Text shadow toggle + settings */}
            <div className="flex flex-col gap-2 w-[210px] pc:w-auto">
              <div className="flex items-center justify-between">
                <label className={labelCls + " mb-0"}>Text Shadow</label>
                <button
                  className={`relative w-[52px] h-[28px] rounded-full transition-colors ${
                    selected.shadow ? "bg-[#7D5B59]" : "bg-[#D5C5C3]"
                  }`}
                  onClick={() =>
                    updateSelected({
                      shadow: selected.shadow
                        ? null
                        : { color: "#00000040", blur: 4, offsetX: 2, offsetY: 2 },
                    })
                  }
                >
                  <span
                    className={`absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow transition-[left] ${
                      selected.shadow ? "left-[27px]" : "left-[3px]"
                    }`}
                  />
                </button>
              </div>

              {selected.shadow && (
                <div className="flex flex-col gap-2 bg-[#F2E8E6] rounded-[12px] p-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={labelCls + " mb-0"}>Position X</label>
                      <span className="text-[12px] text-[#7D5B59] font-[600]">
                        {selected.shadow.offsetX ?? 2}
                      </span>
                    </div>
                    <input
                      className="w-full accent-[#7D5B59]"
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={selected.shadow.offsetX ?? 2}
                      onChange={(e) =>
                        updateSelected({
                          shadow: { ...selected.shadow, offsetX: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={labelCls + " mb-0"}>Position Y</label>
                      <span className="text-[12px] text-[#7D5B59] font-[600]">
                        {selected.shadow.offsetY ?? 2}
                      </span>
                    </div>
                    <input
                      className="w-full accent-[#7D5B59]"
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={selected.shadow.offsetY ?? 2}
                      onChange={(e) =>
                        updateSelected({
                          shadow: { ...selected.shadow, offsetY: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={labelCls + " mb-0"}>Blur</label>
                      <span className="text-[12px] text-[#7D5B59] font-[600]">
                        {selected.shadow.blur ?? 4}
                      </span>
                    </div>
                    <input
                      className="w-full accent-[#7D5B59]"
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      value={selected.shadow.blur ?? 4}
                      onChange={(e) =>
                        updateSelected({
                          shadow: { ...selected.shadow, blur: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Style buttons: I S U */}
            <div className="flex gap-2 w-[130px] pc:w-auto">
              <button
                className={`flex-1 py-[6px] rounded-[8px] text-[13px] font-[700] italic border border-[#EDE2DE] ${
                  selected.fontStyle === "italic"
                    ? "bg-[#7D5B59] text-white"
                    : "bg-[#F2E8E6B2] text-[#7D5B59]"
                }`}
                onClick={() =>
                  updateSelected({
                    fontStyle: selected.fontStyle === "italic" ? "normal" : "italic",
                  })
                }
              >
                I
              </button>
              <button
                className={`flex-1 py-[6px] rounded-[8px] text-[13px] font-[700] line-through border border-[#EDE2DE] ${
                  selected.linethrough
                    ? "bg-[#7D5B59] text-white"
                    : "bg-[#F2E8E6B2] text-[#7D5B59]"
                }`}
                onClick={() => updateSelected({ linethrough: !selected.linethrough })}
              >
                S
              </button>
              <button
                className={`flex-1 py-[6px] rounded-[8px] text-[13px] font-[700] underline border border-[#EDE2DE] ${
                  selected.underline
                    ? "bg-[#7D5B59] text-white"
                    : "bg-[#F2E8E6B2] text-[#7D5B59]"
                }`}
                onClick={() => updateSelected({ underline: !selected.underline })}
              >
                U
              </button>
            </div>

          </div>

          {/* ── Corner Radius ────────────────────────────────────
              Disabled: non-functional scaffold. Fabric has no per-corner
              radius — cornerRadiusTR/BR/BL are inert made-up props, and rx
              alone (without ry) renders square corners even on rects. To
              revive: set rx+ry together for a uniform radius, or subclass
              Rect for per-corner paths, and add the props to
              SELECTION_PROPS/FABRIC_EXPORT_PROPS so they persist.
          <div className={sectionCls}>
            <h5 className="hidden pc:block font-[600] text-[13px] text-[#7D5B59]">Corner Radius</h5>
            <div className="grid grid-cols-2 gap-3 w-[180px] pc:w-auto">
              <div>
                <label className={labelCls}>Top Left</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={selected.rx ?? 0}
                  onChange={(e) => updateSelected({ rx: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Top Right</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={selected.cornerRadiusTR ?? 0}
                  onChange={(e) => updateSelected({ cornerRadiusTR: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Bottom Right</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={selected.cornerRadiusBR ?? 0}
                  onChange={(e) => updateSelected({ cornerRadiusBR: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Bottom Left</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={selected.cornerRadiusBL ?? 0}
                  onChange={(e) => updateSelected({ cornerRadiusBL: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
          */}

          {/* ── Border ─────────────────────────────────────────── */}
          <div className={secCls("border")}>
            <h5 className="hidden pc:block font-[600] text-[13px] text-[#7D5B59]">Border</h5>

            <div className="grid grid-cols-2 gap-3 w-[180px] pc:w-auto">
              <Scrubbable
                min={0}
                value={selected.strokeWidth ?? 0}
                onScrub={(v) => updateSelected({ strokeWidth: v })}
              >
                <label className={labelCls}>Width</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={selected.strokeWidth ?? 0}
                  onChange={(e) => updateSelected({ strokeWidth: Number(e.target.value) })}
                />
              </Scrubbable>
              <div>
                <label className={labelCls}>Style</label>
                <select
                  className={inputCls}
                  value={(() => {
                    if ((selected.strokeWidth ?? 0) === 0) return "none";
                    const d = selected.strokeDashArray;
                    if (!d || d.length === 0) return "solid";
                    const key = d.join(",");
                    if (key === "6,4") return "dashed";
                    if (key === "2,4") return "dotted";
                    if (key === "12,6") return "long-dashed";
                    if (key === "10,4,2,4") return "dash-dot";
                    return "solid";
                  })()}
                  onChange={(e) => {
                    const v = e.target.value;
                    const styleMap: Record<string, number[] | null> = {
                      solid: null,
                      dashed: [6, 4],
                      dotted: [2, 4],
                      "long-dashed": [12, 6],
                      "dash-dot": [10, 4, 2, 4],
                    };
                    if (v === "none") {
                      updateSelected({ strokeWidth: 0 });
                      return;
                    }
                    const patch: Record<string, any> = { strokeDashArray: styleMap[v] };
                    if ((selected.strokeWidth ?? 0) === 0) patch.strokeWidth = 1;
                    updateSelected(patch);
                  }}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                  <option value="long-dashed">Long Dashed</option>
                  <option value="dash-dot">Dash Dot</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>

            <div className="w-[190px] pc:w-auto">
              <label className={labelCls}>Box Shadow</label>
              <input
                className={inputCls}
                placeholder="e.g. 2px 2px 8px #0002"
                value={selected.boxShadow ?? ""}
                onChange={(e) => updateSelected({ boxShadow: e.target.value })}
              />
            </div>

            <div className="w-[190px] pc:w-auto">
              <label className={labelCls}>Background</label>
              <input
                className={inputCls}
                placeholder="e.g. linear-gradient(...)"
                value={selected.backgroundGradient ?? ""}
                onChange={(e) => updateSelected({ backgroundGradient: e.target.value })}
              />
            </div>
          </div>

          {/* ── Color Options ──────────────────────────────────── */}
          <div className={secCls("color")}>
            <div className="flex items-center justify-between">
              <h5 className="hidden pc:block font-[600] text-[13px] text-[#7D5B59]">Color Options</h5>
              {supportsFill && (
                <button
                  type="button"
                  title="Swap Fill & Stroke colors"
                  aria-label="Swap Fill and Stroke colors"
                  onClick={() =>
                    // Swap the raw values so gradient fills survive the swap
                    // (the editor revives serialized gradients on either key).
                    updateSelected({
                      fill: selected.stroke ?? buildRgba(strokeParsed.hex, strokeParsed.opacity),
                      stroke: selected.fill ?? buildRgba(fillParsed.hex, fillParsed.opacity),
                    })
                  }
                  className={colorIconBtn}
                >
                  <SwapColorsIcon />
                </button>
              )}
            </div>

            {/* Quick actions — affect all colors at once */}
            {/* <div>
              <label className={labelCls}>Quick Actions</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  title="Revert All Colors"
                  onClick={revertAll}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-[7px] text-[12px] font-[600] bg-[#F2E8E6B2] text-[#7D5B59] border border-[#EDE2DE] hover:bg-[#EDE2DE] transition-colors"
                >
                  <RevertIcon /> Revert All
                </button>
                <button
                  type="button"
                  title="Invert All Colors"
                  onClick={invertAll}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-[7px] text-[12px] font-[600] bg-[#F2E8E6B2] text-[#7D5B59] border border-[#EDE2DE] hover:bg-[#EDE2DE] transition-colors"
                >
                  <InvertIcon /> Invert All
                </button>
              </div>
            </div> */}

            {/* Each colour row gets a fixed width in the phone strip;
                `pc:contents` dissolves the wrapper on desktop so the column
                keeps its original spacing. */}
            {supportsFill && (
              <div className="w-[250px] pc:contents">
              <ColorRow
                label="Fill"
                value={selected.fill}
                displayDefault={DEFAULT_FILL}
                allowGradient
                onChange={(c) => updateSelected({ fill: c })}
                onRevert={() => updateSelected({ fill: orig?.fill ?? DEFAULT_FILL })}
                onInvert={() => updateSelected({ fill: buildRgba(invertHex(fillParsed.hex), fillParsed.opacity) })}
              />
              </div>
            )}

            <div className="w-[250px] pc:contents">
            <ColorRow
              label="Stroke"
              value={selected.stroke}
              displayDefault={DEFAULT_STROKE}
              allowGradient
              onChange={(c) => updateSelected({ stroke: c })}
              onRevert={() => updateSelected({ stroke: orig?.stroke ?? DEFAULT_STROKE })}
              onInvert={() => updateSelected({ stroke: buildRgba(invertHex(strokeParsed.hex), strokeParsed.opacity) })}
            />
            </div>

            <div className="w-[250px] pc:contents">
            <ColorRow
              label="Background"
              value={selected.backgroundColor}
              displayDefault={DEFAULT_BG}
              onChange={(c) => updateSelected({ backgroundColor: c })}
              onRevert={() => updateSelected({ backgroundColor: orig?.backgroundColor ?? DEFAULT_BG })}
              onInvert={() => updateSelected({ backgroundColor: buildRgba(invertHex(bgParsed.hex), bgParsed.opacity) })}
            />
            </div>
          </div>

          {/* ── Appearance ─────────────────────────────────────── */}
          <div className={secCls("appearance")}>
            <h5 className="hidden pc:block font-[600] text-[13px] text-[#7D5B59]">Appearance</h5>

            <div className="w-[220px] pc:w-auto">
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls + " mb-0"}>Opacity</label>
                <span className="text-[12px] text-[#7D5B59] font-[600]">
                  {selected.opacity ?? 1}
                </span>
              </div>
              <input
                className="w-full accent-[#7D5B59]"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selected.opacity ?? 1}
                onChange={(e) => updateSelected({ opacity: Number(e.target.value) })}
              />
            </div>

            {/* Polygon / star geometry. Both are fabric Polygons — `shapeKind`
                is what says how their points should be rebuilt — so these only
                appear for shapes the editor knows how to reshape. Ratio (the
                inner radius as a % of the outer) is meaningless for a polygon,
                whose corners all sit on one circle, so it's star-only. */}
            {(selected.shapeKind === "polygon" || selected.shapeKind === "star") && (
              <div className="w-[220px] pc:w-auto">
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls + " mb-0"}>Count</label>
                  <input
                    className="w-[52px] rounded-[100px] px-[8px] py-[2px] text-[12px] text-[#7D5B59] font-[600] bg-[#F2E8E6B2] outline-none text-right"
                    type="number"
                    min={3}
                    max={30}
                    step={1}
                    value={selected.pointCount ?? 3}
                    onChange={(e) => updateSelected({ pointCount: Number(e.target.value) })}
                  />
                </div>
                <input
                  className="w-full accent-[#7D5B59]"
                  type="range"
                  min={3}
                  max={30}
                  step={1}
                  value={selected.pointCount ?? 3}
                  onChange={(e) => updateSelected({ pointCount: Number(e.target.value) })}
                />
              </div>
            )}

            {selected.shapeKind === "star" && (
              <div className="w-[220px] pc:w-auto">
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls + " mb-0"}>Ratio</label>
                  <span className="text-[12px] text-[#7D5B59] font-[600]">
                    {Math.round((selected.innerRatio ?? 38.2) * 10) / 10}%
                  </span>
                </div>
                <input
                  className="w-full accent-[#7D5B59]"
                  type="range"
                  min={1}
                  max={100}
                  step={0.1}
                  value={selected.innerRatio ?? 38.2}
                  onChange={(e) => updateSelected({ innerRatio: Number(e.target.value) })}
                />
              </div>
            )}

          </div>

          {/* ── Animation ──────────────────────────────────────── */}
          {/* Hidden for now — keep for later. */}
          {/* <div className={sectionCls}>
            <h5 className="hidden pc:block font-[600] text-[13px] text-[#7D5B59]">Animation</h5>
            <div>
              <label className={labelCls}>Preset</label>
              <select
                className={inputCls}
                value={selected.animation ?? "none"}
                onChange={(e) => {
                  const v = e.target.value;
                  updateSelected({ animation: v });
                  // Show a one-off preview of the choice on the editor canvas.
                  editorRef?.current?.previewAnimation?.(v);
                }}
              >
                <option value="none">None</option>
                <option value="fade-in">Fade In</option>
                <option value="slide-up">Slide Up</option>
                <option value="zoom-in">Zoom In</option>
                <option value="float">Float</option>
                <option value="pulse">Pulse</option>
              </select>
            </div>
            <button
              type="button"
              disabled={(selected.animation ?? "none") === "none"}
              onClick={() => editorRef?.current?.previewAnimation?.(selected.animation ?? "none")}
              className="w-full rounded-[10px] px-3 py-[6px] text-[12px] font-[600] bg-[#F2E8E6B2] text-[#7D5B59] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Preview
            </button>
            <p className="text-[11px] text-[#7D5B5980] font-[600]">
              Preview plays once here. Loops continuously in the published invitation.
            </p>
          </div> */}

          {/* ── Delete ───────────────────────────────────────────
              Phone puts this in the bubble bar as a trash icon instead — a
              full-width red bar would dominate the strip. */}
          <div className="hidden pc:block p-4">
            <button
              className="w-full py-2 bg-red-500 text-white rounded-[10px] text-[13px] font-[600]"
              onClick={() => editorRef?.current?.deleteActiveObject()}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      </div>
    </aside>
    </>
  );
}
