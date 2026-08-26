// Play animated GIFs over a Fabric canvas.
//
// Why not just draw them on the canvas: Fabric paints images with
// `ctx.drawImage(imgElement, …)`, and a canvas draw of an animated GIF always
// yields frame 0. The browser advances an <img>'s GIF frames for compositing
// only — verified against a two-frame fixture, the <img> visibly alternates
// while drawImage and createImageBitmap both keep returning the first frame —
// so no amount of re-rendering the canvas will animate one.
//
// So the GIF is played by a real <img> in a layer laid exactly over the canvas,
// and the browser animates it natively. That is the cheap way round: the canvas
// does no extra work at all, no frames are decoded in JS, and nothing repaints
// on a timer. The cost is one CSS transform written per GIF per canvas render,
// and renders only happen when something actually changes.
//
// The Fabric object stays in the canvas exactly as it was, so selection,
// dragging, scaling, z-order within the design, the Layers panel and
// serialization are all untouched — the overlay only takes over painting.
//
// Trade-off, accepted deliberately: the layer sits above the whole canvas, so a
// GIF renders on top of every other object regardless of its position in the
// stack. That is right for stickers (which is what these are for) and wrong for
// a GIF meant to sit under other artwork.

import { isAnimatedGif, looksLikeGif } from "./animatedGif";

export type GifOverlay = {
  /** Re-scan the canvas for GIF objects. Call after a page load / bulk change. */
  refresh(): void;
  /**
   * Run `fn` with Fabric painting the GIFs itself (frame 0), then hand painting
   * back to the overlay. Wrap canvas exports in this — `toDataURL` only sees
   * what Fabric draws, so without it a GIF would export as a hole.
   */
  withFabricPainting<T>(fn: () => T): T;
  dispose(): void;
};

type Entry = { el: HTMLImageElement; src: string; lastCss: string };

const NOOP = () => {};

/** Fabric's parent link is `parent` on v6+; older shapes still carry `group`. */
function parentOf(obj: any): any {
  return obj?.parent ?? obj?.group ?? null;
}

/**
 * A GIF is only playable through the overlay if the <img> can reproduce what
 * Fabric would have drawn. Filters and crops repaint the pixels, and a clipPath
 * cuts them to an arbitrary shape — none of which CSS can mirror — so those
 * stay ordinary (static) Fabric images.
 */
function isOverlayable(obj: any): boolean {
  if (!obj || String(obj.type).toLowerCase() !== "image") return false;
  if (obj.filters?.length) return false;
  if (obj.clipPath) return false;
  if (obj.cropX || obj.cropY) return false;
  return looksLikeGif(srcOf(obj));
}

function srcOf(obj: any): string {
  const fromElement = typeof obj?.getSrc === "function" ? obj.getSrc() : undefined;
  return fromElement || obj?._element?.src || obj?.src || "";
}

/**
 * Effective opacity and visibility, folding in any groups the object sits
 * inside — the overlay <img> is a sibling of the canvas, not of the object, so
 * it inherits none of that on its own.
 */
function inheritedDisplay(obj: any): { opacity: number; visible: boolean } {
  let opacity = 1;
  let visible = true;
  for (let node = obj; node; node = parentOf(node)) {
    if (node.visible === false) visible = false;
    opacity *= node.opacity ?? 1;
  }
  return { opacity, visible };
}

export function createGifOverlay(canvas: any): GifOverlay {
  const wrapper: HTMLElement | undefined = canvas?.wrapperEl;
  if (!wrapper || typeof document === "undefined") {
    return { refresh: NOOP, withFabricPainting: (fn) => fn(), dispose: NOOP };
  }

  const layer = document.createElement("div");
  layer.className = "gif-overlay-layer";
  // Clipped to the canvas box so a GIF dragged past the edge is cut off exactly
  // where the canvas would have cut it, and click-through so the Fabric object
  // underneath still takes every pointer event.
  layer.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;" +
    "overflow:hidden;pointer-events:none;";
  wrapper.appendChild(layer);

  const entries = new Map<any, Entry>();
  // Objects already probed and found to be single-frame: never ask again.
  const staticGifs = new WeakSet<object>();
  let disposed = false;
  let scanQueued = false;

  // ── painting handover ────────────────────────────────────────────────────
  // While the overlay plays a GIF, Fabric must stop painting frame 0 beneath
  // it — otherwise the first frame shows through wherever the playing frame is
  // transparent, which for a sticker is most of it.
  //
  // Suppression is an own-property no-op shadowing the prototype's `_renderFill`
  // rather than `visible: false` or `opacity: 0`, because those are serialized
  // properties: a design saved while a GIF was playing would come back with the
  // sticker switched off. This touches painting only, so the saved JSON is
  // identical either way.
  function suppressFabricPaint(obj: any) {
    if (Object.prototype.hasOwnProperty.call(obj, "_renderFill")) return;
    obj._renderFill = NOOP;
    markDirty(obj);
  }

  function restoreFabricPaint(obj: any) {
    if (!Object.prototype.hasOwnProperty.call(obj, "_renderFill")) return;
    delete obj._renderFill; // falls back to FabricImage.prototype._renderFill
    markDirty(obj);
  }

  // A group renders its children into a cache bitmap, so flipping a child's
  // painting has no effect until the group is told the cache is stale.
  function markDirty(obj: any) {
    for (let node = obj; node; node = parentOf(node)) node.dirty = true;
  }

  // ── geometry ─────────────────────────────────────────────────────────────
  // The object's transform is object-space → canvas-space; the viewport
  // transform is canvas-space → screen. Composed by hand (a 2x3 multiply) so
  // this file needs nothing from the Fabric module itself.
  function worldMatrix(obj: any): number[] {
    const o = obj.calcTransformMatrix();
    const v = canvas.viewportTransform;
    if (!v) return o;
    return [
      v[0] * o[0] + v[2] * o[1],
      v[1] * o[0] + v[3] * o[1],
      v[0] * o[2] + v[2] * o[3],
      v[1] * o[2] + v[3] * o[3],
      v[0] * o[4] + v[2] * o[5] + v[4],
      v[1] * o[4] + v[3] * o[5] + v[5],
    ];
  }

  function syncEntry(obj: any, entry: Entry) {
    const w = obj.width || 1;
    const h = obj.height || 1;
    const m = worldMatrix(obj);
    const { opacity, visible } = inheritedDisplay(obj);

    // Fabric's matrix is written about the object's centre, so shift the <img>
    // (laid out from its top-left) by half its size before applying it.
    const css =
      `width:${w}px;height:${h}px;` +
      `transform:matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4]},${m[5]}) ` +
      `translate(${-w / 2}px,${-h / 2}px);` +
      `opacity:${opacity};display:${visible ? "block" : "none"};`;

    // Renders fire on every drag frame; skip the DOM write when nothing moved.
    if (entry.lastCss === css) return;
    entry.lastCss = css;
    entry.el.style.cssText =
      "position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;" + css;
  }

  function syncAll() {
    if (disposed) return;
    for (const [obj, entry] of entries) syncEntry(obj, entry);
  }

  // ── membership ───────────────────────────────────────────────────────────
  function collectCandidates(): Map<any, string> {
    const found = new Map<any, string>();
    const walk = (objs: any[]) => {
      for (const obj of objs) {
        if (Array.isArray(obj?._objects) && obj._objects.length) walk(obj._objects);
        if (isOverlayable(obj)) found.set(obj, srcOf(obj));
      }
    };
    walk(canvas.getObjects?.() ?? []);
    return found;
  }

  function attach(obj: any, src: string) {
    const el = document.createElement("img");
    el.decoding = "async";
    // No crossOrigin: this <img> is only ever composited by the browser, never
    // read back into a canvas, so it needs no CORS handshake to do its job.
    el.src = src;
    const entry: Entry = { el, src, lastCss: "" };
    entries.set(obj, entry);
    layer.appendChild(el);
    suppressFabricPaint(obj);
    syncEntry(obj, entry);
  }

  function detach(obj: any, entry: Entry) {
    entry.el.remove();
    entries.delete(obj);
    restoreFabricPaint(obj);
  }

  function refresh() {
    if (disposed) return;
    const candidates = collectCandidates();

    // Drop anything gone, or whose src changed out from under us (Replace image).
    for (const [obj, entry] of [...entries]) {
      const src = candidates.get(obj);
      if (src === undefined || src !== entry.src) detach(obj, entry);
    }

    for (const [obj, src] of candidates) {
      if (entries.has(obj) || staticGifs.has(obj)) continue;
      isAnimatedGif(src).then((animated) => {
        // The canvas may have moved on while the probe was in flight.
        if (disposed || entries.has(obj) || srcOf(obj) !== src) return;
        if (!canvas.getObjects?.().length) return;
        if (!animated) {
          staticGifs.add(obj);
          return;
        }
        attach(obj, src);
        canvas.requestRenderAll?.();
      });
    }

    syncAll();
  }

  // Loading a page fires object:added once per object; collapse the burst into
  // a single scan on the next frame.
  function queueRefresh() {
    if (disposed || scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      refresh();
    });
  }

  // `after:render` is the whole clock. It fires exactly when the canvas has
  // repainted — every drag frame, every programmatic render, and never while
  // the design is sitting still — so the overlay tracks the canvas perfectly
  // without polling, and adds no render of its own.
  canvas.on("after:render", syncAll);
  canvas.on("object:added", queueRefresh);
  canvas.on("object:removed", queueRefresh);
  canvas.on("object:modified", queueRefresh);

  refresh();

  return {
    refresh,

    withFabricPainting<T>(fn: () => T): T {
      const held = [...entries.keys()];
      held.forEach(restoreFabricPaint);
      try {
        return fn();
      } finally {
        held.forEach(suppressFabricPaint);
        canvas.requestRenderAll?.();
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.off?.("after:render", syncAll);
      canvas.off?.("object:added", queueRefresh);
      canvas.off?.("object:removed", queueRefresh);
      canvas.off?.("object:modified", queueRefresh);
      for (const [obj, entry] of [...entries]) detach(obj, entry);
      layer.remove();
    },
  };
}
