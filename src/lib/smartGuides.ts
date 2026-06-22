// ─────────────────────────────────────────────────────────────────────────────
// Smart guides (Figma / Canva style) for the Fabric.js canvas.
//
// Core maths are Fabric-agnostic and work on a plain `Box` in CANVAS/SCENE space
// (the same space Fabric `left`/`top` live in — the 396×704 backstore, BEFORE
// zoom/pan and before the CSS fit-scale). Only the adapters near the bottom
// (getElementBox / getCanvasBox / getReferenceBoxes) know about Fabric, and
// `drawSmartGuides` knows about a 2D context.
//
// COORDINATE SYSTEM (zoom/pan safe):
//   element/guide coords are scene px. `drawSmartGuides` converts scene → screen
//   px via the canvas viewportTransform [a,b,c,d,e,f] (which encodes Fabric zoom +
//   pan), keeping line widths/labels a constant size. The whole <canvas> element
//   is then CSS-scaled uniformly to fit its wrap, so we never reason about the
//   fit-scale here. This is why a single coordinate system stays aligned at any
//   zoom/pan/preview scale.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tunable constants (the dials you'll most likely want to change) ──────────
export const ENABLE_SMART_SNAPPING = true;
// Enter a snap when an anchor is within this many px…
export const SMART_GUIDE_THRESHOLD = 5;
// …and only release it once it drifts beyond this many px (hysteresis → no flicker).
export const SNAP_RELEASE_THRESHOLD = 9;
// Gap / equal-spacing only considered when within these ranges (px).
export const MAX_GAP_MEASUREMENT = 120;
export const EQUAL_SPACING_THRESHOLD = 5;
export const ENABLE_EQUAL_SPACING_SNAPPING = true;
// Canvas-border distance shown when this close to an edge (px).
export const CANVAS_EDGE_THRESHOLD = 120;
// Resize snapping + minimum sizes so a resize can never invert an element.
export const ENABLE_RESIZE_SNAPPING = true;
export const MIN_ELEMENT_WIDTH = 10;
export const MIN_ELEMENT_HEIGHT = 10;
// Hold this modifier while dragging to suspend snapping (guides still show).
export const DISABLE_SNAPPING_MODIFIER = "Alt";
// Flip on to log moving box / candidates / chosen snap during a drag.
export const DEBUG_SMART_GUIDES = false;

// Snap priority: element alignment > equal spacing > canvas center > canvas edge.
const PRIORITY = {
  centerElem: 105,
  edgeElem: 100,
  equalSpacing: 70,
  canvasCenter: 50,
  canvasEdge: 30,
} as const;

// ── Visual style (Figma-like red) ────────────────────────────────────────────
const GUIDE_COLOR = "#ff3b30";
const LABEL_TEXT = "#ffffff";
const LABEL_FONT = "10px ui-sans-serif, system-ui, -apple-system, sans-serif";
const TICK = 4; // half-length of the end caps on measurement lines

// ── Types ────────────────────────────────────────────────────────────────────
export interface Box {
  id?: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  kind?: "element" | "group" | "selection" | "canvas";
}

export type SnapAnchor = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

// One possible snap, scored so the picker can choose the best per axis.
export interface SnapCandidate {
  axis: "x" | "y";
  movingAnchor: SnapAnchor;
  targetValue: number; // absolute scene coordinate the anchor wants to land on
  distance: number;
  priority: number;
  measurementType?: "edge" | "center" | "equal-spacing" | "canvas-center" | "canvas-edge";
  sourceIds?: string[];
}

// A single guide to render. Lines are axis-aligned:
//  - type "vertical":   constant `x`, spanning `from`→`to` on the Y axis.
//  - type "horizontal": constant `y`, spanning `from`→`to` on the X axis.
// `label` (when present) is a measurement drawn at the middle of the line.
export type SmartGuide = {
  type: "vertical" | "horizontal";
  guideType: "alignment" | "distance" | "gap" | "equal-spacing";
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

function shiftBox(box: Box, dx: number, dy: number): Box {
  const b = makeBox(box.left + dx, box.top + dy, box.width, box.height);
  b.id = box.id;
  b.kind = box.kind;
  return b;
}

const anchorVal = (box: Box, anchor: SnapAnchor): number => box[anchor];

function overlapsVertically(a: Box, b: Box): boolean {
  return a.top < b.bottom && a.bottom > b.top;
}
function overlapsHorizontally(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left;
}

// ── Alignment guides (edge/centre lines between moving box and others) ────────
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
    if (Math.abs(moving.left - other.left) <= threshold) addVertical(other.left, moving, other);
    if (Math.abs(moving.centerX - other.centerX) <= threshold) addVertical(other.centerX, moving, other);
    if (Math.abs(moving.right - other.right) <= threshold) addVertical(other.right, moving, other);
    if (Math.abs(moving.top - other.top) <= threshold) addHorizontal(other.top, moving, other);
    if (Math.abs(moving.centerY - other.centerY) <= threshold) addHorizontal(other.centerY, moving, other);
    if (Math.abs(moving.bottom - other.bottom) <= threshold) addHorizontal(other.bottom, moving, other);
  }

  return [...vertical.values(), ...horizontal.values()];
}

// Canvas-center guides — vertical line at canvas centerX / horizontal at centerY.
export function calculateCanvasCenterGuides(
  moving: Box,
  canvasBox: Box,
  threshold = SMART_GUIDE_THRESHOLD,
): SmartGuide[] {
  const guides: SmartGuide[] = [];
  if (Math.abs(moving.centerX - canvasBox.centerX) <= threshold) {
    guides.push({
      type: "vertical",
      guideType: "alignment",
      x: canvasBox.centerX,
      from: Math.min(moving.top, canvasBox.top),
      to: Math.max(moving.bottom, canvasBox.bottom),
    });
  }
  if (Math.abs(moving.centerY - canvasBox.centerY) <= threshold) {
    guides.push({
      type: "horizontal",
      guideType: "alignment",
      y: canvasBox.centerY,
      from: Math.min(moving.left, canvasBox.left),
      to: Math.max(moving.right, canvasBox.right),
    });
  }
  return guides;
}

// ── Canvas-border distance ────────────────────────────────────────────────────
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
      guides.push({ type: "horizontal", guideType: "distance", y: moving.centerY, from: canvasBox.left, to: moving.left, label: String(Math.round(leftDist)) });
    } else {
      guides.push({ type: "horizontal", guideType: "distance", y: moving.centerY, from: moving.right, to: canvasBox.right, label: String(Math.round(rightDist)) });
    }
  }

  const topDist = moving.top - canvasBox.top;
  const bottomDist = canvasBox.bottom - moving.bottom;
  if (Math.min(topDist, bottomDist) >= 0 && Math.min(topDist, bottomDist) <= threshold) {
    if (topDist <= bottomDist) {
      guides.push({ type: "vertical", guideType: "distance", x: moving.centerX, from: canvasBox.top, to: moving.top, label: String(Math.round(topDist)) });
    } else {
      guides.push({ type: "vertical", guideType: "distance", x: moving.centerX, from: moving.bottom, to: canvasBox.bottom, label: String(Math.round(bottomDist)) });
    }
  }

  return guides;
}

// ── Gap measurement to nearby elements (nearest H + nearest V) ────────────────
export function calculateGapMeasurements(
  moving: Box,
  others: Box[],
  max = MAX_GAP_MEASUREMENT,
): SmartGuide[] {
  const guides: SmartGuide[] = [];
  let bestH: { gap: number; guide: SmartGuide } | null = null;
  let bestV: { gap: number; guide: SmartGuide } | null = null;

  for (const other of others) {
    if (overlapsVertically(moving, other)) {
      const midY = (Math.max(moving.top, other.top) + Math.min(moving.bottom, other.bottom)) / 2;
      let gap: number | null = null;
      let from = 0;
      let to = 0;
      if (moving.left >= other.right) { gap = moving.left - other.right; from = other.right; to = moving.left; }
      else if (moving.right <= other.left) { gap = other.left - moving.right; from = moving.right; to = other.left; }
      if (gap != null && gap >= 0 && gap <= max && (!bestH || gap < bestH.gap)) {
        bestH = { gap, guide: { type: "horizontal", guideType: "gap", y: midY, from, to, label: String(Math.round(gap)) } };
      }
    }
    if (overlapsHorizontally(moving, other)) {
      const midX = (Math.max(moving.left, other.left) + Math.min(moving.right, other.right)) / 2;
      let gap: number | null = null;
      let from = 0;
      let to = 0;
      if (moving.top >= other.bottom) { gap = moving.top - other.bottom; from = other.bottom; to = moving.top; }
      else if (moving.bottom <= other.top) { gap = other.top - moving.bottom; from = moving.bottom; to = other.top; }
      if (gap != null && gap >= 0 && gap <= max && (!bestV || gap < bestV.gap)) {
        bestV = { gap, guide: { type: "vertical", guideType: "gap", x: midX, from, to, label: String(Math.round(gap)) } };
      }
    }
  }

  if (bestH) guides.push(bestH.guide);
  if (bestV) guides.push(bestV.guide);
  return guides;
}

// ── Equal spacing detection (Figma "matching gaps") ──────────────────────────
// Per-axis config so one routine handles both horizontal and vertical spacing.
type AxisKey = "x" | "y";
interface AxisCfg {
  lead: "left" | "top";
  trail: "right" | "bottom";
  size: "width" | "height";
  cross: "centerY" | "centerX";
  overlap: (a: Box, b: Box) => boolean;
}
const AXIS: Record<AxisKey, AxisCfg> = {
  x: { lead: "left", trail: "right", size: "width", cross: "centerY", overlap: overlapsVertically },
  y: { lead: "top", trail: "bottom", size: "height", cross: "centerX", overlap: overlapsHorizontally },
};

function measureGuide(axis: AxisKey, start: number, end: number, cross: number, label: string): SmartGuide {
  return axis === "x"
    ? { type: "horizontal", guideType: "equal-spacing", y: cross, from: start, to: end, label }
    : { type: "vertical", guideType: "equal-spacing", x: cross, from: start, to: end, label };
}

// Detect equal spacing on one axis. Returns the snap candidate (so the moving box
// can lock to the matching gap) plus the two measurement guides to draw. Only
// considers elements that share cross-axis extent with the moving box (so we
// never match unrelated, far-away elements).
export function equalSpacing(
  moving: Box,
  others: Box[],
  axis: AxisKey,
  threshold = EQUAL_SPACING_THRESHOLD,
): { candidate: SnapCandidate; guides: SmartGuide[] } | null {
  const c = AXIS[axis];
  const EPS = 0.5;
  const row = others.filter((o) => c.overlap(moving, o));
  if (row.length < 2) return null;

  const lefts = row.filter((o) => o[c.trail] <= moving[c.lead] + EPS).sort((a, b) => b[c.trail] - a[c.trail]);
  const rights = row.filter((o) => o[c.lead] >= moving[c.trail] - EPS).sort((a, b) => a[c.lead] - b[c.lead]);

  type EqBest = {
    dist: number;
    anchor: SnapAnchor;
    targetValue: number;
    gap: number;
    refs: Box[];
    pattern: "after" | "before" | "center";
  };
  let best: EqBest | null = null;
  const consider = (cand: EqBest) => {
    if (!best || cand.dist < best.dist) best = cand;
  };

  // Pattern "after": [A] [B] [moving] — match gap(B,moving) to gap(A,B).
  if (lefts.length) {
    const B = lefts[0];
    const A = row.filter((o) => o !== B && o[c.trail] <= B[c.lead] + EPS).sort((a, b) => b[c.trail] - a[c.trail])[0];
    if (A) {
      const gap = B[c.lead] - A[c.trail];
      if (gap >= 0) {
        const targetValue = B[c.trail] + gap;
        const dist = Math.abs(moving[c.lead] - targetValue);
        if (dist <= threshold) consider({ dist, anchor: c.lead, targetValue, gap, refs: [A, B], pattern: "after" });
      }
    }
  }
  // Pattern "before": [moving] [B] [A] — match gap(moving,B) to gap(B,A).
  if (rights.length) {
    const B = rights[0];
    const A = row.filter((o) => o !== B && o[c.lead] >= B[c.trail] - EPS).sort((a, b) => a[c.lead] - b[c.lead])[0];
    if (A) {
      const gap = A[c.lead] - B[c.trail];
      if (gap >= 0) {
        const targetValue = B[c.lead] - gap; // moving.trail target
        const dist = Math.abs(moving[c.trail] - targetValue);
        if (dist <= threshold) consider({ dist, anchor: c.trail, targetValue, gap, refs: [B, A], pattern: "before" });
      }
    }
  }
  // Pattern "center": [L] [moving] [R] — equalise both gaps.
  if (lefts.length && rights.length) {
    const L = lefts[0];
    const R = rights[0];
    const gap = (R[c.lead] - L[c.trail] - moving[c.size]) / 2;
    if (gap >= 0) {
      const targetValue = L[c.trail] + gap; // moving.lead target
      const dist = Math.abs(moving[c.lead] - targetValue);
      if (dist <= threshold) consider({ dist, anchor: c.lead, targetValue, gap, refs: [L, R], pattern: "center" });
    }
  }

  const chosen = best as EqBest | null;
  if (!chosen) return null;

  // Place the moving box at the matched position so both labels read identically.
  const snappedLead = chosen.anchor === c.lead ? chosen.targetValue : chosen.targetValue - moving[c.size];
  const snappedTrail = snappedLead + moving[c.size];
  const cross = moving[c.cross];
  const label = String(Math.round(chosen.gap));
  const guides: SmartGuide[] = [];

  if (chosen.pattern === "after") {
    const [A, B] = chosen.refs;
    guides.push(measureGuide(axis, A[c.trail], B[c.lead], cross, label));
    guides.push(measureGuide(axis, B[c.trail], snappedLead, cross, label));
  } else if (chosen.pattern === "before") {
    const [B, A] = chosen.refs;
    guides.push(measureGuide(axis, snappedTrail, B[c.lead], cross, label));
    guides.push(measureGuide(axis, B[c.trail], A[c.lead], cross, label));
  } else {
    const [L, R] = chosen.refs;
    guides.push(measureGuide(axis, L[c.trail], snappedLead, cross, label));
    guides.push(measureGuide(axis, snappedTrail, R[c.lead], cross, label));
  }

  const candidate: SnapCandidate = {
    axis,
    movingAnchor: chosen.anchor,
    targetValue: chosen.targetValue,
    distance: chosen.dist,
    priority: PRIORITY.equalSpacing,
    measurementType: "equal-spacing",
    sourceIds: chosen.refs.map((r) => r.id).filter((id): id is string => !!id),
  };
  return { candidate, guides };
}

// ── Snapping ─────────────────────────────────────────────────────────────────
// Legacy single-strongest-per-axis snap (kept for back-compat / simple callers).
export function applySmartSnapping(
  moving: Box,
  others: Box[],
  threshold = SMART_GUIDE_THRESHOLD,
): { dx: number; dy: number } {
  let dx = 0;
  let bestX = Infinity;
  let dy = 0;
  let bestY = Infinity;
  const considerX = (d: number) => { const a = Math.abs(d); if (a <= threshold && a < bestX) { bestX = a; dx = d; } };
  const considerY = (d: number) => { const a = Math.abs(d); if (a <= threshold && a < bestY) { bestY = a; dy = d; } };
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

const X_ANCHORS: SnapAnchor[] = ["left", "centerX", "right"];
const Y_ANCHORS: SnapAnchor[] = ["top", "centerY", "bottom"];

// Build every plausible snap candidate per axis (element edges/centres + canvas
// edges/centre). Equal-spacing candidates are added by the caller.
function buildSnapCandidates(moving: Box, others: Box[], canvasBox: Box): { x: SnapCandidate[]; y: SnapCandidate[] } {
  const x: SnapCandidate[] = [];
  const y: SnapCandidate[] = [];

  const push = (
    arr: SnapCandidate[],
    axis: "x" | "y",
    movingAnchor: SnapAnchor,
    targetValue: number,
    priority: number,
    measurementType: SnapCandidate["measurementType"],
    ids?: string[],
  ) => {
    arr.push({ axis, movingAnchor, targetValue, distance: Math.abs(anchorVal(moving, movingAnchor) - targetValue), priority, measurementType, sourceIds: ids });
  };

  for (const other of others) {
    const ids = other.id ? [other.id] : undefined;
    for (const ma of X_ANCHORS) {
      for (const ta of X_ANCHORS) {
        const isCenter = ma === "centerX" && ta === "centerX";
        push(x, "x", ma, other[ta], isCenter ? PRIORITY.centerElem : PRIORITY.edgeElem, isCenter ? "center" : "edge", ids);
      }
    }
    for (const ma of Y_ANCHORS) {
      for (const ta of Y_ANCHORS) {
        const isCenter = ma === "centerY" && ta === "centerY";
        push(y, "y", ma, other[ta], isCenter ? PRIORITY.centerElem : PRIORITY.edgeElem, isCenter ? "center" : "edge", ids);
      }
    }
  }

  // Canvas centre + edges.
  push(x, "x", "centerX", canvasBox.centerX, PRIORITY.canvasCenter, "canvas-center");
  push(x, "x", "left", canvasBox.left, PRIORITY.canvasEdge, "canvas-edge");
  push(x, "x", "right", canvasBox.right, PRIORITY.canvasEdge, "canvas-edge");
  push(y, "y", "centerY", canvasBox.centerY, PRIORITY.canvasCenter, "canvas-center");
  push(y, "y", "top", canvasBox.top, PRIORITY.canvasEdge, "canvas-edge");
  push(y, "y", "bottom", canvasBox.bottom, PRIORITY.canvasEdge, "canvas-edge");

  return { x, y };
}

// Pick the best candidate for one axis with hysteresis + priority tie-breaking.
function pickSnap(
  cands: SnapCandidate[],
  prev: SnapCandidate | undefined,
  moving: Box,
): SnapCandidate | undefined {
  // Hysteresis: keep the previous snap until it drifts past the release radius.
  if (prev) {
    const d = Math.abs(prev.targetValue - anchorVal(moving, prev.movingAnchor));
    if (d <= SNAP_RELEASE_THRESHOLD) return { ...prev, distance: d };
  }
  const inRange = cands.filter((c) => c.distance <= SMART_GUIDE_THRESHOLD);
  if (!inRange.length) return undefined;
  inRange.sort((a, b) => {
    if (Math.abs(a.distance - b.distance) > 0.5) return a.distance - b.distance; // closest wins
    if (a.priority !== b.priority) return b.priority - a.priority; // then priority
    const ac = a.movingAnchor === "centerX" || a.movingAnchor === "centerY" ? 0 : 1;
    const bc = b.movingAnchor === "centerX" || b.movingAnchor === "centerY" ? 0 : 1;
    return ac - bc; // then prefer centre anchors
  });
  return inRange[0];
}

// ── Unified move computation ─────────────────────────────────────────────────
// Single entry point for both single-element AND multi-selection drags: pass the
// element/selection bounding box as `moving` and every OTHER reference box. It
// snaps (unless disabled), then builds all guides at the snapped position.
export function computeMoveGuides(params: {
  moving: Box;
  others: Box[];
  canvasBox: Box;
  enableSnapping: boolean;
  prev?: { x?: SnapCandidate; y?: SnapCandidate };
}): { dx: number; dy: number; guides: SmartGuide[]; snap: { x?: SnapCandidate; y?: SnapCandidate } } {
  const { moving, others, canvasBox, enableSnapping, prev } = params;

  const cand = buildSnapCandidates(moving, others, canvasBox);
  // Equal spacing always computed for display; only fed to the snapper if enabled.
  const eqX = equalSpacing(moving, others, "x");
  const eqY = equalSpacing(moving, others, "y");
  if (ENABLE_EQUAL_SPACING_SNAPPING) {
    if (eqX) cand.x.push(eqX.candidate);
    if (eqY) cand.y.push(eqY.candidate);
  }

  let snapX: SnapCandidate | undefined;
  let snapY: SnapCandidate | undefined;
  let dx = 0;
  let dy = 0;
  if (enableSnapping) {
    snapX = pickSnap(cand.x, prev?.x, moving);
    snapY = pickSnap(cand.y, prev?.y, moving);
    if (snapX) dx = snapX.targetValue - anchorVal(moving, snapX.movingAnchor);
    if (snapY) dy = snapY.targetValue - anchorVal(moving, snapY.movingAnchor);
  }

  const snapped = dx || dy ? shiftBox(moving, dx, dy) : moving;

  const guides: SmartGuide[] = [];
  guides.push(...calculateAlignmentGuides(snapped, others, SMART_GUIDE_THRESHOLD));
  guides.push(...calculateCanvasCenterGuides(snapped, canvasBox, SMART_GUIDE_THRESHOLD));
  const gaps = calculateGapMeasurements(snapped, others, MAX_GAP_MEASUREMENT);
  const hasHGap = gaps.some((g) => g.type === "horizontal");
  const hasVGap = gaps.some((g) => g.type === "vertical");
  guides.push(...gaps);
  guides.push(
    ...calculateCanvasDistanceGuides(snapped, canvasBox, CANVAS_EDGE_THRESHOLD).filter((g) =>
      g.type === "horizontal" ? !hasHGap : !hasVGap,
    ),
  );
  // Equal-spacing guides recomputed at the snapped position so labels are exact.
  const eqXpost = equalSpacing(snapped, others, "x");
  const eqYpost = equalSpacing(snapped, others, "y");
  if (eqXpost) guides.push(...eqXpost.guides);
  if (eqYpost) guides.push(...eqYpost.guides);

  if (DEBUG_SMART_GUIDES) {
    // eslint-disable-next-line no-console
    console.log("[smartGuides] move", { moving, dx, dy, snapX, snapY, guides });
  }

  return { dx, dy, guides, snap: { x: snapX, y: snapY } };
}

// ── Resize computation ───────────────────────────────────────────────────────
// Given the current resized box and the handle/corner in use, return the target
// scene value for each ACTIVE edge to snap to (if any within threshold) plus the
// guide lines to draw. The caller applies the targets to scaleX/scaleY safely.
export function computeResizeGuides(params: {
  box: Box;
  corner: string;
  others: Box[];
  canvasBox: Box;
  threshold?: number;
}): { targets: { left?: number; right?: number; top?: number; bottom?: number }; guides: SmartGuide[] } {
  const { box, corner, others, canvasBox } = params;
  const threshold = params.threshold ?? SMART_GUIDE_THRESHOLD;
  const c = corner.toLowerCase();
  const leftActive = /l/.test(c); // tl, bl, ml
  const rightActive = /r/.test(c); // tr, br, mr
  const topActive = /t/.test(c); // tl, tr, mt
  const bottomActive = /b/.test(c); // bl, br, mb

  const xTargets = [
    ...others.flatMap((o) => [o.left, o.centerX, o.right]),
    canvasBox.left,
    canvasBox.centerX,
    canvasBox.right,
  ];
  const yTargets = [
    ...others.flatMap((o) => [o.top, o.centerY, o.bottom]),
    canvasBox.top,
    canvasBox.centerY,
    canvasBox.bottom,
  ];

  const nearest = (value: number, targets: number[]): number | undefined => {
    let best: number | undefined;
    let bestD = threshold + 1e-6;
    for (const t of targets) {
      const d = Math.abs(value - t);
      if (d <= threshold && d < bestD) { bestD = d; best = t; }
    }
    return best;
  };

  const targets: { left?: number; right?: number; top?: number; bottom?: number } = {};
  const guides: SmartGuide[] = [];

  if (leftActive) {
    const t = nearest(box.left, xTargets);
    if (t != null) { targets.left = t; guides.push({ type: "vertical", guideType: "alignment", x: t, from: box.top, to: box.bottom }); }
  }
  if (rightActive) {
    const t = nearest(box.right, xTargets);
    if (t != null) { targets.right = t; guides.push({ type: "vertical", guideType: "alignment", x: t, from: box.top, to: box.bottom }); }
  }
  if (topActive) {
    const t = nearest(box.top, yTargets);
    if (t != null) { targets.top = t; guides.push({ type: "horizontal", guideType: "alignment", y: t, from: box.left, to: box.right }); }
  }
  if (bottomActive) {
    const t = nearest(box.bottom, yTargets);
    if (t != null) { targets.bottom = t; guides.push({ type: "horizontal", guideType: "alignment", y: t, from: box.left, to: box.right }); }
  }

  if (DEBUG_SMART_GUIDES) {
    // eslint-disable-next-line no-console
    console.log("[smartGuides] resize", { corner, box, targets });
  }
  return { targets, guides };
}

// ── Distribute utilities (pure) ──────────────────────────────────────────────
// Given ≥3 boxes, return the new lead coordinate per id so gaps are equal. The
// first and last boxes stay put. Callers apply the deltas to their objects.
export function distributeBoxesHorizontally(boxes: Box[]): { id: string; left: number }[] {
  if (boxes.length < 3) return [];
  const sorted = [...boxes].sort((a, b) => a.left - b.left);
  const totalW = sorted.reduce((s, b) => s + b.width, 0);
  const span = sorted[sorted.length - 1].right - sorted[0].left;
  const gap = (span - totalW) / (sorted.length - 1);
  const out: { id: string; left: number }[] = [];
  let cursor = sorted[0].left;
  for (const b of sorted) {
    if (b.id) out.push({ id: b.id, left: cursor });
    cursor += b.width + gap;
  }
  return out;
}
export function distributeBoxesVertically(boxes: Box[]): { id: string; top: number }[] {
  if (boxes.length < 3) return [];
  const sorted = [...boxes].sort((a, b) => a.top - b.top);
  const totalH = sorted.reduce((s, b) => s + b.height, 0);
  const span = sorted[sorted.length - 1].bottom - sorted[0].top;
  const gap = (span - totalH) / (sorted.length - 1);
  const out: { id: string; top: number }[] = [];
  let cursor = sorted[0].top;
  for (const b of sorted) {
    if (b.id) out.push({ id: b.id, top: cursor });
    cursor += b.height + gap;
  }
  return out;
}

// ── Fabric adapters ──────────────────────────────────────────────────────────
// Build a scene-coordinate Box from a Fabric object. Uses `aCoords` (absolute
// corner coords, rotation included) so the box is correct for rotated/scaled
// objects and for groups (whose aCoords already wrap their children).
export function getElementBox(obj: any): Box | null {
  if (!obj) return null;
  try {
    let box: Box | null = null;
    const ac = obj.aCoords;
    if (ac && ac.tl && ac.tr && ac.br && ac.bl) {
      const xs = [ac.tl.x, ac.tr.x, ac.br.x, ac.bl.x];
      const ys = [ac.tl.y, ac.tr.y, ac.br.y, ac.bl.y];
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      box = makeBox(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
    } else if (typeof obj.getBoundingRect === "function") {
      const r = obj.getBoundingRect();
      box = makeBox(r.left, r.top, r.width, r.height);
    } else {
      const left = obj.left ?? 0;
      const top = obj.top ?? 0;
      box = makeBox(left, top, (obj.width ?? 0) * (obj.scaleX ?? 1), (obj.height ?? 0) * (obj.scaleY ?? 1));
    }
    if (box) {
      if (obj.id) box.id = obj.id;
      box.kind = obj.type === "group" ? "group" : obj.type === "activeselection" ? "selection" : "element";
    }
    return box;
  } catch {
    return null;
  }
}

export function getCanvasBox(canvas: any): Box {
  const width = Number(canvas?.width) || Number(canvas?.getWidth?.()) || 0;
  const height = Number(canvas?.height) || Number(canvas?.getHeight?.()) || 0;
  const b = makeBox(0, 0, width, height);
  b.kind = "canvas";
  return b;
}

// Reference boxes for guides: every other visible, non-border object on the
// active page. Excludes the moving object AND, when moving a selection/group, its
// children (so the selection never aligns to its own members). Locked elements
// stay as targets (they just can't be moved).
export function getReferenceBoxes(canvas: any, movingObj: any): Box[] {
  if (!canvas?.getObjects) return [];
  const exclude = new Set<any>([movingObj]);
  const kids = movingObj?.getObjects?.();
  if (Array.isArray(kids)) for (const k of kids) exclude.add(k);
  const boxes: Box[] = [];
  for (const o of canvas.getObjects()) {
    if (exclude.has(o)) continue;
    if (o.visible === false) continue;
    if (o.isBorder) continue;
    const box = getElementBox(o);
    if (box) boxes.push(box);
  }
  return boxes;
}

// Back-compat alias for the original (single-object) collector.
export function getOtherBoxes(canvas: any, movingObj: any): Box[] {
  return getReferenceBoxes(canvas, movingObj);
}

// ── Renderer ─────────────────────────────────────────────────────────────────
// Draw guides onto a 2D context, converting scene → screen px with the canvas
// viewportTransform. Line widths / fonts stay constant regardless of zoom.
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

function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number) {
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padX = 4;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 14;
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
