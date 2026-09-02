// Single source of truth for the "Share PDF" page geometry.
//
// The old export handed jsPDF the canvas size in its `px` unit, which jsPDF
// scales at 1px = 1.333pt — so a 396x704 canvas came out as a 7.3in x 13in
// sheet, far bigger than the artwork it holds. Everything here works in
// millimetres instead, and the canvas is converted at the CSS 96dpi it was
// designed against, so "Canvas size" paper is physically what the editor shows.
//
// The export modal previews with `computeLayout` and the writer places the
// image with the SAME function, so what the user approves is what downloads.

export type PaperId = "canvas" | "a4" | "a5" | "a6" | "letter" | "square";
export type PdfOrientation = "auto" | "portrait" | "landscape";
// contain = whole page visible, letterboxed. cover = fills the sheet, edges
// cropped. stretch = fills the sheet, aspect ratio distorted.
export type PdfFit = "contain" | "cover" | "stretch";

export type PdfExportOptions = {
  paper: PaperId;
  orientation: PdfOrientation;
  fit: PdfFit;
  // Blank border kept on all four sides, in mm.
  marginMm: number;
  // Paint behind the artwork (letterbox bars and the margin).
  background: string;
  // Offscreen render multiplier: 1 = screen size, 3 = print sharp.
  quality: 1 | 2 | 3;
  // Canvas page indices to include, in output order.
  pages: number[];
};

// Portrait (w, h) in mm. `canvas` is derived from the artwork instead.
export const PAPER_SIZES: Record<Exclude<PaperId, "canvas">, [number, number]> = {
  a4: [210, 297],
  a5: [148, 210],
  a6: [105, 148],
  letter: [215.9, 279.4],
  square: [210, 210],
};

export const PAPER_LABELS: Record<PaperId, string> = {
  canvas: "Canvas size",
  a4: "A4",
  a5: "A5",
  a6: "A6",
  letter: "Letter",
  square: "Square",
};

// The canvas is authored in CSS pixels, which are 96 per inch by definition.
export const pxToMm = (px: number): number => (px / 96) * 25.4;

export const DEFAULT_PDF_OPTIONS: Omit<PdfExportOptions, "pages"> = {
  paper: "canvas",
  orientation: "auto",
  fit: "contain",
  marginMm: 0,
  background: "#ffffff",
  quality: 2,
};

export function defaultPdfOptions(pageCount: number): PdfExportOptions {
  return {
    ...DEFAULT_PDF_OPTIONS,
    pages: Array.from({ length: Math.max(0, pageCount) }, (_, i) => i),
  };
}

// Sheet size in mm, already turned the way `orientation` asks for. "auto"
// keeps the artwork's own orientation so a tall invitation lands on a tall
// sheet without the user having to say so.
export function resolvePaperMm(
  opts: Pick<PdfExportOptions, "paper" | "orientation">,
  srcW: number,
  srcH: number
): [number, number] {
  const [pw, ph] =
    opts.paper === "canvas"
      ? [pxToMm(srcW), pxToMm(srcH)]
      : PAPER_SIZES[opts.paper];

  const wantLandscape =
    opts.orientation === "landscape" ||
    (opts.orientation === "auto" && srcW > srcH);

  const isLandscape = pw > ph;
  return wantLandscape === isLandscape ? [pw, ph] : [ph, pw];
}

export type PdfLayout = {
  // Sheet, in mm.
  pageW: number;
  pageH: number;
  // Where the artwork sits on the sheet, in mm.
  x: number;
  y: number;
  w: number;
  h: number;
  // Applied margin (clamped so it can never swallow the sheet).
  margin: number;
  // Source rectangle to take from the rendered page image, in source px.
  // Only "cover" crops; the others read the whole image.
  crop: { x: number; y: number; w: number; h: number };
};

export function computeLayout(
  opts: Pick<PdfExportOptions, "paper" | "orientation" | "fit" | "marginMm">,
  srcW: number,
  srcH: number
): PdfLayout {
  const [pageW, pageH] = resolvePaperMm(opts, srcW, srcH);

  // A margin at/over half the short edge would leave nothing to print on.
  const maxMargin = Math.max(0, Math.min(pageW, pageH) / 2 - 1);
  const margin = Math.min(Math.max(0, opts.marginMm), maxMargin);
  const innerW = pageW - margin * 2;
  const innerH = pageH - margin * 2;

  let w = innerW;
  let h = innerH;
  let crop = { x: 0, y: 0, w: srcW, h: srcH };

  if (opts.fit === "contain") {
    const scale = Math.min(innerW / srcW, innerH / srcH);
    w = srcW * scale;
    h = srcH * scale;
  } else if (opts.fit === "cover") {
    // Fill the sheet and crop the overflow, centred.
    const scale = Math.max(innerW / srcW, innerH / srcH);
    const cropW = Math.min(srcW, innerW / scale);
    const cropH = Math.min(srcH, innerH / scale);
    crop = { x: (srcW - cropW) / 2, y: (srcH - cropH) / 2, w: cropW, h: cropH };
  }

  return {
    pageW,
    pageH,
    x: margin + (innerW - w) / 2,
    y: margin + (innerH - h) / 2,
    w,
    h,
    margin,
    crop,
  };
}

// Human-readable sheet size for the modal ("104.8 × 186.3 mm").
export function formatPaperSize(pageW: number, pageH: number): string {
  const r = (n: number) => (Math.round(n * 10) / 10).toString();
  return `${r(pageW)} × ${r(pageH)} mm`;
}

// "Cover" crops the artwork before it reaches jsPDF — jsPDF has no reliable
// clip for a placed image, so the overflow is cut here instead. `crop` is in
// source-canvas units; the rendered PNG may be a multiple of that size.
export function cropImageDataUrl(
  dataUrl: string,
  crop: { x: number; y: number; w: number; h: number },
  srcW: number,
  srcH: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.naturalWidth / srcW || 1;
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(crop.w * scale));
      out.height = Math.max(1, Math.round(crop.h * scale));
      const ctx = out.getContext("2d");
      if (!ctx) return reject(new Error("Could not crop the page image."));
      ctx.drawImage(
        img,
        crop.x * scale,
        crop.y * scale,
        crop.w * scale,
        crop.h * scale,
        0,
        0,
        out.width,
        out.height
      );
      resolve(out.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Could not read the page image."));
    img.src = dataUrl;
  });
}
