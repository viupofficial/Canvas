"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";

// Destructive image editor (MVP). Loads the selected image into its own Fabric
// preview canvas, applies Fabric filters + an optional crop rectangle live, and
// on Apply exports the result as a PNG dataURL. It never touches the main canvas,
// sidebar, or any shared state directly — the parent decides where the result goes
// via onApply, and Cancel closes without emitting anything.

export type FilterValues = {
  brightness: number; // -1..1  (fabric Brightness)
  contrast: number;   // -1..1  (fabric Contrast)
  saturation: number; // -1..1  (fabric Saturation)
  blur: number;       // 0..1   (fabric Blur)
  grayscale: boolean;
  invert: boolean;
  opacity: number;    // 0..1
};

export type CropValues = { active: boolean };

const DEFAULT_FILTERS: FilterValues = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  grayscale: false,
  invert: false,
  opacity: 1,
};

// Backstore size of the preview canvas. The image is fit/centred inside this box.
const PREVIEW_W = 480;
const PREVIEW_H = 380;

// Texture presets are painted onto a square offscreen canvas (white background +
// dark marks), then blended into the image with a "multiply" filter — so the
// texture only darkens existing pixels and transparent areas stay transparent.
// The mark opacity is the texture's intensity, baked in so the effect works even
// if the Fabric build's BlendImage lacks an alpha option.
const TEXTURE_SIZE = 512;
const TEXTURE_PRESETS = ["lines", "grid", "dots", "noise"] as const;
type TexturePreset = (typeof TEXTURE_PRESETS)[number] | "custom";

function paintPreset(ctx: CanvasRenderingContext2D, id: string, alpha: number) {
  const S = TEXTURE_SIZE;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#332626";
  ctx.fillStyle = "#332626";
  if (id === "lines") {
    ctx.lineWidth = 2;
    for (let x = -S; x < S; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, S);
      ctx.lineTo(x + S, 0);
      ctx.stroke();
    }
  } else if (id === "grid") {
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= S; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S);
      ctx.stroke();
    }
    for (let y = 0; y <= S; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(S, y);
      ctx.stroke();
    }
  } else if (id === "dots") {
    for (let y = 8; y < S; y += 18) {
      for (let x = 8; x < S; x += 18) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (id === "noise") {
    const count = Math.floor(S * S * 0.06);
    for (let i = 0; i < count; i++) {
      ctx.globalAlpha = alpha * Math.random();
      ctx.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6);
    }
  }
  ctx.restore();
}

function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] text-[#7D5B5980] font-[600]">{props.label}</label>
        <span className="text-[11px] text-[#7D5B59] font-[600]">
          {props.format ? props.format(props.value) : props.value}
        </span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-[#8C6B6B] cursor-pointer"
      />
    </div>
  );
}

function ToggleRow(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => props.onChange(!props.value)}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-[12px] font-[600] border transition-colors ${
        props.value
          ? "bg-[#8C6B6B] text-white border-[#8C6B6B]"
          : "bg-[#F2E8E6B2] text-[#7D5B59] border-[#EDE2DE] hover:bg-[#EDE2DE]"
      }`}
    >
      <span>{props.label}</span>
      <span className="text-[11px]">{props.value ? "On" : "Off"}</span>
    </button>
  );
}

export default function ImageEditorModal({
  imageSrc,
  startInCrop = false,
  onCancel,
  onApply,
}: {
  imageSrc: string;
  startInCrop?: boolean;
  onCancel: () => void;
  onApply: (dataUrl: string) => void;
}) {
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null);
  const fabricModuleRef = useRef<any>(null);
  const imgRef = useRef<any>(null);
  const cropRectRef = useRef<any>(null);
  // Displayed bounds of the image inside the preview canvas (for crop clamping/export).
  const imgBoxRef = useRef<{ left: number; top: number; width: number; height: number; scale: number }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    scale: 1,
  });

  const [ready, setReady] = useState(false);
  const [filterValues, setFilterValues] = useState<FilterValues>(DEFAULT_FILTERS);
  const [cropValues, setCropValues] = useState<CropValues>({ active: false });
  const [busy, setBusy] = useState(false);

  // ── Color (tint) ────────────────────────────────────────────────────────────
  const [tintColor, setTintColor] = useState<string>("#8c6b6b");
  const [tintAlpha, setTintAlpha] = useState<number>(0); // 0 = off (will auto-enable at 0.6 when color is picked)

  // ── Texture ──────────────────────────────────────────────────────────────────
  const [textureId, setTextureId] = useState<TexturePreset | null>(null);
  const [textureAlpha, setTextureAlpha] = useState<number>(0.4);
  const customTextureSrcRef = useRef<string | null>(null);
  const textureImgRef = useRef<any>(null);
  const [textureNonce, setTextureNonce] = useState(0); // bumps when textureImgRef changes
  const textureFileRef = useRef<HTMLInputElement>(null);

  // Build (or clear) the blend texture whenever the selection or intensity
  // changes, then bump a nonce so the live-filter effect re-applies it.
  const buildTexture = useCallback(async () => {
    const fabric = fabricModuleRef.current;
    if (!fabric) return;
    if (!textureId || textureAlpha <= 0) {
      textureImgRef.current = null;
      setTextureNonce((n) => n + 1);
      return;
    }
    const off = document.createElement("canvas");
    off.width = TEXTURE_SIZE;
    off.height = TEXTURE_SIZE;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    if (textureId === "custom" && customTextureSrcRef.current) {
      try {
        const im = new Image();
        im.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          im.onload = () => resolve();
          im.onerror = reject;
          im.src = customTextureSrcRef.current as string;
        });
        const pat = ctx.createPattern(im, "repeat");
        if (pat) {
          ctx.globalAlpha = textureAlpha;
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
          ctx.globalAlpha = 1;
        }
      } catch {
        /* bad upload — leave texture white (no effect) */
      }
    } else if (textureId !== "custom") {
      paintPreset(ctx, textureId, textureAlpha);
    }

    try {
      textureImgRef.current = await fabric.Image.fromURL(off.toDataURL("image/png"));
    } catch {
      textureImgRef.current = null;
    }
    setTextureNonce((n) => n + 1);
  }, [textureId, textureAlpha]);

  useEffect(() => {
    if (!ready) return;
    buildTexture();
  }, [buildTexture, ready]);

  const handleTextureUpload = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      customTextureSrcRef.current = String(reader.result || "");
      setTextureId("custom");
      if (textureAlpha <= 0) setTextureAlpha(0.4);
    };
    reader.readAsDataURL(file);
  };

  // ── Init the preview canvas and load the source image ──────────────────────
  useEffect(() => {
    if (!canvasEl.current) return;
    let mounted = true;

    (async () => {
      const mod = await import("fabric");
      if (!mounted) return;
      const fabric = ((mod as any).fabric ?? (mod as any).default ?? mod) as any;
      fabricModuleRef.current = fabric;

      const canvas = new fabric.Canvas(canvasEl.current, {
        backgroundColor: "", // transparent so opacity/crop export keeps alpha
        selection: false,
        preserveObjectStacking: true,
      });
      canvas.setDimensions({ width: PREVIEW_W, height: PREVIEW_H });
      fabricRef.current = canvas;

      const imgOpts = imageSrc.startsWith("data:") ? undefined : { crossOrigin: "anonymous" };
      try {
        const img = await fabric.Image.fromURL(imageSrc, imgOpts);
        if (!mounted) return;
        const nW = img.width || 1;
        const nH = img.height || 1;
        // Never upscale in the preview — keeps the exported result at (or below)
        // the source resolution rather than blowing small images up.
        const scale = Math.min((PREVIEW_W * 0.92) / nW, (PREVIEW_H * 0.92) / nH, 1);
        const dispW = nW * scale;
        const dispH = nH * scale;
        const left = (PREVIEW_W - dispW) / 2;
        const top = (PREVIEW_H - dispH) / 2;
        img.set({
          left,
          top,
          originX: "left",
          originY: "top",
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
        });
        imgBoxRef.current = { left, top, width: dispW, height: dispH, scale };
        imgRef.current = img;
        canvas.add(img);
        canvas.requestRenderAll();
        setReady(true);
        if (startInCrop) toggleCrop(true);
      } catch (err) {
        console.error("[ImageEditor] failed to load image", err);
      }
    })();

    return () => {
      mounted = false;
      const c = fabricRef.current;
      if (c) {
        try {
          c.dispose();
        } catch {}
        fabricRef.current = null;
      }
      imgRef.current = null;
      cropRectRef.current = null;
      fabricModuleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  // ── Live filter application ─────────────────────────────────────────────────
  useEffect(() => {
    const fabric = fabricModuleRef.current;
    const canvas = fabricRef.current;
    const img = imgRef.current;
    if (!fabric || !canvas || !img || !ready) return;

    const F = fabric.filters ?? (fabric.Image && fabric.Image.filters);
    if (!F) return;

    const filters: any[] = [];
    if (filterValues.brightness !== 0) filters.push(new F.Brightness({ brightness: filterValues.brightness }));
    if (filterValues.contrast !== 0) filters.push(new F.Contrast({ contrast: filterValues.contrast }));
    if (filterValues.saturation !== 0) filters.push(new F.Saturation({ saturation: filterValues.saturation }));
    if (filterValues.blur !== 0) filters.push(new F.Blur({ blur: filterValues.blur }));
    if (filterValues.grayscale) filters.push(new F.Grayscale());
    if (filterValues.invert) filters.push(new F.Invert());
    // Color tint — blends the chosen colour into the image by tintAlpha.
    if (tintAlpha > 0 && F.BlendColor) {
      filters.push(new F.BlendColor({ color: tintColor, mode: "tint", alpha: tintAlpha }));
    }
    // Texture — multiply the prepared texture onto the image (preserves alpha).
    if (textureImgRef.current && F.BlendImage) {
      filters.push(new F.BlendImage({ image: textureImgRef.current, mode: "multiply" }));
    }

    img.filters = filters;
    try {
      img.applyFilters();
    } catch (err) {
      console.error("[ImageEditor] applyFilters failed", err);
    }
    img.set("opacity", filterValues.opacity);
    canvas.requestRenderAll();
  }, [filterValues, ready, tintColor, tintAlpha, textureNonce]);

  const toggleCrop = useCallback((next: boolean) => {
    const fabric = fabricModuleRef.current;
    const canvas = fabricRef.current;
    if (!fabric || !canvas) return;

    if (next) {
      if (cropRectRef.current) return;
      const box = imgBoxRef.current;
      const rect = new fabric.Rect({
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        originX: "left",
        originY: "top",
        fill: "rgba(140,107,107,0.12)",
        stroke: "#8C6B6B",
        strokeDashArray: [5, 5],
        strokeWidth: 1.5,
        strokeUniform: true,
        cornerColor: "#8C6B6B",
        cornerStyle: "circle",
        transparentCorners: false,
        lockRotation: true,
        hasRotatingPoint: false,
      });
      rect.setControlsVisibility?.({ mtr: false });
      cropRectRef.current = rect;
      canvas.add(rect);
      canvas.setActiveObject(rect);
      canvas.requestRenderAll();
    } else {
      if (cropRectRef.current) {
        canvas.remove(cropRectRef.current);
        cropRectRef.current = null;
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    }
    setCropValues({ active: next });
  }, []);

  const handleReset = useCallback(() => {
    setFilterValues(DEFAULT_FILTERS);
    setTintAlpha(0);
    setTintColor("#8c6b6b");
    setTextureId(null);
    setTextureAlpha(0.4);
    customTextureSrcRef.current = null;
    textureImgRef.current = null;
    setTextureNonce((n) => n + 1);
    toggleCrop(false);
  }, [toggleCrop]);

  const handleApply = useCallback(() => {
    const canvas = fabricRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    setBusy(true);

    const box = imgBoxRef.current;
    // Round to avoid floating-point precision issues when exporting
    let region = {
      left: Math.round(box.left * 10) / 10,
      top: Math.round(box.top * 10) / 10,
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10,
    };

    const cropRect = cropRectRef.current;
    if (cropRect) {
      const br = cropRect.getBoundingRect();
      const l = Math.max(br.left, box.left);
      const t = Math.max(br.top, box.top);
      const r = Math.min(br.left + br.width, box.left + box.width);
      const b = Math.min(br.top + br.height, box.top + box.height);
      region = {
        left: l,
        top: t,
        width: Math.max(1, r - l),
        height: Math.max(1, b - t),
      };
      // Hide the crop guide so it isn't baked into the exported pixels.
      cropRect.visible = false;
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }

    let dataUrl = "";
    try {
      dataUrl = canvas.toDataURL({
        format: "png",
        left: Math.round(region.left),
        top: Math.round(region.top),
        width: Math.round(region.width),
        height: Math.round(region.height),
        // Upscale back toward the original resolution (preview is fit-scaled down).
        multiplier: 1 / (box.scale || 1),
      });
      console.log("[ImageEditor] export successful, dataUrl length:", dataUrl.length);
    } catch (err) {
      console.error("[ImageEditor] export failed", err);
      setBusy(false);
      alert("Could not export the edited image (the source may be cross-origin).");
      if (cropRect) {
        cropRect.visible = true;
        canvas.requestRenderAll();
      }
      return;
    }

    console.log("[ImageEditor] applying edited image, calling onApply with dataUrl");
    onApply(dataUrl);
  }, [onApply]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Image editor"
      onMouseDown={(e) => {
        // Click on the backdrop (not the panel) cancels.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[860px] max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#EDE2DE]">
          <h2 className="text-[16px] font-bold text-[#191212]">Edit Image</h2>
          <button
            onClick={onCancel}
            aria-label="Close image editor"
            className="text-[#7D5B59] hover:text-[#191212] text-xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4 p-5 overflow-y-auto">
          {/* Preview */}
          <div className="flex-1 min-w-0 flex items-center justify-center bg-[#F7F2F0] rounded-lg p-3">
            <div
              className="relative"
              style={{
                width: PREVIEW_W,
                height: PREVIEW_H,
                maxWidth: "100%",
                backgroundImage:
                  "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
              }}
            >
              <canvas ref={canvasEl} />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-[#7D5B59]">
                  Loading image…
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="w-full md:w-64 shrink-0 flex flex-col gap-3">
            <ToggleRow
              label="Crop"
              value={cropValues.active}
              onChange={(v) => toggleCrop(v)}
            />
            {cropValues.active && (
              <p className="text-[10px] text-[#7D5B5980] -mt-1">
                Drag the handles to set the crop region, then Apply.
              </p>
            )}

            <SliderRow
              label="Brightness"
              value={filterValues.brightness}
              min={-1}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}`}
              onChange={(v) => setFilterValues((p) => ({ ...p, brightness: v }))}
            />
            <SliderRow
              label="Contrast"
              value={filterValues.contrast}
              min={-1}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}`}
              onChange={(v) => setFilterValues((p) => ({ ...p, contrast: v }))}
            />
            <SliderRow
              label="Saturation"
              value={filterValues.saturation}
              min={-1}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}`}
              onChange={(v) => setFilterValues((p) => ({ ...p, saturation: v }))}
            />
            <SliderRow
              label="Blur"
              value={filterValues.blur}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}`}
              onChange={(v) => setFilterValues((p) => ({ ...p, blur: v }))}
            />
            <SliderRow
              label="Opacity"
              value={filterValues.opacity}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => setFilterValues((p) => ({ ...p, opacity: v }))}
            />

            <div className="flex gap-2">
              <ToggleRow
                label="Grayscale"
                value={filterValues.grayscale}
                onChange={(v) => setFilterValues((p) => ({ ...p, grayscale: v }))}
              />
            </div>
            <div className="flex gap-2">
              <ToggleRow
                label="Invert"
                value={filterValues.invert}
                onChange={(v) => setFilterValues((p) => ({ ...p, invert: v }))}
              />
            </div>

            {/* Color tint */}
            <div className="pt-1 border-t border-[#EDE2DE]">
              <div className="flex items-center justify-between mb-2 mt-2">
                <label className="text-[11px] text-[#7D5B5980] font-[600]">Color Overlay</label>
                <label
                  className="relative inline-flex items-center justify-center w-6 h-6 rounded border border-[#EDE2DE] cursor-pointer overflow-hidden"
                  title="Pick tint color"
                >
                  <span aria-hidden className="absolute inset-0" style={{ backgroundColor: tintColor }} />
                  <input
                    type="color"
                    value={tintColor}
                    onChange={(e) => {
                      setTintColor(e.target.value);
                      if (tintAlpha <= 0) setTintAlpha(0.6);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </div>
              <SliderRow
                label="Color intensity"
                value={tintAlpha}
                min={0}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setTintAlpha(v)}
              />
            </div>

            {/* Texture */}
            <div className="pt-2 border-t border-[#EDE2DE]">
              <label className="text-[11px] text-[#7D5B5980] font-[600]">Texture</label>
              <input
                ref={textureFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleTextureUpload(e.target.files?.[0])}
              />
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setTextureId(null)}
                  className={`px-2 py-1.5 rounded-[8px] text-[11px] font-[600] border capitalize transition-colors ${
                    textureId === null
                      ? "bg-[#8C6B6B] text-white border-[#8C6B6B]"
                      : "bg-[#F2E8E6B2] text-[#7D5B59] border-[#EDE2DE] hover:bg-[#EDE2DE]"
                  }`}
                >
                  None
                </button>
                {TEXTURE_PRESETS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setTextureId(id);
                      if (textureAlpha <= 0) setTextureAlpha(0.4);
                    }}
                    className={`px-2 py-1.5 rounded-[8px] text-[11px] font-[600] border capitalize transition-colors ${
                      textureId === id
                        ? "bg-[#8C6B6B] text-white border-[#8C6B6B]"
                        : "bg-[#F2E8E6B2] text-[#7D5B59] border-[#EDE2DE] hover:bg-[#EDE2DE]"
                    }`}
                  >
                    {id}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => textureFileRef.current?.click()}
                  className={`px-2 py-1.5 rounded-[8px] text-[11px] font-[600] border transition-colors ${
                    textureId === "custom"
                      ? "bg-[#8C6B6B] text-white border-[#8C6B6B]"
                      : "bg-[#F2E8E6B2] text-[#7D5B59] border-[#EDE2DE] hover:bg-[#EDE2DE]"
                  }`}
                >
                  Upload
                </button>
              </div>
              {textureId && (
                <div className="mt-2">
                  <SliderRow
                    label="Texture strength"
                    value={textureAlpha}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => setTextureAlpha(v)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#EDE2DE]">
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-[10px] text-[13px] font-[600] bg-[#F2E8E6B2] text-[#7D5B59] border border-[#EDE2DE] hover:bg-[#EDE2DE]"
          >
            Reset
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-[10px] text-[13px] font-[600] bg-white text-[#7D5B59] border border-[#EDE2DE] hover:bg-[#F2E8E6B2]"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!ready || busy}
              className="px-5 py-2 rounded-[10px] text-[13px] font-[600] bg-[#8C6B6B] text-white hover:opacity-90 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
