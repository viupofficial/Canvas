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

- Sidebar tabs by text: `page.getByText('Elements', { exact: true })`. Shape buttons by aria-label: `Circle`, `Ellipse`, `Line`, `Polygon`, `Polyline`, `Rect`, `Triangle` (no "Square").
- `addShape` places shapes at scene ~(100,100). At default zoom with a 1600×900 viewport, scene→screen ≈ `(x+615, y+128)` — but re-derive it empirically: add a Circle (scene 100,100, size 80), screenshot, read its on-screen center. The Inspector shows exact X/Y/W/H for the selection.
- Multi-select: shift+click a second object (fabric default `selectionKey`). Inspector header reads `ActiveSelection` when a multi-selection is active.
- Delete surfaces: keyboard `Delete`/`Backspace`; right-click context menu (accessible name `Delete Del` — the plain-`Delete` button match hits the Inspector's red Delete instead, which lives in `aside`); Inspector red Delete button (`page.locator('aside').getByRole('button', { name: 'Delete', exact: true })`).
- Observables: screenshots + Inspector panel text ("Select an element to customize it" when nothing selected). In dev builds the fabric canvas is exposed as `window.__canvas` (set in CanvasEditor init) — use `page.evaluate` on it to inspect object state or dump `__canvas.lowerCanvasEl.toDataURL()`.
- Adding text: clicking the sidebar "Text" tab item drops a textbox at canvas center (default font Times New Roman). Inspector's first `aside select` is Font Family.

## Cleanup

The editor loads a real template ("Bride & Groom") with a cloud/save indicator — restore state after destructive tests by clicking undo repeatedly: `page.locator('button:has(img[alt="Undo"])')`. Ctrl+Z is not handled by the keydown handler.

## Gotchas

- The `canvas.upper-canvas` element covers only the page/card, not the surrounding workspace; its boundingBox is the card.
- Static reading of CanvasEditor.tsx repeatedly misses interaction bugs — always script the exact user gesture.
- **Headless screenshots can show a stale canvas**: the compositor may not present frames the app painted outside user interaction (nondeterministic — cost hours chasing a "bug" that was env-only). For canvas-content assertions, trust `window.__canvas.lowerCanvasEl.toDataURL()` over `page.screenshot()`; any real interaction (click) also forces a fresh composite.
