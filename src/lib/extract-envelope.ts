export type EnvPos = {
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  originX: "left" | "center" | "right";
  originY: "top" | "center" | "bottom";
};

function bbox(o: any): EnvPos {
  return {
    left: o?.left ?? 0,
    top: o?.top ?? 0,
    width: (o?.width ?? 0) * (o?.scaleX ?? 1),
    height: (o?.height ?? 0) * (o?.scaleY ?? 1),
    angle: o?.angle ?? 0,
    originX: (o?.originX ?? "left") as EnvPos["originX"],
    originY: (o?.originY ?? "top") as EnvPos["originY"],
  };
}

const EMPTY_POS: EnvPos = { left: 0, top: 0, width: 0, height: 0, angle: 0, originX: "left", originY: "top" };

// Any element the user adds to the envelope page beyond the recognized parts
// (head/seal/body/logo images + the three known texts). These are carried
// through so the player's cover can render them — otherwise custom texts like
// the couple's names would silently vanish from previews and the live page.
export type EnvelopeExtra = {
  kind: "text" | "image";
  text?: string;
  src?: string;
  pos: EnvPos;
  style?: any;
};

export type EnvelopeExtract = {
  hasEnvelope: boolean;
  headSrc: string;
  sealSrc: string;
  bodySrc: string;
  logoSrc: string;
  bgColor: string;
  titleText: string;
  subtitleText: string;
  pressText: string;
  headPos: EnvPos;
  sealPos: EnvPos;
  bodyPos: EnvPos;
  logoPos: EnvPos;
  titlePos: EnvPos;
  subtitlePos: EnvPos;
  pressPos: EnvPos;
  titleStyle: any;
  subtitleStyle: any;
  pressStyle: any;
  extras: EnvelopeExtra[];
  remainingPages: any[];
};

export function extractEnvelope(pages: any[]): EnvelopeExtract {
  const empty: EnvelopeExtract = {
    hasEnvelope: false,
    headSrc: "", sealSrc: "", bodySrc: "", logoSrc: "",
    bgColor: "#f5e8dd",
    titleText: "Undangan", subtitleText: "Walimatulurus", pressText: "Press to open",
    headPos: EMPTY_POS, sealPos: EMPTY_POS, bodyPos: EMPTY_POS, logoPos: EMPTY_POS,
    titlePos: EMPTY_POS, subtitlePos: EMPTY_POS, pressPos: EMPTY_POS,
    titleStyle: null, subtitleStyle: null, pressStyle: null,
    extras: [],
    remainingPages: pages ?? [],
  };

  if (!pages || pages.length === 0) return empty;

  const first = pages[0];
  const objects: any[] = first?.objects ?? [];
  const imgObjects = objects.filter((o: any) => o.type?.toLowerCase() === "image");

  function matchImg(name: string, filename: string) {
    return imgObjects.find((o: any) =>
      o.name === name || (o.src && String(o.src).replace(/\?.*$/, "").toLowerCase().endsWith("/" + filename))
    );
  }

  const headObj = matchImg("envelope-head", "head.png");
  const sealObj = matchImg("envelope-seal", "seal.png");
  const bodyObj = matchImg("envelope-body", "body.png");

  if (!headObj || !sealObj || !bodyObj) {
    return { ...empty, remainingPages: pages };
  }

  const texts = objects.filter((o: any) => o.type?.toLowerCase() === "textbox" || o.type?.toLowerCase() === "text");
  const titleObj = texts.find((o: any) => o.text?.toLowerCase().includes("undangan"));
  const subObj   = texts.find((o: any) => o.text?.toLowerCase().includes("walimatulurus"));
  const pressObj = texts.find((o: any) => o.text?.toLowerCase().includes("press"));

  const headSrc = headObj.src ?? "/head.png";
  const sealSrc = sealObj.src ?? "/seal.png";
  const bodySrc = bodyObj.src ?? "/body.png";
  const logoObj = imgObjects.find((o: any) =>
    o.src !== headSrc && o.src !== sealSrc && o.src !== bodySrc
  );

  // Make the app's own public assets (/head.png, /body.png, …) portable across
  // domains by reducing them to a pathname, but leave cross-origin URLs intact.
  // Edited parts live on Vercel Blob storage (a different host); stripping those
  // to a pathname pointed the preview/live page at a same-origin file that 404s,
  // so the edited head/body/seal vanished. Only relativize same-origin URLs.
  function toRelativeSrc(src: string): string {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : undefined;
      const url = new URL(src, origin);
      // Same-origin (our public/ assets) → relative path. Cross-origin (blob
      // storage, other CDNs) → keep the absolute URL so it still resolves.
      if (origin && url.origin === origin) return url.pathname;
      return src;
    } catch {
      return src;
    }
  }

  function textStyle(o: any) {
    if (!o) return null;
    return {
      fontFamily: o.fontFamily ?? "serif",
      fontStyle: o.fontStyle ?? "italic",
      fontWeight: o.fontWeight ?? "normal",
      fontSize: o.fontSize ?? 20,
      fill: o.fill ?? "#2f2f2f",
      textAlign: o.textAlign ?? "left",
      lineHeight: o.lineHeight ?? 1.16,
    };
  }

  // Everything else on the envelope page (custom texts like the couple's
  // names, decorative images) rides along so the cover can render it. The
  // border overlay is excluded — the player draws it separately via borderUrl.
  const consumed = new Set<any>(
    [headObj, sealObj, bodyObj, logoObj, titleObj, subObj, pressObj].filter(Boolean)
  );
  const extras: EnvelopeExtra[] = objects
    .map((o: any): EnvelopeExtra | null => {
      if (consumed.has(o) || o?.isBorder) return null;
      const t = String(o?.type ?? "").toLowerCase();
      if (t === "textbox" || t === "text") {
        const s = textStyle(o);
        return {
          kind: "text",
          text: o.text ?? "",
          pos: bbox(o),
          // bbox() scales the box, so scale the font with it — fabric sizes
          // text through scaleX/scaleY, not fontSize.
          style: s ? { ...s, fontSize: (o.fontSize ?? 20) * (o.scaleY ?? 1) } : null,
        };
      }
      if (t === "image" && o.src) {
        return { kind: "image", src: toRelativeSrc(o.src), pos: bbox(o) };
      }
      return null;
    })
    .filter((e): e is EnvelopeExtra => e !== null);

  return {
    hasEnvelope: true,
    headSrc: toRelativeSrc(headSrc),
    sealSrc: toRelativeSrc(sealSrc),
    bodySrc: toRelativeSrc(bodySrc),
    logoSrc: logoObj ? toRelativeSrc(logoObj.src ?? "") : "",
    bgColor: first.background ?? "#f5e8dd",
    titleText: titleObj?.text ?? "Undangan",
    subtitleText: subObj?.text ?? "Walimatulurus",
    pressText: pressObj?.text ?? "Press to open",
    headPos: bbox(headObj),
    sealPos: bbox(sealObj),
    bodyPos: bbox(bodyObj),
    logoPos: logoObj ? bbox(logoObj) : EMPTY_POS,
    titlePos: titleObj ? bbox(titleObj) : EMPTY_POS,
    subtitlePos: subObj ? bbox(subObj) : EMPTY_POS,
    pressPos: pressObj ? bbox(pressObj) : EMPTY_POS,
    titleStyle: textStyle(titleObj),
    subtitleStyle: textStyle(subObj),
    pressStyle: textStyle(pressObj),
    extras,
    remainingPages: pages.slice(1),
  };
}
