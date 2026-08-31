---
name: verify
description: Drive the running dev editor headlessly with Playwright + system Edge to verify canvas interactions end-to-end.
---

# Verifying canvas-editor changes

The dev server is usually already running at `http://localhost:3000` (check with a quick request; if not, `npm run dev`). Next.js hot-reloads source edits, so no rebuild is needed.

## Launch

`playwright` is a devDependency with **no bundled browser** — use the system Edge:

```js
const { chromium } = require('<repo>/node_modules/playwright'); // absolute path if script lives outside the repo
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:3000/editor', { waitUntil: 'networkidle' });
await page.waitForSelector('canvas.upper-canvas');
```

## Driving the editor

- Sidebar tabs: `page.getByRole('button', { name: 'elements Elements' })` (plain `getByText('Elements')` is ambiguous — it also matches the mobile toolbar label). Shape buttons by aria-label: `Ellipse`, `Rect`, `Line`, `Polygon`, `Star`, `Polyline` (no "Square", no "Circle", no "Triangle" — a triangle is a 3-point Polygon). Only the first three render until the "See All" toggle is clicked.
- `addShape` places shapes at scene ~(100,100). At default zoom with a 1600×900 viewport, scene→screen ≈ `(x+615, y+128)` — but re-derive it empirically: add a Rect (scene 100,100, 120×80), screenshot, read its on-screen center. The Inspector shows exact X/Y/W/H for the selection.
- **Objects default to a CENTRE origin** (`originX`/`originY` are `'center'`), so `left`/`top` are the object's centre, not its top-left corner. Assert placement with `getBoundingRect()`, and position objects with `setPositionByOrigin`.
- Draw tools are armed by clicking their palette button, then driven with canvas gestures. Escape cancels the Ellipse/Text tools and removes their draft; for the pen it finishes the path instead (see below). The tip line under the canvas is contextual — it names the live gesture while drawing or point-editing, which is the quickest way to confirm which mode the editor thinks it is in. **Ellipse**: press-drag-release (Shift constrains to a circle). **Line is a vector pen**: click drops a corner anchor, click-and-drag pulls out a symmetric direction handle and curves the segment (Illustrator's pen — there is NO drag-to-finish shortcut). Enter, Escape, or a double-click finishes the path, and clicking back on the first anchor closes it — Escape KEEPS what has been drawn (2+ anchors) rather than discarding it, and only drops a lone stray anchor. So a single straight line is: click, click, Enter. It always produces a `fabric.Path`: straight runs are `L` commands, curved ones `C`, plus a trailing `Z` when closed. The handle methods are `enterPenTool`/`exitPenTool` (not `enterLineTool`), and `isDrawToolActive()` reports whether any draw tool is armed.
- Pen anchors and the "close the path" ring are painted directly onto the canvas in `after:render` (like the smart guides), not added as fabric objects — so don't look for them in `getObjects()`.
- **Point editing (direct selection)**: double-click a path to swap its transform box for its anchors. A `path` uses `controlsUtils.createPathControls` — anchors keyed `c_<i>_<TYPE>` plus bezier handles keyed `c_<i>_C_CP_1`/`_CP_2` that draw dashed leaders to their anchor; a `polyline`/`polygon` uses `createPolyControls`, keyed `p0`, `p1`, …. Drag an anchor or handle to reshape, Alt-click an *anchor* to delete it (an open path keeps 2 points, a closed one 3), Escape to leave. Read control screen positions from `obj.oCoords[key]` scaled by `upperCanvasEl.getBoundingClientRect().width / canvas.getWidth()`. Hand-editing a star/polygon anchor clears `shapeKind`/`pointCount`/`innerRatio`, so the Inspector's Count and Ratio disappear.
- When wrapping a fabric control's `actionHandler`, use a plain `function` and `move.call(this, …)`. The path handlers read `commandIndex`/`pointIndex` off `this` (the control), so an arrow wrapper silently strips the binding and every handle drag throws. Poly handlers close over their index and won't show the bug.
- When changing an object's control set at runtime, rebuild `controls` **before** calling `setCoords()`: `oCoords` is derived from the control set and is what `findControl` walks on the next hover, so a stale entry makes fabric dereference a control that no longer exists.
- Polygon/star point count and star ratio are Inspector sliders under Appearance: `aside input[type="range"][min="3"][max="30"]` and `[min="1"][max="100"]`. Use `fill()` then `dispatchEvent('change')`.
- Multi-select: shift+click a second object (fabric default `selectionKey`). Inspector header reads `ActiveSelection` when a multi-selection is active.
- Delete surfaces: keyboard `Delete`/`Backspace`; right-click context menu (accessible name `Delete Del` — the plain-`Delete` button match hits the Inspector's red Delete instead, which lives in `aside`); Inspector red Delete button (`page.locator('aside').getByRole('button', { name: 'Delete', exact: true })`).
- Page nav: the footer pager buttons are `◀` / `▶` with a `Page N / M` label between them; `+ Page` adds one. Canvas swipes also navigate, but they're timing-sensitive — prefer the buttons.
- Observables: screenshots + Inspector panel text ("Select an element to customize it" when nothing selected). In dev builds the fabric canvas is exposed as `window.__canvas` (set in CanvasEditor init) — use `page.evaluate` on it to inspect object state or dump `__canvas.lowerCanvasEl.toDataURL()`.
- Adding text: clicking the sidebar "Text" tab item drops a textbox at canvas center (default font Times New Roman). Inspector's first `aside select` is Font Family.

## Cleanup

The editor loads a real template ("Bride & Groom") with a cloud/save indicator — restore state after destructive tests by clicking undo repeatedly: `page.getByRole('button', { name: 'Undo' })` (`button:has(img[alt="Undo"])` matches two elements). Ctrl+Z is not handled by the keydown handler.

## Gotchas

- The `canvas.upper-canvas` element covers only the page/card, not the surrounding workspace; its boundingBox is the card.
- **The bottom ~10% of that box is covered by `DIV.footer-side` / the event footer bar**, which sits above the canvas in the DOM and swallows clicks. A canvas click near the bottom edge silently never reaches fabric — it looks like a dropped interaction. Keep scripted canvas clicks clear of the footer, or check with `document.elementFromPoint` when a gesture mysteriously doesn't register.
- Static reading of CanvasEditor.tsx repeatedly misses interaction bugs — always script the exact user gesture.
- **Headless screenshots can show a stale canvas**: the compositor may not present frames the app painted outside user interaction (nondeterministic — cost hours chasing a "bug" that was env-only). For canvas-content assertions, trust `window.__canvas.lowerCanvasEl.toDataURL()` over `page.screenshot()`; any real interaction (click) also forces a fresh composite.
