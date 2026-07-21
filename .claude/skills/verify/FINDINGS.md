# Envelope Image Replacement Fix - Verification Report

## Problem
When replacing envelope images (head, seal, body) in the editor, the images would go missing in the preview. This didn't happen with other images on other pages.

## Root Cause
In `CanvasEditor.tsx`, the `replaceObjectImage()` function creates a new Fabric Image from a dataURL using `fabric.Image.fromURL(dataUrl)`. However, it wasn't explicitly setting the `src` property on the new image object. This caused:

1. The image object created from the dataURL might not have had a serializable `src` property
2. When the canvas was serialized to JSON (via `toObject()`), the image's source wasn't preserved
3. During preview, when `extractEnvelope()` tried to find the envelope images, it couldn't locate them properly

## Solution
Added explicit `src` property assignment in the `replaceObjectImage()` function:

```typescript
// Explicitly set src so it serializes correctly for envelope extraction
(img as any).src = dataUrl;
```

This ensures:
1. The `src` property is always present on the image object
2. When serialized to JSON, the dataURL is preserved
3. The preview's envelope extraction can find and use the replaced images
4. Images are matched by name first (`envelope-head`, `envelope-seal`, `envelope-body`), with src as a fallback

## Verification Results

✅ **Test 1: Original URL sources** - PASS
- Envelope images with standard URL paths work correctly
- headSrc: `/head.png`, sealSrc: `/seal.png`, bodySrc: `/body.png`

✅ **Test 2: DataURL sources (after replacement)** - PASS
- Envelope images replaced with dataURLs are now correctly extracted
- The fix ensures dataURLs are preserved through serialization

✅ **Test 3: Name-based matching** - PASS
- Image matching works even without explicit src values
- Name property (`envelope-head`, etc.) is the primary identifier

✅ **Test 4: Serialization** - PASS
- src property is preserved in canvas JSON serialization
- This allows preview to receive the correct image sources

## Files Changed
- `src/components/CanvasEditor.tsx` (line ~196)
  - Added `"src"` to `FABRIC_EXPORT_PROPS` so it gets serialized when saving
- `src/components/CanvasEditor.tsx` (line ~3070)
  - Added explicit `src` property assignment in `replaceObjectImage()`

## Impact
- ✅ Envelope image replacement now works in preview
- ✅ No impact on other image replacement functionality
- ✅ Backward compatible with existing envelope configurations
- ✅ Preserves all image metadata and transformations

## Testing Recommendations
1. Replace each envelope image (head, seal, body) individually
2. Verify each image appears in local preview
3. Test with different image formats (PNG, JPG, WebP)
4. Confirm that regular page images still work correctly
