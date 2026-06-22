// ─────────────────────────────────────────────────────────────────────────────
// Smart guides (Figma / Canva style) for the Fabric.js canvas.
//
// This module is intentionally Fabric-agnostic at its core: all alignment / gap /
// distance maths work on a plain `Box` (canvas/scene coordinates). Only the small
// adapter helpers at the bottom (getElementBox / getCanvasBox / getOtherBoxes)
// know about Fabric objects, and `drawSmartGuides` knows about a 2D context.
//
// Coordinates: every value here is in CANVAS/SCENE space (the same space Fabric
// object `left`/`top` live in — i.e. the 396×704 backstore, BEFORE zoom/pan and
// before the CSS fit-scale). `drawSmartGuides` converts scene → screen pixels via
// the canvas viewportTransform so guides stay correct at any zoom, and the whole
// <canvas> element is then CSS-scaled uniformly to fit its wrap — so we never have
// to reason about the fit-scale here.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tunable constants (change these to adjust behaviour) ─────────────────────
// Flip to false to disable snapping while keeping the visual guides.
export const ENABLE_SMART_SNAPPING = true;
// Distance (in canvas px) within which an edge/center counts as "aligned".
export const SMART_GUIDE_THRESHOLD = 5;
// Only show a gap measurement when two elements are this close or closer (px).
export const MAX_GAP_MEASUREMENT = 120;
// Only show a canvas-border distance when the element is this close to an edge (px).
export const CANVAS_EDGE_THRESHOLD = 120;

// ── Visual style (Figma-like red) ────────────────────────────────────────────
const GUIDE_COLOR = "#ff3b30";
const LABEL_TEXT = "#ffffff";
const LABEL_FONT = "10px ui-sans-serif, system-ui, -apple-system, sans-serif";
const TICK = 4; // half-length of the end caps on measurement lines

// ── Types ────────────────────────────────────────────────────────────────────
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

// A single guide to render. Lines are axis-aligned:
//  - type "vertical":   constant `x`, spanning `from`→`to` on the Y axis.
//  - type "horizontal": constant `y`, spanning `from`→`to` on the X axis.
// `label` (when present) is a measurement drawn at the middle of the line.
export type SmartGuide = {
  type: "vertical" | "horizontal";
  guideType: "alignment" | "distance" | "gap";
  x?: number;
  y?: number;
  from?: number;
  to?: number;
  label?: string;
};

// ── Box helpers ──────────────────────────────────────────────────────────────
export function makeBox(left: number, top: number, width: number, height: number): Box {
  const w = Number.isFinite(width) ? width : 0;
  const h = Number.isFinite(height) ? height : 0;
  return {
    left,
    top,
    width: w,
    height: h,
    right: left + w,
    bottom: top + h,
    centerX: left + w / 2,
    centerY: top + h / 2,
  };
}

// True when two boxes overlap on the vertical axis (used for horizontal gaps).
function overlapsVertically(a: Box, b: Box): boolean {
  return a.top < b.bottom && a.bottom > b.top;
}
// True when two boxes overlap on the horizontal axis (used for vertical gaps).
function overlapsHorizontally(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left;
}

// ── Feature 2: alignment guides ──────────────────────────────────────────────
// For each other box, emit a guide line wherever the moving box's left/centerX/
// right matches the other's (vertical line) or top/centerY/bottom matches
// (horizontal line). Lines span the union of the two boxes so they visually
// connect them. Duplicate lines at the same coordinate are merged.
export function calculateAlignmentGuides(
  moving: Box,
  others: Box[],
  threshold = SMART_GUIDE_THRESHOLD,
): SmartGuide[] {
  const vertical = new Map<number, SmartGuide>();
  const horizontal = new Map<number, SmartGuide>();

  const addVertical = (x: number, a: Box, b: Box) => {
    const key = Math.round(x * 2) / 2;
    const from = Math.min(a.top, b.top);
    const to = Math.max(a.bottom, b.bottom);
    const existing = vertical.get(key);
    if (existing) {
      existing.from = Math.min(existing.from ?? from, from);
      existing.to = Math.max(existing.to ?? to, to);
    } else {
      vertical.set(key, { type: "vertical", guideType: "alignment", x, from, to });
    }
  };
  const addHorizontal = (y: number, a: Box, b: Box) => {
    const key = Math.round(y * 2) / 2;
    const from = Math.min(a.left, b.left);
    const to = Math.max(a.right, b.right);
    const existing = horizontal.get(key);
    if (existing) {
      existing.from = Math.min(existing.from ?? from, from);
      existing.to = Math.max(existing.to ?? to, to);
    } else {
      horizontal.set(key, { type: "horizontal", guideType: "alignment", y, from, to });
    }
  };

  for (const other of others) {
    // Vertical lines — compare X edges/centre.
    if (Math.abs(moving.left - other.left) <= threshold) addVertical(other.left, moving, other);
    if (Math.abs(moving.centerX - other.centerX) <= threshold) addVertical(other.centerX, moving, other);
    if (Math.abs(moving.right - other.right) <= threshold) addVertical(other.right, moving, other);
    // Horizontal lines — compare Y edges/centre.
    if (Math.abs(moving.top - other.top) <= threshold) addHorizontal(other.top, moving, other);
    if (Math.abs(moving.centerY - other.centerY) <= threshold) addHorizontal(other.centerY, moving, other);
    if (Math.abs(moving.bottom - other.bottom) <= threshold) addHorizontal(other.bottom, moving, other);
  }

  return [...vertical.values(), ...horizontal.values()];
}

// ── Feature 1: canvas-border distance ────────────────────────────────────────
// Show the distance to the NEAREST horizontal edge (left or right) and the
// NEAREST vertical edge (top or bottom), but only when within the threshold so
// we don't clutter the canvas with measurements while the element is centred.
export function calculateCanvasDistanceGuides(
  moving: Box,
  canvasBox: Box,
  threshold = CANVAS_EDGE_THRESHOLD,
): SmartGuide[] {
  const guides: SmartGuide[] = [];

  const leftDist = moving.left - canvasBox.left;
  const rightDist = canvasBox.right - moving.right;
  if (Math.min(leftDist, rightDist) >= 0 && Math.min(leftDist, rightDist) <= threshold) {
    if (leftDist <= rightDist) {
      guides.push({
        type: "horizontal",
        guideType: "distance",
        y: moving.centerY,
        from: canvasBox.left,
        to: moving.left,
        label: String(Math.round(leftDist)),
      });
    } else {
      guides.push({
        type: "horizontal",
        guideType: "distance",
        y: moving.centerY,
        from: moving.right,
        to: canvasBox.right,
        label: String(Math.round(rightDist)),
      });
    }
  }

  const topDist = moving.top - canvasBox.top;
  const bottomDist = canvasBox.bottom - moving.bottom;
  if (Math.min(topDist, bottomDist) >= 0 && Math.min(topDist, bottomDist) <= threshold) {
    if (topDist <= bottomDist) {
      guides.push({
        type: "vertical",
        guideType: "distance",
        x: moving.centerX,
        from: canvasBox.top,
        to: moving.top,
        label: String(Math.round(topDist)),
      });
    } else {
      guides.push({
        type: "vertical",
        guideType: "distance",
        x: moving.centerX,
        from: moving.bottom,
        to: canvasBox.bottom,
        label: String(Math.round(bottomDist)),
      });
    }
  }

  return guides;
}

// ── Feature 3: gap measurement to nearby elements ────────────────────────────
// Emit at most one horizontal gap (to the nearest element left/right that shares
// vertical extent) and one vertical gap (nearest element above/below that shares
// horizontal extent), each within MAX_GAP_MEASUREMENT.
export function calculateGapMeasurements(
  moving: Box,
  others: Box[],
  max = MAX_GAP_MEASUREMENT,
): SmartGuide[] {
  const guides: SmartGuide[] = [];

  let bestH: { gap: number; guide: SmartGuide } | null = null;
  let bestV: { gap: number; guide: SmartGuide } | null = null;

  for (const other of others) {
    // Horizontal gap — only meaningful when the boxes share some vertical band.
    if (overlapsVertically(moving, other)) {
      const midY = (Math.max(moving.top, other.top) + Math.min(moving.bottom, other.bottom)) / 2;
      let gap: number | null = null;
      let from = 0;
      let to = 0;
      if (moving.left >= other.right) {
        gap = moving.left - other.right;
        from = other.right;
        to = moving.left;
      } else if (moving.right <= other.left) {
        gap = other.left - moving.right;
        from = moving.right;
        to = other.left;
      }
      if (gap != null && gap >= 0 && gap <= max && (!bestH || gap < bestH.gap)) {
        bestH = {
          gap,
          guide: {
            type: "horizontal",
            guideType: "gap",
            y: midY,
            from,
            to,
            label: String(Math.round(gap)),
          },
        };
      }
    }

    // Vertical gap — only meaningful when the boxes share some horizontal band.
    if (overlapsHorizontally(moving, other)) {
      const midX = (Math.max(moving.left, other.left) + Math.min(moving.right, other.right)) / 2;
      let gap: number | null = null;
      let from = 0;
      let to = 0;
      if (moving.top >= other.bottom) {
        gap = moving.top - other.bottom;
        from = other.bottom;
        to = moving.top;
      } else if (moving.bottom <= other.top) {
        gap = other.top - moving.bottom;
        from = moving.bottom;
        to = other.top;
      }
      if (gap != null && gap >= 0 && gap <= max && (!bestV || gap < bestV.gap)) {
        bestV = {
          gap,
          guide: {
            type: "vertical",
            guideType: "gap",
            x: midX,
            from,
            to,
            label: String(Math.round(gap)),
          },
        };
      }
    }
  }

  if (bestH) guides.push(bestH.guide);
  if (bestV) guides.push(bestV.guide);
  return guides;
}

// ── Snapping ─────────────────────────────────────────────────────────────────
// Returns the {dx, dy} the caller should add to the moving element so the closest
// edge/centre on each axis snaps into alignment. Only the single strongest snap
// per axis is applied, so it never feels sticky and never fights itself.
export function applySmartSnapping(
  moving: Box,
  others: Box[],
  threshold = SMART_GUIDE_THRESHOLD,
): { dx: number; dy: number } {
  let dx = 0;
  let bestX = Infinity;
  let dy = 0;
  let bestY = Infinity;

  const considerX = (delta: number) => {
    const abs = Math.abs(delta);
    if (abs <= threshold && abs < bestX) {
      bestX = abs;
      dx = delta;
    }
  };
  const considerY = (delta: number) => {
    const abs = Math.abs(delta);
    if (abs <= threshold && abs < bestY) {
      bestY = abs;
      dy = delta;
    }
  };

  for (const other of others) {
    considerX(other.left - moving.left);
    considerX(other.centerX - moving.centerX);
    considerX(other.right - moving.right);
    considerY(other.top - moving.top);
    considerY(other.centerY - moving.centerY);
    considerY(other.bottom - moving.bottom);
  }

  return { dx, dy };
}

// ── Fabric adapters ──────────────────────────────────────────────────────────
// Build a scene-coordinate Box from a Fabric object. Uses `aCoords` (the absolute
// corner coords, in scene space, rotation included) so the box is correct for
// rotated/scaled objects; falls back to getBoundingRect, then to left/top/size.
export function getElementBox(obj: any): Box | null {
  if (!obj) return null;
  try {
    const ac = obj.aCoords;
    if (ac && ac.tl && ac.tr && ac.br && ac.bl) {
      const xs = [ac.tl.x, ac.tr.x, ac.br.x, ac.bl.x];
      const ys = [ac.tl.y, ac.tr.y, ac.br.y, ac.bl.y];
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      return makeBox(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
    }
    if (typeof obj.getBoundingRect === "function") {
      const r = obj.getBoundingRect();
      return makeBox(r.left, r.top, r.width, r.height);
    }
    const left = obj.left ?? 0;
    const top = obj.top ?? 0;
    const width = (obj.width ?? 0) * (obj.scaleX ?? 1);
    const height = (obj.height ?? 0) * (obj.scaleY ?? 1);
    return makeBox(left, top, width, height);
  } catch {
    return null;
  }
}

// The canvas itself as a Box, in scene coordinates (0,0 → backstore w,h).
export function getCanvasBox(canvas: any): Box {
  const width = Number(canvas?.width) || Number(canvas?.getWidth?.()) || 0;
  const height = Number(canvas?.height) || Number(canvas?.getHeight?.()) || 0;
  return makeBox(0, 0, width, height);
}

// Boxes for every other reference element on the active page. Skips the moving
// object itself, hidden elements, decorative borders, and anything that fails to
// produce a valid box. Locked elements ARE included (valid snap references) — the
// caller never moves them because Fabric won't make a locked object active.
export function getOtherBoxes(canvas: any, movingObj: any): Box[] {
  if (!canvas?.getObjects) return [];
  const boxes: Box[] = [];
  for (const o of canvas.getObjects()) {
    if (o === movingObj) continue;
    if (o.visible === false) continue;
    if (o.isBorder) continue;
    const box = getElementBox(o);
    if (box) boxes.push(box);
  }
  return boxes;
}

// ── Renderer ─────────────────────────────────────────────────────────────────
// Draw the guides onto a 2D context, converting scene → screen pixels with the
// canvas viewportTransform [a,b,c,d,e,f]. We map points but keep line widths /
// font sizes constant (1px lines, 10px labels) regardless of zoom. Intended to be
// called from Fabric's `after:render` on the main (lower) canvas context.
export function drawSmartGuides(
  ctx: CanvasRenderingContext2D,
  guides: SmartGuide[],
  viewportTransform?: number[] | null,
): void {
  if (!ctx || !guides.length) return;
  const vt = viewportTransform ?? [1, 0, 0, 1, 0, 0];
  const a = vt[0] ?? 1;
  const d = vt[3] ?? 1;
  const e = vt[4] ?? 0;
  const f = vt[5] ?? 0;
  // Scene → screen, snapped to a half-pixel so 1px lines stay crisp.
  const sx = (x: number) => Math.round(x * a + e) + 0.5;
  const sy = (y: number) => Math.round(y * d + f) + 0.5;

  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.fillStyle = GUIDE_COLOR;

  for (const g of guides) {
    const labeled = g.guideType !== "alignment" && !!g.label;
    if (g.type === "vertical") {
      const x = sx(g.x ?? 0);
      const y1 = sy(g.from ?? 0);
      const y2 = sy(g.to ?? 0);
      line(ctx, x, y1, x, y2);
      if (labeled) {
        // End caps perpendicular to the (vertical) measurement line.
        line(ctx, x - TICK, y1, x + TICK, y1);
        line(ctx, x - TICK, y2, x + TICK, y2);
        drawLabel(ctx, g.label!, x, (y1 + y2) / 2);
      }
    } else {
      const y = sy(g.y ?? 0);
      const x1 = sx(g.from ?? 0);
      const x2 = sx(g.to ?? 0);
      line(ctx, x1, y, x2, y);
      if (labeled) {
        line(ctx, x1, y - TICK, x1, y + TICK);
        line(ctx, x2, y - TICK, x2, y + TICK);
        drawLabel(ctx, g.label!, (x1 + x2) / 2, y);
      }
    }
  }

  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// A small red pill with white text, centred on (cx, cy).
function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number) {
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padX = 4;
  const padY = 2;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 14 + padY * 2 - 8; // ~14px pill height
  const rx = Math.round(cx - w / 2);
  const ry = Math.round(cy - h / 2);
  const r = 3;
  ctx.beginPath();
  ctx.moveTo(rx + r, ry);
  ctx.arcTo(rx + w, ry, rx + w, ry + h, r);
  ctx.arcTo(rx + w, ry + h, rx, ry + h, r);
  ctx.arcTo(rx, ry + h, rx, ry, r);
  ctx.arcTo(rx, ry, rx + w, ry, r);
  ctx.closePath();
  ctx.fillStyle = GUIDE_COLOR;
  ctx.fill();
  ctx.fillStyle = LABEL_TEXT;
  ctx.fillText(text, rx + w / 2, ry + h / 2 + 0.5);
  ctx.restore();
}
