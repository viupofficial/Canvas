"use client";

import { useEffect } from "react";
import type { Canvas as FabricCanvas } from "fabric";
import type { EventData } from "@/src/store/EventDataContext";

/**
 * Looks up a dotted path like "calendar.date" or "contacts.0.name" on the
 * event data tree and returns a string. Missing values resolve to "".
 */
function readBinding(data: EventData, path: string): string {
  const parts = path.split(".");
  let cur: any = data;
  for (const p of parts) {
    if (cur == null) return "";
    cur = cur[p as keyof typeof cur];
  }
  if (cur == null) return "";
  return typeof cur === "string" ? cur : String(cur);
}

/**
 * Syncs Fabric objects that opt in via a custom `eventBinding` property to
 * the current event data. Templates can mark a Textbox with
 * `eventBinding: "calendar.date"` or an Image with
 * `eventBinding: "moneyGift.image"` and this hook keeps them fresh.
 *
 * Only touched objects are mutated — we never reload the whole canvas.
 * A single requestRenderAll() is issued if anything changed.
 */
export function useFabricEventSync(
  canvas: FabricCanvas | null,
  data: EventData,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled || !canvas) return;

    let changed = false;
    const objects = canvas.getObjects?.() ?? [];

    for (const obj of objects) {
      const binding: string | undefined = (obj as any).eventBinding;
      if (!binding) continue;

      const next = readBinding(data, binding);

      // Textboxes / IText / Text
      if ((obj as any).type === "textbox" || (obj as any).type === "i-text" || (obj as any).type === "text") {
        if ((obj as any).text !== next) {
          (obj as any).set({ text: next });
          changed = true;
        }
        continue;
      }

      // Image: binding should resolve to a URL / data URL
      if ((obj as any).type === "image") {
        const currentSrc: string = (obj as any).getSrc?.() ?? (obj as any).src ?? "";
        if (next && currentSrc !== next) {
          (obj as any).setSrc?.(next, () => canvas.requestRenderAll());
          changed = true;
        }
        continue;
      }
    }

    if (changed) canvas.requestRenderAll();
  }, [canvas, data, enabled]);
}
