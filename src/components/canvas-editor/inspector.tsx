// updated
import React from "react";

// Parse any CSS color (hex3/6/8, rgb, rgba) into { hex, opacity 0-100 }.
function parseColor(color: string | undefined | null, defaultHex = '#000000'): { hex: string; opacity: number } {
  if (!color) return { hex: defaultHex, opacity: 100 };
  const rgba = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) {
    const r = parseInt(rgba[1]), g = parseInt(rgba[2]), b = parseInt(rgba[3]);
    const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1;
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    return { hex, opacity: Math.round(a * 100) };
  }
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    const a = parseInt(color.slice(7, 9), 16) / 255;
    return { hex: color.slice(0, 7), opacity: Math.round(a * 100) };
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return { hex: color, opacity: 100 };
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const h = '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    return { hex: h, opacity: 100 };
  }
  return { hex: defaultHex, opacity: 100 };
}

// Combine a 6-digit hex and opacity (0-100) into an rgba() string (or plain hex when fully opaque).
function buildRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.max(0, Math.min(100, opacity)) / 100;
  return a >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${a})`;
}

/*************  ✨ Windsurf Command 🌟  *************/
/**
 * Inspector component
 * @param {{ selected: any | null; updateSelected: (patch: Record<string, any>) => void; }}
 * @returns {JSX.Element}
 */
export default function Inspector(props: {
  selected: any | null;
  updateSelected: (patch: Record<string, any>) => void;
  editorRef?: React.RefObject<any>;
}) {
  const { selected, updateSelected, editorRef } = props;
  const [showTextStyles, setShowTextStyles] = React.useState(false);

  const TEXT_STYLES = [
    { name: 'Heading', fontSize: 48, fontWeight: 'bold' },
    { name: 'Subheading', fontSize: 28, fontWeight: '600' },
    { name: 'Body', fontSize: 16, fontWeight: 'normal' },
  ];

  const inputCls =
    "w-full rounded-[100px] px-[10px] py-[6px] text-[13px] text-[#7D5B59] font-[600] bg-[#F2E8E6B2] outline-none";
  const labelCls = "block text-[11px] text-[#7D5B5980] font-[600] mb-1";
  const sectionCls =
    "flex flex-col gap-3 border-b-[1px] border-[#EDE2DE] pb-4 p-4";

  const bgParsed = parseColor(selected?.backgroundColor, '#F8F7F6');
  const strokeParsed = parseColor(selected?.stroke, '#F8F7F6');

  return (
    <aside className="w-80 bg-brand-cream border-[#EDE2DE] border-[1px] overflow-y-auto h-full">
      <div className="border-b-[1px] border-[#EDE2DE] pb-3 p-4">
        <h3 className="font-[600] text-[20px] capitalize">{selected?.type ?? "Inspector"}</h3>
      </div>

      {!selected ? (
        <div className="p-4 text-sm text-neutral-500">Select an element to customize it</div>
      ) : (
        <div className="flex flex-col">
          {/* ── Position ───────────────────────────────────────── */}
          <div className={sectionCls}>
            <h5 className="font-[600] text-[13px] text-[#7D5B59]">Position</h5>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Top</label>
                <input
                  className={inputCls}
                  type="number"
                  value={Math.round(selected.top ?? 0)}
                  onChange={(e) => updateSelected({ top: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Bottom</label>
                <input
                  className={inputCls}
                  type="number"
                  value={Math.round(selected.bottom ?? 0)}
                  onChange={(e) => updateSelected({ bottom: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Left</label>
                <input
                  className={inputCls}
                  type="number"
                  value={Math.round(selected.left ?? 0)}
                  onChange={(e) => updateSelected({ left: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Right</label>
                <input
                  className={inputCls}
                  type="number"
                  value={Math.round(selected.right ?? 0)}
                  onChange={(e) => updateSelected({ right: Number(e.target.value) })}
                />
              </div>
              {/* Width / Height — drive Fabric's scaleX/scaleY so the displayed
                  size in the canvas matches the input. Mirrors the same pattern
                  used in the phone-preview compact panel. */}
              <div>
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
                    updateSelected({ scaleX: w / base });
                  }}
                />
              </div>
              <div>
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
                    updateSelected({ scaleY: h / base });
                  }}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Layer Order</label>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-[10px] px-3 py-[6px] text-[12px] font-[600] bg-[#F2E8E6B2] text-[#7D5B59]"
                  onClick={() => editorRef?.current?.bringForward()}
                >
                  Bring Forward
                </button>
                <button
                  className="flex-1 rounded-[10px] px-3 py-[6px] text-[12px] font-[600] bg-[#F2E8E6B2] text-[#7D5B59]"
                  onClick={() => editorRef?.current?.sendBack()}
                >
                  Send Back
                </button>
              </div>
            </div>
          </div>

          {/* ── Typography ─────────────────────────────────────── */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between relative">
              <h5 className="font-[600] text-[13px] text-[#7D5B59]">Typography</h5>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Font Family</label>
                <select
                  className={inputCls}
                  value={selected.fontFamily ?? "Arial"}
                  onChange={(e) => updateSelected({ fontFamily: e.target.value })}
                >
                  {[
                    "Arial",
                    "Times New Roman",
                    "Georgia",
                    "Poppins",
                    "Montserrat",
                    "Roboto",
                    "Inter",
                    "Open Sans",
                    "Playfair Display",
                    "Pacifico",
                    "Alex Brush",
                    "Lato",
                    "Oswald",
                  ].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Weight</label>
                <select
                  className={inputCls}
                  value={selected.fontWeight ?? "normal"}
                  onChange={(e) => updateSelected({ fontWeight: e.target.value })}
                >
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Font Size</label>
                <input
                  className={inputCls}
                  type="number"
                  value={selected.fontSize ?? 24}
                  onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })}
                />
              </div>
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
            <div>
              <label className={labelCls}>Letter Spacing</label>
              <input
                className={inputCls}
                type="number"
                step="1"
                value={selected.charSpacing ?? 0}
                onChange={(e) => updateSelected({ charSpacing: Number(e.target.value) })}
              />
            </div>

            {/* Text align buttons */}
            <div>
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

            {/* Text shadow toggle */}
            <div className="flex items-center justify-between">
              <label className={labelCls + " mb-0"}>Text Shadow</label>
              <button
                className={`px-3 py-[5px] rounded-[8px] text-[12px] font-[600] border border-[#EDE2DE] ${
                  selected.shadow ? "bg-[#7D5B59] text-white" : "bg-[#F2E8E6B2] text-[#7D5B59]"
                }`}
                onClick={() =>
                  updateSelected({
                    shadow: selected.shadow
                      ? null
                      : { color: "#00000040", blur: 4, offsetX: 2, offsetY: 2 },
                  })
                }
              >
                {selected.shadow ? "On" : "Off"}
              </button>
            </div>

            {/* Style buttons: I S U */}
            <div className="flex gap-2">
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

            {/* Fill color */}
            <div>
              <label className={labelCls}>Fill</label>
              <div className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2">
                <label
                  className="relative inline-block w-6 h-6 rounded-[5px] border border-[#EDE2DE] cursor-pointer overflow-hidden shrink-0"
                  style={{ backgroundColor: selected.fill ?? "#000000" }}
                >
                  <input
                    type="color"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    value={selected.fill ?? "#000000"}
                    onChange={(e) => updateSelected({ fill: e.target.value })}
                  />
                </label>
                <input
                  className="flex-1 min-w-0 bg-transparent outline-none uppercase tracking-tight font-[600] text-[13px] leading-none text-[#7D5B59]"
                  value={(selected.fill ?? "#000000").replace("#", "").toUpperCase()}
                  onChange={(e) => updateSelected({ fill: "#" + e.target.value.replace("#", "") })}
                  maxLength={6}
                />
                <div className="w-[2px] self-stretch -my-2 bg-white shrink-0 ml-auto" />
                <div className="flex items-baseline gap-0.5 shrink-0 pl-1">
                  <input
                    className="w-[32px] bg-transparent outline-none text-right font-[600] text-[16px] leading-none text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round((selected.opacity ?? 1) * 100)}
                    onChange={(e) =>
                      updateSelected({ opacity: Number(e.target.value) / 100 })
                    }
                  />
                  <span className="font-[600] text-[16px] leading-none text-[#B98587]">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Element Style ──────────────────────────────────── */}
          <div className={sectionCls}>
            <h5 className="font-[600] text-[13px] text-[#7D5B59]">Element Style</h5>

            <div>
              <label className={labelCls}>Background Color</label>
              <div className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2">
                <label
                  className="relative inline-block w-6 h-6 rounded-[5px] border border-[#EDE2DE] cursor-pointer overflow-hidden shrink-0"
                  style={{ backgroundColor: bgParsed.hex }}
                >
                  <input
                    type="color"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    value={bgParsed.hex}
                    onChange={(e) => updateSelected({ backgroundColor: buildRgba(e.target.value, bgParsed.opacity) })}
                  />
                </label>
                <input
                  className="flex-1 min-w-0 bg-transparent outline-none uppercase tracking-tight font-[600] text-[13px] leading-none text-[#7D5B59]"
                  value={bgParsed.hex.replace("#", "").toUpperCase()}
                  onChange={(e) => {
                    const hex = e.target.value.replace("#", "");
                    if (/^[0-9a-fA-F]{6}$/.test(hex))
                      updateSelected({ backgroundColor: buildRgba("#" + hex, bgParsed.opacity) });
                  }}
                  maxLength={6}
                />
                <div className="w-[2px] self-stretch -my-2 bg-white shrink-0 ml-auto" />
                <div className="flex items-baseline gap-0.5 shrink-0 pl-1">
                  <input
                    className="w-[32px] bg-transparent outline-none text-right font-[600] text-[16px] leading-none text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    min={0}
                    max={100}
                    value={bgParsed.opacity}
                    onChange={(e) => updateSelected({ backgroundColor: buildRgba(bgParsed.hex, Number(e.target.value)) })}
                  />
                  <span className="font-[600] text-[16px] leading-none text-[#B98587]">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Corner Radius ──────────────────────────────────── */}
          <div className={sectionCls}>
            <h5 className="font-[600] text-[13px] text-[#7D5B59]">Corner Radius</h5>
            <div className="grid grid-cols-2 gap-3">
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

          {/* ── Border ─────────────────────────────────────────── */}
          <div className={sectionCls}>
            <h5 className="font-[600] text-[13px] text-[#7D5B59]">Border</h5>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Width</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={selected.strokeWidth ?? 0}
                  onChange={(e) => updateSelected({ strokeWidth: Number(e.target.value) })}
                />
              </div>
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

            <div>
              <label className={labelCls}>Color</label>
              <div className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2">
                <label
                  className="relative inline-block w-6 h-6 rounded-[5px] border border-[#EDE2DE] cursor-pointer overflow-hidden shrink-0"
                  style={{ backgroundColor: strokeParsed.hex }}
                >
                  <input
                    type="color"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    value={strokeParsed.hex}
                    onChange={(e) => updateSelected({ stroke: buildRgba(e.target.value, strokeParsed.opacity) })}
                  />
                </label>
                <input
                  className="flex-1 min-w-0 bg-transparent outline-none uppercase tracking-tight font-[600] text-[13px] leading-none text-[#7D5B59]"
                  value={strokeParsed.hex.replace("#", "").toUpperCase()}
                  onChange={(e) => {
                    const hex = e.target.value.replace("#", "");
                    if (/^[0-9a-fA-F]{6}$/.test(hex))
                      updateSelected({ stroke: buildRgba("#" + hex, strokeParsed.opacity) });
                  }}
                  maxLength={6}
                />
                <div className="w-[2px] self-stretch -my-2 bg-white shrink-0 ml-auto" />
                <div className="flex items-baseline gap-0.5 shrink-0 pl-1">
                  <input
                    className="w-[32px] bg-transparent outline-none text-right font-[600] text-[16px] leading-none text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    min={0}
                    max={100}
                    value={strokeParsed.opacity}
                    onChange={(e) => updateSelected({ stroke: buildRgba(strokeParsed.hex, Number(e.target.value)) })}
                  />
                  <span className="font-[600] text-[16px] leading-none text-[#B98587]">%</span>
                </div>
              </div>
            </div>

            <div>
              <label className={labelCls}>Box Shadow</label>
              <input
                className={inputCls}
                placeholder="e.g. 2px 2px 8px #0002"
                value={selected.boxShadow ?? ""}
                onChange={(e) => updateSelected({ boxShadow: e.target.value })}
              />
            </div>

            <div>
              <label className={labelCls}>Background</label>
              <input
                className={inputCls}
                placeholder="e.g. linear-gradient(...)"
                value={selected.backgroundGradient ?? ""}
                onChange={(e) => updateSelected({ backgroundGradient: e.target.value })}
              />
            </div>
          </div>

          {/* ── Appearance ─────────────────────────────────────── */}
          <div className={sectionCls}>
            <h5 className="font-[600] text-[13px] text-[#7D5B59]">Appearance</h5>

            <div>
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

            <div>
              <label className={labelCls}>Transition</label>
              <input
                className={inputCls}
                placeholder="e.g. all 0.3s ease"
                value={selected.transition ?? ""}
                onChange={(e) => updateSelected({ transition: e.target.value })}
              />
            </div>

            <div>
              <label className={labelCls}>Transform</label>
              <input
                className={inputCls}
                placeholder="e.g. rotate(45deg)"
                value={selected.cssTransform ?? ""}
                onChange={(e) => updateSelected({ cssTransform: e.target.value })}
              />
            </div>
          </div>

          {/* ── Delete ─────────────────────────────────────────── */}
          <div className="p-4">
            <button
              className="w-full py-2 bg-red-500 text-white rounded-[10px] text-[13px] font-[600]"
              onClick={() => editorRef?.current?.deleteActiveObject()}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
