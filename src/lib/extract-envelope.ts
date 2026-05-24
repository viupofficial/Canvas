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

  function toRelativeSrc(src: string): string {
    try {
      const url = new URL(src);
      return url.pathname;
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
    remainingPages: pages.slice(1),
  };
}
