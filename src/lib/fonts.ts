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
const SYSTEM_FONTS = new Set(["Arial", "Times New Roman", "Georgia", "Helvetica", "serif", "sans-serif", "monospace"]);

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

// Dedupe: each family injects its stylesheet at most once per session.
const injected = new Set<string>();
const loading = new Map<string, Promise<void>>();

function injectStylesheet(family: string) {
  if (injected.has(family)) return;
  injected.add(family);
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.fontLoader = family;
  document.head.appendChild(link);
}

// Ensure a single font family is available, resolving once its glyphs are ready.
// Safe to call repeatedly and on the server (no-ops without a document).
export function loadGoogleFont(family: string): Promise<void> {
  if (!family || typeof document === "undefined") return Promise.resolve();
  if (SYSTEM_FONTS.has(family)) return Promise.resolve();
  const existing = loading.get(family);
  if (existing) return existing;

  const promise = (async () => {
    if (!PRELOADED_FONTS.has(family)) injectStylesheet(family);
    if ((document as any).fonts?.load) {
      try {
        // Load a couple of weights so bold text gets a real face when available.
        await Promise.all([
          (document as any).fonts.load(`1em "${family}"`),
          (document as any).fonts.load(`700 1em "${family}"`),
        ]);
      } catch {
        /* font may not expose that weight — faux styling will apply */
      }
    }
  })();

  loading.set(family, promise);
  return promise;
}

// Extract every fontFamily referenced by a Fabric JSON page (or array of pages).
export function collectFontFamilies(pageOrPages: any): string[] {
  const families = new Set<string>();
  const visit = (objs: any[]) => {
    if (!Array.isArray(objs)) return;
    for (const o of objs) {
      if (o?.fontFamily) families.add(String(o.fontFamily));
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
