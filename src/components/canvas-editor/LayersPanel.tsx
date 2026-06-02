"use client";

import React from "react";
import type { EditorHandle, LayerInfo } from "@/src/components/CanvasEditor";
import {
  ChevronUp,
  ChevronDown,
  ArrowUpToLine,
  ArrowDownToLine,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Type,
  Image as ImageIcon,
  Square,
  Circle as CircleIcon,
  Triangle as TriangleIcon,
  Shapes,
} from "lucide-react";

// Pick a small leading icon for a layer based on its Fabric type.
function LayerTypeIcon({ type, isImage }: { type: string; isImage: boolean }) {
  const cls = "shrink-0 text-[#7D5B59]";
  const t = (type ?? "").toLowerCase();
  if (isImage) return <ImageIcon size={15} className={cls} />;
  if (t === "textbox" || t === "text" || t === "i-text") return <Type size={15} className={cls} />;
  if (t === "rect") return <Square size={15} className={cls} />;
  if (t === "circle" || t === "ellipse") return <CircleIcon size={15} className={cls} />;
  if (t === "triangle") return <TriangleIcon size={15} className={cls} />;
  return <Shapes size={15} className={cls} />;
}

/**
 * Inspector "Layers" tab. Renders the active page's Fabric objects as a layer
 * list (top-most first, Figma/Canva style) and drives stacking order, selection,
 * visibility, lock, and delete through the shared EditorHandle.
 *
 * The list is fully scoped to the active page: the canvas only ever holds the
 * current page's objects, so switching pages naturally re-scopes the list.
 */
export default function LayersPanel(props: {
  layers: LayerInfo[];
  activeLayerId: string | null;
  editorRef?: React.RefObject<EditorHandle | null>;
}) {
  const { layers, activeLayerId, editorRef } = props;
  const handle = () => editorRef?.current ?? null;

  // Canvas order is bottom→top; display top-most first like every design tool.
  const display = [...layers].reverse();

  if (!display.length) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        No layers on this page yet. Add text, an image, or a shape to see it here.
      </div>
    );
  }

  const iconBtn =
    "shrink-0 h-7 w-7 rounded-[8px] flex items-center justify-center text-[#7D5B59] hover:bg-[#EDE2DE] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors";

  return (
    <div className="flex flex-col gap-1 p-2">
      {display.map((layer, i) => {
        const isActive = layer.id === activeLayerId;
        const isTop = i === 0;
        const isBottom = i === display.length - 1;
        return (
          <div
            key={layer.id}
            className={`group rounded-[10px] border px-2 py-1.5 ${
              isActive
                ? "bg-[#F2E8E6] border-[#7D5B59]"
                : "bg-[#F2E8E6B2] border-[#EDE2DE] hover:border-[#7D5B59]/40"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {/* Show / hide */}
              <button
                type="button"
                className={iconBtn}
                title={layer.visible ? "Hide layer" : "Show layer"}
                aria-label={layer.visible ? "Hide layer" : "Show layer"}
                onClick={() => handle()?.toggleLayerVisibility(layer.id)}
              >
                {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>

              {/* Select */}
              <button
                type="button"
                className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                disabled={layer.locked}
                title={layer.locked ? `${layer.label} (locked)` : layer.label}
                onClick={() => handle()?.selectLayer(layer.id)}
              >
                <LayerTypeIcon type={layer.type} isImage={layer.isImage} />
                <span
                  className={`truncate text-[13px] font-[600] ${
                    layer.visible ? "text-[#7D5B59]" : "text-[#7D5B59]/40 line-through"
                  }`}
                >
                  {layer.label}
                </span>
              </button>

              {/* Lock / unlock */}
              <button
                type="button"
                className={iconBtn}
                title={layer.locked ? "Unlock layer" : "Lock layer"}
                aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                onClick={() => handle()?.toggleLayerLock(layer.id)}
              >
                {layer.locked ? <Lock size={15} /> : <Unlock size={15} />}
              </button>

              {/* Delete */}
              <button
                type="button"
                className="shrink-0 h-7 w-7 rounded-[8px] flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                title="Delete layer"
                aria-label="Delete layer"
                onClick={() => handle()?.deleteLayer(layer.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Ordering controls */}
            <div className="mt-1 flex items-center justify-end gap-1">
              <button
                type="button"
                className={iconBtn}
                title="Send to back"
                aria-label="Send to back"
                disabled={isBottom}
                onClick={() => handle()?.moveLayerToBack(layer.id)}
              >
                <ArrowDownToLine size={14} />
              </button>
              <button
                type="button"
                className={iconBtn}
                title="Move down"
                aria-label="Move down"
                disabled={isBottom}
                onClick={() => handle()?.moveLayerDown(layer.id)}
              >
                <ChevronDown size={15} />
              </button>
              <button
                type="button"
                className={iconBtn}
                title="Move up"
                aria-label="Move up"
                disabled={isTop}
                onClick={() => handle()?.moveLayerUp(layer.id)}
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                className={iconBtn}
                title="Bring to front"
                aria-label="Bring to front"
                disabled={isTop}
                onClick={() => handle()?.moveLayerToFront(layer.id)}
              >
                <ArrowUpToLine size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
