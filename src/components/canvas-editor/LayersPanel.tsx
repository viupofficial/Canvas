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
  Pencil,
  Type,
  Image as ImageIcon,
  Square,
  Circle as CircleIcon,
  Triangle as TriangleIcon,
  Star as StarIcon,
  PenTool,
  Shapes,
  GripVertical,
} from "lucide-react";

// Pick a small leading icon for a layer based on its Fabric type.
function LayerTypeIcon({ type, isImage, shapeKind }: { type: string; isImage: boolean; shapeKind?: string }) {
  const cls = "shrink-0 text-[#7D5B59]";
  const t = (type ?? "").toLowerCase();
  if (isImage) return <ImageIcon size={15} className={cls} />;
  if (t === "textbox" || t === "text" || t === "i-text") return <Type size={15} className={cls} />;
  if (t === "rect") return <Square size={15} className={cls} />;
  if (t === "circle" || t === "ellipse") return <CircleIcon size={15} className={cls} />;
  // Stars and polygons are both fabric Polygons — only shapeKind separates them.
  if (shapeKind === "star") return <StarIcon size={15} className={cls} />;
  if (t === "path") return <PenTool size={15} className={cls} />;
  if (t === "triangle" || shapeKind === "polygon") return <TriangleIcon size={15} className={cls} />;
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

  // Inline layer-title editing: `editingId` is the layer whose name is being
  // edited, `draft` holds the in-progress text.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setDraft(current);
  };
  const commitRename = () => {
    if (editingId) handle()?.renameLayer(editingId, draft);
    setEditingId(null);
  };
  const cancelRename = () => setEditingId(null);

  // Drag-and-drop reordering state. `draggingId` is the layer being dragged;
  // `dropIndex` is the display-space slot the drop indicator sits before.
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);

  // Canvas order is bottom→top; display top-most first like every design tool.
  const display = [...layers].reverse();

  // Translate a display-space drop slot into a Fabric canvas index and apply it.
  // Display index 0 is top-most (canvas index n-1), so the mapping is inverted.
  const commitDrop = (id: string, targetDisplayIndex: number) => {
    const n = layers.length;
    const from = display.findIndex((l) => l.id === id);
    if (from < 0) return;
    // When dragging downward the removed row shifts everything above the drop
    // slot up by one, so account for that before inverting to canvas space.
    let to = targetDisplayIndex;
    if (to > from) to -= 1;
    if (to === from) return;
    handle()?.moveLayerTo(id, n - 1 - to);
  };

  const onDragOverRow = (e: React.DragEvent, index: number) => {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Drop above or below the hovered row depending on cursor position.
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    setDropIndex(after ? index + 1 : index);
  };

  if (!display.length) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        No layers on this page yet. Add text, an image, or a shape to see it here.
      </div>
    );
  }

  const iconBtn =
    "shrink-0 h-7 w-7 rounded-[8px] flex items-center justify-center text-[#7D5B59] hover:bg-[#EDE2DE] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors";

  const dropLine = (
    <div className="h-0.5 -my-0.5 rounded-full bg-[#7D5B59]" />
  );

  return (
    <div
      className="flex flex-col gap-1 p-2"
      onDragOver={(e) => {
        // Allow dropping past the last row (into the bottom slot).
        if (draggingId) e.preventDefault();
      }}
    >
      {display.map((layer, i) => {
        const isActive = layer.id === activeLayerId;
        const isTop = i === 0;
        const isBottom = i === display.length - 1;
        const isDragging = layer.id === draggingId;
        const canDrag = editingId !== layer.id && !layer.locked;
        return (
          <React.Fragment key={layer.id}>
            {dropIndex === i && dropLine}
            <div
              draggable={canDrag}
              onDragStart={(e) => {
                if (!canDrag) return;
                setDraggingId(layer.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", layer.id);
              }}
              onDragOver={(e) => onDragOverRow(e, i)}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId && dropIndex != null) commitDrop(draggingId, dropIndex);
                setDraggingId(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDropIndex(null);
              }}
              className={`group rounded-[10px] border px-2 py-1.5 transition-opacity ${
                isDragging ? "opacity-40" : ""
              } ${
                isActive
                  ? "bg-[#F2E8E6] border-[#7D5B59]"
                  : "bg-[#F2E8E6B2] border-[#EDE2DE] hover:border-[#7D5B59]/40"
              }`}
            >
            <div className="flex items-center gap-1.5">
              {/* Drag handle */}
              <span
                className={`shrink-0 flex items-center justify-center text-[#7D5B59]/60 ${
                  canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-30"
                }`}
                title={canDrag ? "Drag to reorder" : "Unlock to reorder"}
                aria-label="Drag to reorder"
              >
                <GripVertical size={15} />
              </span>

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

              {/* Select / rename */}
              {editingId === layer.id ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <LayerTypeIcon type={layer.type} isImage={layer.isImage} shapeKind={layer.shapeKind} />
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-[6px] border border-[#7D5B59] bg-white px-1.5 py-0.5 text-[13px] font-[600] text-[#7D5B59] outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                  disabled={layer.locked}
                  title={layer.locked ? `${layer.label} (locked)` : layer.label}
                  onClick={() => handle()?.selectLayer(layer.id)}
                  onDoubleClick={() => startRename(layer.id, layer.label)}
                >
                  <LayerTypeIcon type={layer.type} isImage={layer.isImage} shapeKind={layer.shapeKind} />
                  <span
                    className={`truncate text-[13px] font-semibold ${
                      layer.visible ? "text-[#7D5B59]" : "text-[#7D5B59]/40 line-through"
                    }`}
                  >
                    {layer.label}
                    {layer.isEnvelope && (
                      <span className="ml-2 text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                        Envelope
                      </span>
                    )}
                  </span>
                </button>
              )}

              {/* Rename */}
              <button
                type="button"
                className={iconBtn}
                title="Rename layer"
                aria-label="Rename layer"
                onClick={() => startRename(layer.id, layer.label)}
              >
                <Pencil size={15} />
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
                className={`shrink-0 h-7 w-7 rounded-[8px] flex items-center justify-center transition-colors ${
                  layer.isEnvelope
                    ? "text-orange-500 hover:bg-orange-50 opacity-50 cursor-not-allowed"
                    : "text-red-500 hover:bg-red-50"
                }`}
                title={layer.isEnvelope ? "Cannot delete envelope elements" : "Delete layer"}
                aria-label={layer.isEnvelope ? "Cannot delete envelope elements" : "Delete layer"}
                disabled={layer.isEnvelope}
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
                title={layer.isEnvelope ? "Cannot reorder envelope elements" : "Send to back"}
                aria-label="Send to back"
                disabled={isBottom || layer.isEnvelope}
                onClick={() => handle()?.moveLayerToBack(layer.id)}
              >
                <ArrowDownToLine size={14} />
              </button>
              <button
                type="button"
                className={iconBtn}
                title={layer.isEnvelope ? "Cannot reorder envelope elements" : "Move down"}
                aria-label="Move down"
                disabled={isBottom || layer.isEnvelope}
                onClick={() => handle()?.moveLayerDown(layer.id)}
              >
                <ChevronDown size={15} />
              </button>
              <button
                type="button"
                className={iconBtn}
                title={layer.isEnvelope ? "Cannot reorder envelope elements" : "Move up"}
                aria-label="Move up"
                disabled={isTop || layer.isEnvelope}
                onClick={() => handle()?.moveLayerUp(layer.id)}
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                className={iconBtn}
                title={layer.isEnvelope ? "Cannot reorder envelope elements" : "Bring to front"}
                aria-label="Bring to front"
                disabled={isTop || layer.isEnvelope}
                onClick={() => handle()?.moveLayerToFront(layer.id)}
              >
                <ArrowUpToLine size={14} />
              </button>
            </div>
            </div>
            {isBottom && dropIndex === display.length && dropLine}
          </React.Fragment>
        );
      })}
    </div>
  );
}
