---
name: fabric-v7-tojson-ignores-args
description: Fabric v7 Canvas.toJSON() ignores propertiesToInclude; use toObject() to persist custom props
metadata:
  type: project
---

In Fabric.js v7, `Canvas.toJSON()` takes NO arguments — it is implemented as `toJSON() { return this.toObject(); }`, so any `propertiesToInclude` array passed to it is silently discarded and custom props are dropped on serialize. To persist custom props (the `FABRIC_EXPORT_PROPS` list: `name`, `linkUrl`, `locked`, `action`, `animationType`, `targetPage`, etc.) you MUST call `canvas.toObject([...props])` instead.

`serializeCanvas` in src/components/CanvasEditor.tsx originally used `toJSON([...FABRIC_EXPORT_PROPS])` and was therefore stripping all custom props from every saved page — a latent app-wide persistence bug (broke links/locking/animations across page switch + save/reload). Fixed by switching to `toObject(...)`. Object-level serialize calls in the same file already used `toObject([...props])` correctly.

**Why:** the bug surfaced when a gallery-page toggle that detects pages by object `name` couldn't find the page to delete, because `name` never made it into the serialized JSON.

**How to apply:** never use `canvas.toJSON(args)` in this codebase; use `canvas.toObject(args)`.
