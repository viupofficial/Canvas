// Shared font registry + dynamic Google Fonts loader.
//
// Fonts are loaded lazily: a <link> to the Google Fonts CSS is injected the first
// time a family is actually used (selected, or found in a loaded design), so the
// editor doesn't pull ~40 font files up front. System fonts and the families
// already pulled in via globals.css don't need a network request.

export type FontGroup = { label: string; fonts: string[] };

// Grouped for the dropdowns. The first group keeps every font that previously
// existed in the editor so nothing is removed.
export const FONT_GROUPS: FontGroup[] = [
  {
    label: "Basic",
    fonts: [
      "Arial",
      "Times New Roman",
      "Georgia",
      "Inter",
      "Roboto",
      "Open Sans",
      "Lato",
      "Montserrat",
      "Poppins",
      "Oswald",
    ],
  },
  {
    label: "Elegant",
    fonts: [
      "Playfair Display",
      "Cormorant Garamond",
      "Alice",
      "Alegreya",
      "Cinzel",
      "Bodoni Moda",
      "Libre Baskerville",
      "Prata",
      "Lora",
      "Crimson Text",
      "Cardo",
      "Marcellus",
      "Great Vibes",
      "Dancing Script",
      "Sacramento",
      "Parisienne",
      "Allura",
      "Alex Brush",
      "Pacifico",
      "Edwardian Script ITC",
    ],
  },
  {
    label: "Modern",
    fonts: [
      "Nunito",
      "Raleway",
      "Quicksand",
      "DM Sans",
      "Manrope",
      "Mulish",
      "Work Sans",
      "Urbanist",
      "Plus Jakarta Sans",
    ],
  },
  {
    label: "Handwritten",
    fonts: [
      "Caveat",
      "Kalam",
      "Patrick Hand",
      "Handlee",
      "Merienda",
      "Fredoka",
      "Baloo 2",
      "Comic Neue",
    ],
  },
  {
    label: "Formal",
    fonts: [
      "Amiri",
      "El Messiri",
      "Scheherazade New",
      "Lateef",
      "Aref Ruqaa",
      "Noto Serif",
      "Noto Naskh Arabic",
    ],
  },
];

export const ALL_FONTS: string[] = FONT_GROUPS.flatMap((g) => g.fonts);

// Locally available / system fonts — never need a Google Fonts request.
const SYSTEM_FONTS = new Set(["Arial", "Times New Roman", "Georgia", "Helvetica", "serif", "sans-serif", "monospace", "Edwardian Script ITC"]);

// Families already declared in globals.css; still safe to (re)load dynamically,
// but we skip them to avoid a redundant network request.
const PRELOADED_FONTS = new Set([
  "Montserrat",
  "Poppins",
  "Roboto",
  "Inter",
  "Open Sans",
  "Playfair Display",
  "Pacifico",
  "Alex Brush",
  "Lato",
  "Oswald",
]);

// Dedupe: each family injects its stylesheet at most once per session. The
// stored promise resolves when the stylesheet has ACTUALLY loaded — callers
// must await it before document.fonts.load(), because until the CSS is parsed
// the browser has no @font-face for the family and fonts.load() resolves
// immediately with an empty result (reporting "loaded" while the canvas is
// still painting the fallback serif).
const injected = new Map<string, Promise<void>>();
const loading = new Map<string, Promise<void>>();

function injectStylesheet(family: string): Promise<void> {
  const existing = injected.get(family);
  if (existing) return existing;
  const promise = new Promise<void>((resolve) => {
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.fontLoader = family;
    // Resolve on error too — a failed fetch should degrade to the fallback
    // font, not hang every caller awaiting this family.
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
    // Safety valve if neither event ever fires (some in-app webviews).
    setTimeout(resolve, 4000);
  });
  injected.set(family, promise);
  return promise;
}

// Ensure a single font family is available, resolving once its glyphs are ready.
// Safe to call repeatedly and on the server (no-ops without a document).
export function loadGoogleFont(family: string): Promise<void> {
  if (!family || typeof document === "undefined") return Promise.resolve();
  if (SYSTEM_FONTS.has(family)) return Promise.resolve();
  const existing = loading.get(family);
  if (existing) return existing;

  const promise = (async () => {
    // Wait for the stylesheet to be parsed BEFORE asking FontFaceSet to load —
    // the other order is a race that silently resolves without the font.
    if (!PRELOADED_FONTS.has(family)) await injectStylesheet(family);
    const fontSet = (document as any).fonts;
    if (fontSet?.load) {
      try {
        // Load a couple of weights so bold text gets a real face when available.
        await Promise.all([
          fontSet.load(`1em "${family}"`),
          fontSet.load(`700 1em "${family}"`),
        ]);
      } catch {
        /* font may not expose that weight — faux styling will apply */
      }
      // Preloaded families come from the globals.css @import, which can still
      // be in flight on a cold load. If the face isn't actually available yet,
      // fall back to our own <link> and retry once.
      if (PRELOADED_FONTS.has(family) && fontSet.check && !fontSet.check(`1em "${family}"`)) {
        await injectStylesheet(family);
        try {
          await fontSet.load(`1em "${family}"`);
        } catch {}
      }
    }
  })();

  loading.set(family, promise);
  return promise;
}

// Extract every fontFamily referenced by a Fabric JSON page (or array of pages).
export function collectFontFamilies(pageOrPages: any): string[] {
  const families = new Set<string>();
  // Selection-level font changes live in the object's `styles`, not its
  // top-level fontFamily. Fabric serializes them either as the legacy nested
  // map ({ line: { char: { fontFamily } } }) or the v6+ ranged array
  // ([{ start, end, style: { fontFamily } }]).
  const visitStyles = (styles: any) => {
    if (!styles) return;
    if (Array.isArray(styles)) {
      for (const s of styles) {
        if (s?.style?.fontFamily) families.add(String(s.style.fontFamily));
      }
      return;
    }
    if (typeof styles !== "object") return;
    for (const line of Object.values(styles)) {
      if (!line || typeof line !== "object") continue;
      for (const ch of Object.values(line as Record<string, any>)) {
        if (ch?.fontFamily) families.add(String(ch.fontFamily));
      }
    }
  };
  const visit = (objs: any[]) => {
    if (!Array.isArray(objs)) return;
    for (const o of objs) {
      if (o?.fontFamily) families.add(String(o.fontFamily));
      visitStyles(o?.styles);
      if (Array.isArray(o?.objects)) visit(o.objects); // groups
    }
  };
  if (Array.isArray(pageOrPages)) {
    for (const p of pageOrPages) visit(p?.objects ?? []);
  } else {
    visit(pageOrPages?.objects ?? []);
  }
  return [...families];
}

// Preload all fonts used by a design. Resolves when they're ready (or skipped).
export function preloadFonts(families: string[]): Promise<void> {
  return Promise.all(families.map((f) => loadGoogleFont(f))).then(() => undefined);
}
