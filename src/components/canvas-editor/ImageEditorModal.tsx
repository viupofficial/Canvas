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

    img.filters = filters;
    try {
      img.applyFilters();
    } catch (err) {
      console.error("[ImageEditor] applyFilters failed", err);
    }
    img.set("opacity", filterValues.opacity);
    canvas.requestRenderAll();
  }, [filterValues, ready]);

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
    toggleCrop(false);
  }, [toggleCrop]);

  const handleApply = useCallback(() => {
    const canvas = fabricRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    setBusy(true);

    const box = imgBoxRef.current;
    let region = { left: box.left, top: box.top, width: box.width, height: box.height };

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
        left: region.left,
        top: region.top,
        width: region.width,
        height: region.height,
        // Upscale back toward the original resolution (preview is fit-scaled down).
        multiplier: 1 / (box.scale || 1),
      });
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
