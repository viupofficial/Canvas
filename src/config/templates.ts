// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE DESIGN DATA — the single source of truth.
//
// Everything about how a template LOOKS lives in this file: its pages, the
// elements on each page, their positions, sizes, fonts, colours and assets.
// Nothing here executes against the canvas; the loader compiles these
// definitions into the same Fabric page JSON the editor has always stored.
//
//   templates.ts (this file)  → what a design IS
//   templateLoader.ts         → getTemplate / buildTemplatePages (deep-cloned)
//   templateElementFactory.ts → element definition → Fabric JSON
//   templateAssetResolver.ts  → where the media is hosted
//   templateValidation.ts     → dev-time warnings
//   CanvasEditor / player     → all runtime behaviour, unchanged
//
// ── ADDING A NEW TEMPLATE ───────────────────────────────────────────────────
// 1. Media:
//      • hosted by Vercel — drop the files in public/templates/<slug>/ and set
//        baseAssetPath to that folder;
//      • hosted by iFastNet — upload nothing here. Set
//          assetProvider: "ifastnet",
//          remoteTemplateId: <the numeric template id on vi-up.com>
//        and reference each file by the name the asset manifest reports
//        (https://vi-up.com/api/template-assets.php?template_id=<id> lists
//        them). The files stay on vi-up.com and are loaded from there.
// 2. Add one entry to `templates` at the bottom of this file.
// 3. Give it pages: reuse a shared block ({ block: "gallery" }) or spell a page
//    out inline ({ id, elements: [...] }).
// That is the whole job — no new renderer, no new component, no switch
// statement, no other file to touch.
//
// One caveat when mixing the two: a SHARED BLOCK referenced from a remote
// template resolves its own assets against that template's remote folder
// (block "gallery" would look for aiCouple-1.png on vi-up.com). Blocks with no
// images — countdown — are safe to reuse anywhere; for the rest, spell the page
// out inline, as the Tunku Ismail x Farah Elise template below does.
//
// ── SVG ASSETS: THE FILE MUST DECLARE width AND height ──────────────────────
// An .svg whose root tag has only a `viewBox` renders as an enlarged TOP-LEFT
// CROP of itself on the canvas, and only on retina displays — which is most of
// them. Chromium rasterizes such a file at the device scale (so 2x its reported
// naturalWidth/naturalHeight) while fabric's drawImage source rect still
// indexes the 1x intrinsic box, so it samples a quarter of the bitmap and
// stretches it. Nothing in this repo can fix that from the template side: the
// source rect is capped at `naturalWidth` inside fabric's Image._renderFill.
//   ✓ <svg width="217" height="76" viewBox="0 0 217 76">   renders correctly
//   ✗ <svg viewBox="0 0 764.4 435.84">                     renders cropped
// So: check the file before using an SVG, and prefer the PNG if there is one.
// (This is why Crimson Velvet uses BG_Monogram.png rather than its B&G.svg
// wordmark, and skips Bordeline.svg entirely.)
//
// ── WHAT MUST NOT CHANGE ────────────────────────────────────────────────────
// Some `name` values are FUNCTIONAL, not decoration. The editor and the
// published invitation find elements by them:
//   envelope-head / envelope-seal / envelope-body → the openable envelope page
//                                                   (also locked from dragging)
//   galleryImage{n}                               → gallery detection, the
//                                                   photo counter, the slideshow
//   guestMessage / guestSender                    → filled with real wishes
//   prevBtn / nextBtn / …Bg                       → guestbook pager
// and `countdownUnit` (emitted by the countdownBox element) is what the
// per-second ticker rewrites. Renaming any of them silently disables a feature.
// ═════════════════════════════════════════════════════════════════════════════

import type {
  TemplateBlock,
  TemplateDefinition,
  TemplateElement,
} from "./templateTypes";

/**
 * Stamped on the four image objects that were authored back on Fabric 5. It is
 * inert metadata Fabric ignores and the editor never re-serializes; preserved
 * only so a migrated page is byte-identical to the one it replaced.
 */
const LEGACY_IMAGE_VERSION = "5.3.0";

// ── Shared layout helpers ───────────────────────────────────────────────────
// Design-data generators, not logic: they exist so a repeated row/section is
// written once. Same role the local helpers in the old template modules had.

/** A "Heading / value" pair as used on the Event Details page. */
const detailHeading = (text: string, top: number): TemplateElement => ({
  type: "text",
  text,
  left: 185,
  top,
  originX: "center",
  width: 300,
  fontSize: 18,
  fontWeight: "bold",
  textAlign: "center",
  fill: "#000",
});

const detailBody = (text: string, top: number): TemplateElement => ({
  type: "text",
  text,
  left: 185,
  top,
  originX: "center",
  width: 300,
  fontSize: 14,
  lineHeight: 1.5,
  textAlign: "center",
  fill: "#333",
});

/** One "time — what happens" line on the Itinerary page. */
const itineraryRow = (time: string, description: string, top: number): TemplateElement[] => [
  {
    type: "text",
    text: time,
    left: 60,
    top,
    width: 80,
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "left",
    fill: "#000",
  },
  {
    type: "text",
    text: description,
    left: 210,
    top,
    width: 220,
    fontSize: 14,
    fontWeight: "normal",
    textAlign: "left",
    fill: "#000",
  },
];

/** Parents / bride-and-groom "NAME & NAME" stack, anchored at `top`. */
const namePairSection = (
  top: number,
  opts: { nameFontSize: number; ampFontSize: number; ampOffset: number; secondOffset: number },
): TemplateElement[] => [
  {
    type: "text",
    text: "VIUP",
    left: 180,
    top,
    originX: "center",
    width: 320,
    fontSize: opts.nameFontSize,
    fontWeight: "bold",
    textAlign: "center",
    fill: "#000",
  },
  {
    type: "text",
    text: "&",
    left: 180,
    top: top + opts.ampOffset,
    originX: "center",
    fontSize: opts.ampFontSize,
    fontFamily: "TeXGyreTermes",
    textAlign: "center",
  },
  {
    type: "text",
    text: "VIUP",
    left: 180,
    top: top + opts.secondOffset,
    originX: "center",
    width: 320,
    fontSize: opts.nameFontSize,
    fontWeight: "bold",
    textAlign: "center",
    fill: "#000",
  },
];

// ── Crimson Velvet palette + row helpers ────────────────────────────────────
// Its content pages sit inside a floral frame, and the CLEAR opening is a good
// deal smaller than the artwork's bounding box: rasterizing Border Flower/7.png
// at 396x704 and scanning each row for its widest unbroken run of cream gives
// x 88..316, y 180..530 (the narrowest row, y=300, clears only x 84..320, and
// the top cluster hangs down the middle to y~180). Everything below is
// therefore centred at x=200, held to a 210px column and kept inside that band
// — otherwise the text runs under the flowers, which is exactly what the first
// pass at this template did.
//
// Note while reading the numbers: on Fabric v7 `originX`/`originY` DEFAULT TO
// "center" (they were "left"/"top" up to v5), so every `left`/`top` here is the
// object's CENTRE, not its top-left corner. A block written as `top: 448` with
// a 96px-tall paragraph occupies y 400..496.

const CV = {
  crimson: "#4e0c0a",
  cream: "#f4efe9",
  gold: "#b8892f",
  ink: "#3a2a24",
  muted: "#6b5a52",
} as const;

/** Full-bleed artwork: 1080x1920 source covering the whole 396x704 artboard. */
const cvFullBleed = (
  key: string,
  asset: string,
  extra: Partial<TemplateElement> = {},
): TemplateElement =>
  ({
    type: "image",
    key,
    asset,
    left: 198,
    top: 352,
    originX: "center",
    originY: "center",
    scaleX: 396 / 1080,
    scaleY: 704 / 1920,
    ...extra,
  }) as TemplateElement;

/** Small gold label above a value, on the Event Details page. */
const cvHeading = (text: string, top: number): TemplateElement => ({
  type: "text",
  text,
  left: 200,
  top,
  originX: "center",
  width: 210,
  fontFamily: "Montserrat",
  fontSize: 11,
  charSpacing: 220,
  textAlign: "center",
  fill: CV.gold,
});

const cvBody = (text: string, top: number, fontSize = 15): TemplateElement => ({
  type: "text",
  text,
  left: 200,
  top,
  originX: "center",
  width: 210,
  fontFamily: "Alegreya",
  fontSize,
  lineHeight: 1.5,
  textAlign: "center",
  fill: CV.ink,
});

/** One "time — what happens" line on the Crimson Velvet itinerary. */
const cvItineraryRow = (time: string, description: string, top: number): TemplateElement[] => [
  {
    type: "text",
    text: time,
    left: 122,
    top,
    width: 60,
    fontFamily: "Montserrat",
    fontSize: 10,
    charSpacing: 80,
    textAlign: "left",
    fill: CV.gold,
  },
  {
    type: "text",
    text: description,
    left: 232,
    top: top - 2,
    width: 150,
    fontFamily: "Alegreya",
    fontSize: 13,
    textAlign: "left",
    fill: CV.ink,
  },
];

// ── Ivory Decree palette + row helpers ──────────────────────────────────────
// Its content pages sit on HD_Vintage Floral.png, a full-page ivory damask with
// a carved frame around the edge. Scanning inward from each side for the frame's
// inner edge (rasterized at 396x704) puts that edge at x 31..370, y 27..674 —
// far roomier than Crimson Velvet's wreath — so content is centred at x=198 in
// a 284px column and kept within y 60..620, which leaves clear margin all round.
// As everywhere in this file, `left`/`top` are object CENTRES (Fabric v7).

const ID_ = {
  ink: "#2e190d",
  gold: "#b87f27",
  ivory: "#f0e9e1",
  muted: "#6b5544",
} as const;

/** Full-bleed artwork: 1080x1920 source covering the whole 396x704 artboard. */
const idFullBleed = (
  key: string,
  asset: string,
  extra: Partial<TemplateElement> = {},
): TemplateElement =>
  ({
    type: "image",
    key,
    asset,
    left: 198,
    top: 352,
    originX: "center",
    originY: "center",
    scaleX: 396 / 1080,
    scaleY: 704 / 1920,
    ...extra,
  }) as TemplateElement;

/** Small gold label above a value, on the Event Details page. */
const idHeading = (text: string, top: number): TemplateElement => ({
  type: "text",
  text,
  left: 198,
  top,
  originX: "center",
  width: 284,
  fontFamily: "Montserrat",
  fontSize: 11,
  charSpacing: 240,
  textAlign: "center",
  fill: ID_.gold,
});

const idBody = (text: string, top: number, fontSize = 15): TemplateElement => ({
  type: "text",
  text,
  left: 198,
  top,
  originX: "center",
  width: 284,
  fontFamily: "Alice",
  fontSize,
  lineHeight: 1.5,
  textAlign: "center",
  fill: ID_.ink,
});

/** One "time — what happens" line on the Ivory Decree itinerary. */
const idItineraryRow = (time: string, description: string, top: number): TemplateElement[] => [
  {
    type: "text",
    text: time,
    left: 110,
    top,
    width: 76,
    fontFamily: "Montserrat",
    fontSize: 11,
    charSpacing: 60,
    textAlign: "left",
    fill: ID_.gold,
  },
  {
    type: "text",
    text: description,
    left: 250,
    top,
    width: 170,
    fontFamily: "Alice",
    fontSize: 13,
    lineHeight: 1.4,
    textAlign: "left",
    fill: ID_.ink,
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// REUSABLE PAGE BLOCKS
//
// A block is a whole page a template can pull in by id. The editor also pulls
// three of these directly at runtime — "gallery" when the Photos panel adds a
// gallery page, "countdown"/"guestbook" when one is dropped from the Elements
// panel, and "envelope" as the first page of a brand-new blank canvas — so each
// design exists exactly once.
// ═════════════════════════════════════════════════════════════════════════════

export const templateBlocks: Record<string, TemplateBlock> = {
  // ── Envelope ──────────────────────────────────────────────────────────────
  // The invitation cover. Its three named images are what mark a page as the
  // envelope: it cannot be deleted, its parts cannot be dragged, and the
  // publisher lifts them out into the openable cover (see extract-envelope.ts).
  envelope: {
    id: "envelope",
    name: "Envelope",
    background: "#f5e8dd",
    elements: [
      {
        type: "image",
        key: "body",
        name: "envelope-body",
        asset: "body.png",
        left: 200,
        top: 580,
        originX: "center",
        scaleX: 0.1,
        scaleY: 0.1,
        props: { version: LEGACY_IMAGE_VERSION },
      },
      {
        type: "image",
        key: "head",
        name: "envelope-head",
        asset: "head.png",
        left: 195,
        top: 200,
        originX: "center",
        scaleX: 0.1,
        scaleY: 0.1,
        props: { version: LEGACY_IMAGE_VERSION },
      },
      {
        type: "text",
        key: "title",
        text: "Undangan",
        left: 190,
        top: 50,
        originX: "center",
        fontSize: 20,
        fontFamily: "serif",
        textAlign: "center",
        fill: "#000",
      },
      {
        type: "text",
        key: "subtitle",
        text: "Walimatulurus",
        left: 190,
        top: 110,
        originX: "center",
        fontSize: 16,
        textAlign: "center",
        fill: "#000",
      },
      {
        type: "text",
        key: "press",
        text: "Press to open",
        left: 190,
        top: 485,
        originX: "center",
        fontSize: 25,
        textAlign: "center",
        fill: "#333",
      },
      {
        type: "text",
        key: "couple",
        text: "Bride x Groom",
        left: 190,
        top: 200,
        originX: "center",
        width: 320,
        fontSize: 28,
        fontWeight: "bold",
        textAlign: "center",
        fill: "#000",
      },
      {
        type: "image",
        key: "seal",
        name: "envelope-seal",
        asset: "seal.png",
        left: 190,
        top: 390,
        originX: "center",
        scaleX: 0.1,
        scaleY: 0.1,
        props: { version: LEGACY_IMAGE_VERSION },
      },
    ],
  },

  // ── Invitation ────────────────────────────────────────────────────────────
  invitation: {
    id: "invitation",
    name: "Invitation",
    elements: [
      {
        type: "image",
        key: "bismillah",
        asset: "bismillah.png",
        left: 200,
        top: 100,
        originX: "center",
        scaleX: 0.08,
        scaleY: 0.08,
        props: { version: LEGACY_IMAGE_VERSION },
      },
      {
        type: "text",
        key: "story",
        text: "What began as a simple connection\nblossomed into a love full of laughter, faith and dreams",
        left: 202,
        top: 360,
        originX: "center",
        width: 320,
        fontSize: 16,
        lineHeight: 1.6,
        textAlign: "center",
        fill: "#000",
      },
      {
        type: "text",
        key: "invite-line",
        text: "you are invited to the day love finds its forever for,",
        left: 202,
        top: 410,
        originX: "center",
        width: 320,
        fontSize: 14,
        textAlign: "center",
        fill: "#666",
      },
      {
        type: "text",
        key: "date",
        text: "26 October 2025 | Sunday",
        left: 202,
        top: 430,
        originX: "center",
        width: 320,
        fontSize: 14,
        fontWeight: "bold",
        textAlign: "center",
        fill: "#000",
      },
      {
        type: "text",
        key: "venue",
        text: "SkyGlass Designer Event Hall",
        left: 202,
        top: 455,
        originX: "center",
        width: 320,
        fontSize: 14,
        textAlign: "center",
        fill: "#333",
      },
      {
        type: "text",
        key: "couple",
        text: "Bride & Groom",
        left: 200,
        top: 230,
        originX: "center",
        width: 320,
        fontSize: 28,
        fontWeight: "bold",
        textAlign: "center",
        fill: "#000",
      },
    ],
  },

  // ── Parents / hosts ───────────────────────────────────────────────────────
  parents: {
    id: "parents",
    name: "Parents",
    elements: [
      {
        type: "text",
        key: "greeting",
        text: "Assalamualaikum WBT & Salam Sejahtera",
        left: 180,
        top: 80,
        originX: "center",
        width: 320,
        fontSize: 14,
        textAlign: "center",
        fill: "#333",
      },
      ...namePairSection(120, {
        nameFontSize: 16,
        ampFontSize: 24,
        ampOffset: 50,
        secondOffset: 80,
      }),
      {
        type: "text",
        key: "invitation-text",
        text: `“Dengan penuh hormat dan takzim,
sukacita menjunjung Pengiran berangkat
menjemput Pehin / Dato / Datin
/ Awang / Dayang / Tuan / Puan / Cik
untuk bersama - sama memeriahkan majlis
walimatulurus puteri kami dan pasangannya”`,
        left: 180,
        top: 310,
        originX: "center",
        width: 320,
        fontSize: 14,
        lineHeight: 1.6,
        textAlign: "center",
        fill: "#333",
      },
      ...namePairSection(440, {
        nameFontSize: 18,
        ampFontSize: 28,
        ampOffset: 60,
        secondOffset: 110,
      }),
    ],
  },

  // ── Event details ─────────────────────────────────────────────────────────
  eventDetails: {
    id: "eventDetails",
    name: "Event Details",
    elements: [
      detailHeading("Date", 80),
      detailBody("26 October 2025", 110),
      detailHeading("Time", 160),
      detailBody("9.00 AM – 2.00 PM", 190),
      detailHeading("Venue", 240),
      detailBody(
        "SkyGlass Designer Event Hall\nT5-22-01, Tower 5, Sky Park @ Cyberjaya,\nJalan Teknokrat 1, Cyber 3,\n63000 Cyberjaya, Selangor",
        300,
      ),
      detailHeading("Dress Code", 420),
      detailBody(
        "Pakaian Tradisional –\nBaju Kurung, Baju Melayu Lengkap,\nBatik atau lain-lain pakaian\ntradisional yang sopan",
        480,
      ),
    ],
  },

  // ── Itinerary ─────────────────────────────────────────────────────────────
  itinerary: {
    id: "itinerary",
    name: "Itinerary",
    elements: [
      {
        type: "text",
        key: "title",
        text: "Itinerary",
        left: 180,
        top: 50,
        originX: "center",
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        fill: "#000",
      },
      ...itineraryRow("9.00 AM", "Ketibaan para jemputan", 120),
      ...itineraryRow("9.30 AM", "Majlis Akad Nikah", 150),
      ...itineraryRow("10.00 AM", "Bacaan doa (diikuti dengan jamuan ringan)", 180),
      ...itineraryRow("11.30 AM", "Majlis bersanding", 210),
      ...itineraryRow("12.00 PM", "Jamuan makan bermula", 240),
      ...itineraryRow("2.00 PM", "Majlis bersurai", 270),
      // Closing note. The empty box keeps the two-column rhythm of the rows
      // above it; the note itself sits further left than a normal description.
      {
        type: "text",
        key: "closing-spacer",
        text: "",
        left: 60,
        top: 320,
        width: 80,
        fontSize: 14,
        fontWeight: "bold",
        textAlign: "left",
        fill: "#000",
      },
      {
        type: "text",
        key: "closing-note",
        text: "Jemput hadir mengikut masa yang ditetapkan",
        left: 180,
        top: 320,
        width: 220,
        fontSize: 14,
        fontWeight: "bold",
        textAlign: "left",
        fill: "#000",
      },
    ],
  },

  // ── Gallery ───────────────────────────────────────────────────────────────
  // Every slot shares one standardized 292×443 frame centred at (190, 310), so
  // they overlap into a single slot and the slideshow shows one photo at a time.
  // Uploads are appended as further galleryImage{n} slots by the editor.
  // These two starter photos are free and are discounted from the package photo
  // budget (GALLERY_STARTER_COUNT in CanvasEditor is derived from this block).
  gallery: {
    id: "gallery",
    name: "Gallery",
    elements: [
      {
        type: "text",
        key: "title",
        text: "Gallery",
        left: 198,
        top: 60,
        originX: "center",
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        fill: "#000",
      },
      {
        type: "gallerySlot",
        key: "photo-1",
        index: 1,
        asset: "aiCouple-1.png",
        left: 190,
        top: 310,
        originX: "center",
        originY: "center",
        // Source 1024×1536 → the 292×443 frame.
        scaleX: 292 / 1024,
        scaleY: 443 / 1536,
      },
      {
        type: "gallerySlot",
        key: "photo-2",
        index: 2,
        asset: "aiCouple-2.png",
        left: 190,
        top: 310,
        originX: "center",
        originY: "center",
        scaleX: 292 / 1024,
        scaleY: 443 / 1536,
        // Hidden initially — the slideshow reveals one photo at a time.
        visible: false,
      },
    ],
  },

  // ── Guestbook ─────────────────────────────────────────────────────────────
  // Visual only. startGuestbook() in RsvpPlayer fills guestMessage/guestSender
  // with real entries (or a neutral placeholder when there are none).
  guestbook: {
    id: "guestbook",
    name: "Guestbook",
    elements: [
      {
        type: "image",
        key: "paper",
        // Uppercase on disk (public/PAPER.png). The mixed-case "/Paper.png"
        // resolved on case-insensitive Windows but 404'd on the case-sensitive
        // Linux deploy — and a failed image load used to reject the whole
        // enliven batch, dropping the entire guestbook. Match the real filename.
        asset: "PAPER.png",
        left: 450,
        top: 312,
        originX: "center",
        scaleX: 0.3,
        scaleY: 0.3,
        angle: 0,
        props: { version: LEGACY_IMAGE_VERSION },
      },
      {
        type: "text",
        key: "title",
        text: "Guestbook",
        left: 195,
        top: 60,
        originX: "center",
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        fill: "#000",
      },
      {
        type: "text",
        key: "message",
        name: "guestMessage",
        text: "“Your wishes will appear here...”",
        left: 195,
        top: 150,
        originX: "center",
        width: 300,
        fontSize: 16,
        textAlign: "center",
        fill: "#333",
      },
      {
        type: "text",
        key: "sender",
        name: "guestSender",
        text: "- Guest Name",
        left: 195,
        top: 220,
        originX: "center",
        width: 300,
        fontSize: 14,
        fontStyle: "italic",
        textAlign: "center",
        fill: "#666",
      },
      { type: "guestbookNav", key: "prev", direction: "prev", left: 168, top: 262 },
      { type: "guestbookNav", key: "next", direction: "next", left: 222, top: 262 },
    ],
  },

  // ── Counting Days ─────────────────────────────────────────────────────────
  // Each box's value carries `countdownUnit`; the ticker (editor + published
  // player) rewrites it every second against the saved Calendar date.
  countdown: {
    id: "countdown",
    name: "Counting Days",
    elements: [
      {
        type: "text",
        key: "title",
        text: "Counting Days",
        left: 190,
        top: 50,
        originX: "center",
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        fill: "#000",
      },
      { type: "countdownBox", key: "day", label: "Day", value: "00", left: 74 },
      { type: "countdownBox", key: "hour", label: "Hour", value: "00", left: 152 },
      { type: "countdownBox", key: "minute", label: "Minute", value: "00", left: 232 },
      { type: "countdownBox", key: "second", label: "Second", value: "00", left: 314 },
    ],
  },

  // ── Prayer / closing ──────────────────────────────────────────────────────
  prayer: {
    id: "prayer",
    name: "Prayer",
    elements: [
      {
        type: "text",
        key: "title",
        text: "Prayer",
        // Authored as "Textbox" with a capital T. Preserved verbatim rather
        // than normalized, so these pages revive exactly as they always have.
        fabricType: "Textbox",
        left: 198,
        top: 70,
        originX: "center",
        width: 320,
        fontSize: 48,
        fontWeight: "bold",
        textAlign: "center",
        fill: "#000000",
      },
      {
        type: "text",
        key: "line-1",
        text: "Semoga Allah melimpahkan",
        fabricType: "Textbox",
        left: 198,
        top: 140,
        originX: "center",
        width: 320,
        fontSize: 28,
        lineHeight: 1.4,
        textAlign: "center",
        fill: "#000000",
      },
      {
        type: "text",
        key: "line-2",
        text: "keberkahan kepadamu dan",
        fabricType: "Textbox",
        left: 198,
        top: 180,
        originX: "center",
        width: 320,
        fontSize: 28,
        lineHeight: 1.4,
        textAlign: "center",
        fill: "#000000",
      },
      {
        type: "text",
        key: "line-3",
        text: "keberkahan atas pernikahanmu,",
        fabricType: "Textbox",
        left: 198,
        top: 240,
        originX: "center",
        width: 320,
        fontSize: 28,
        lineHeight: 1.4,
        textAlign: "center",
        fill: "#000000",
      },
      {
        type: "text",
        key: "line-4",
        text: "serta mengumpulkan kalian",
        fabricType: "Textbox",
        left: 198,
        top: 320,
        originX: "center",
        width: 300,
        fontSize: 28,
        lineHeight: 1.4,
        textAlign: "center",
        fill: "#000000",
      },
      {
        type: "text",
        key: "line-5",
        text: "berdua dalam kebaikan",
        fabricType: "Textbox",
        left: 198,
        top: 380,
        originX: "center",
        width: 320,
        fontSize: 28,
        lineHeight: 1.4,
        textAlign: "center",
        fill: "#000000",
      },
      {
        type: "text",
        key: "hashtag",
        text: "#viup",
        left: 198,
        top: 440,
        width: 300,
        fontSize: 18,
        fontStyle: "italic",
        textAlign: "center",
        fill: "#333",
      },
      {
        type: "text",
        key: "credit",
        text: "Made for your special day by",
        left: 198,
        top: 500,
        width: 300,
        fontSize: 12,
        textAlign: "center",
        fill: "#666",
      },
      {
        type: "image",
        key: "submark",
        asset: "Vi-Up-Submark.png",
        left: 200,
        top: 530,
        originX: "center",
        scaleX: 0.03,
        scaleY: 0.03,
        props: { version: LEGACY_IMAGE_VERSION },
      },
    ],
  },
};

/** Block ids the editor pulls directly at runtime. */
export const RUNTIME_BLOCKS = {
  envelope: "envelope",
  gallery: "gallery",
  countdown: "countdown",
  guestbook: "guestbook",
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE REGISTRY
//
// ADD NEW TEMPLATES HERE. One object per design — see the header of this file.
// `id` is referenced by the editor's applied-template state, so never rename an
// existing one.
// ═════════════════════════════════════════════════════════════════════════════

export const templates: Record<string, TemplateDefinition> = {
  fullInvitation: {
    // Historic id — the Templates panel and the editor's applied-template
    // state have always used it. Keep it.
    id: "full-template",
    name: "Full Invitation",
    slug: "full-invitation",
    description:
      "The complete nine-page wedding invitation: envelope, invitation, hosts, event details, itinerary, gallery, guestbook, countdown and closing prayer.",
    category: "wedding",
    version: "1.0.0",
    // These assets sit at the /public root rather than in a per-template
    // folder, because they predate this registry and existing saved projects
    // reference them by those exact paths.
    baseAssetPath: "/",
    canvas: {
      width: 396,
      height: 704,
      background: "#ffffff",
    },
    // Descriptive only — the footer features are event-data driven and wired
    // globally, not per template. See TemplateFeatureHints.
    features: {
      rsvp: true,
      moneyGift: true,
      calendar: true,
      location: true,
      contact: true,
      music: true,
      guestbook: true,
      countdown: true,
      gallery: true,
    },
    pages: [
      { block: "envelope" },
      { block: "invitation" },
      { block: "parents" },
      { block: "eventDetails" },
      { block: "itinerary" },
      { block: "gallery" },
      { block: "guestbook" },
      { block: "countdown" },
      { block: "prayer" },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Tunku Ismail x Farah Elise — the FIRST iFastNet-hosted template.
  //
  // Its media is NOT in this repository and is never copied here: every image
  // below is a bare filename, and the resolver turns it into a url on
  // https://vi-up.com/uploads/templates/11/ that the browser fetches directly
  // from iFastNet. Vercel only ever downloads the small JSON manifest.
  //
  //   assetProvider: "ifastnet" + remoteTemplateId: 11
  //     "ImageGallery/img1.png"
  //        -> https://vi-up.com/uploads/templates/11/ImageGallery/img1.png
  //
  // Filenames are written EXACTLY as the manifest reports them, spaces, "&"
  // and all — the resolver percent-encodes each path segment, so no url needs
  // escaping by hand here. (A few are recorded with Windows backslashes in the
  // source HTML; those normalize to "/" too.)
  //
  // The design data — pages, positions, fonts, wording — lives HERE, exactly
  // like a local template. The manifest supplies files, never layout, and the
  // template's own HTML is never fetched, parsed or executed by this app.
  // ═══════════════════════════════════════════════════════════════════════
  tunkuIsmailFarahElise: {
    id: "tunku-ismail-farah-elise",
    name: "Tunku Ismail x Farah Elise",
    slug: "tunku-ismail-farah-elise",
    description:
      "Nine-page Malay wedding invitation with an ivory envelope, monogram crest, itinerary, gallery and guestbook. Media is hosted on vi-up.com.",
    category: "wedding",
    version: "1.0.0",
    assetProvider: "ifastnet",
    remoteTemplateId: 11,
    canvas: {
      width: 396,
      height: 704,
      background: "#f7f2ea",
    },
    features: {
      rsvp: true,
      moneyGift: true,
      calendar: true,
      location: true,
      contact: true,
      music: true,
      guestbook: true,
      countdown: true,
      gallery: true,
    },
    pages: [
      // ── 1. Envelope ─────────────────────────────────────────────────────
      // The three `envelope-*` names are what make this the openable cover —
      // see the note at the top of this file. Geometry mirrors the shared
      // envelope block (identical 4626x4205 head and 4500x5147 body art, so
      // the same 0.1 scale); only the seal differs (1254px here vs 1000px),
      // scaled to match on screen.
      {
        id: "envelope",
        name: "Envelope",
        background: "#f7f2ea",
        elements: [
          {
            type: "image",
            key: "body",
            name: "envelope-body",
            asset: "Envelope Intro (2)/Envelope Intro/body.png",
            left: 200,
            top: 580,
            originX: "center",
            scaleX: 0.1,
            scaleY: 0.1,
          },
          {
            type: "image",
            key: "head",
            name: "envelope-head",
            asset: "Envelope Intro (2)/Envelope Intro/head.png",
            left: 195,
            top: 200,
            originX: "center",
            scaleX: 0.1,
            scaleY: 0.1,
          },
          {
            type: "text",
            key: "eyebrow",
            text: "THE INTIMATE WEDDING OF",
            left: 198,
            top: 62,
            originX: "center",
            width: 320,
            fontFamily: "Montserrat",
            fontSize: 11,
            charSpacing: 300,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "image",
            key: "monogram",
            asset: "z&z.svg",
            left: 198,
            top: 120,
            originX: "center",
            scaleX: 0.9,
            scaleY: 0.9,
          },
          {
            type: "image",
            key: "seal",
            name: "envelope-seal",
            asset: "Envelope Intro (2)/Envelope Intro/seal.png",
            left: 190,
            top: 390,
            originX: "center",
            scaleX: 0.08,
            scaleY: 0.08,
          },
          {
            type: "text",
            key: "press",
            text: "Press to open",
            left: 198,
            top: 500,
            originX: "center",
            width: 320,
            fontFamily: "Cormorant Garamond",
            fontSize: 20,
            textAlign: "center",
            fill: "#8B6914",
          },
        ],
      },

      // ── 2. Invitation ───────────────────────────────────────────────────
      {
        id: "invitation",
        name: "Invitation",
        elements: [
          {
            type: "image",
            key: "bismillah",
            asset: "Bismillah z&z.svg",
            left: 198,
            top: 70,
            originX: "center",
            scaleX: 1.1,
            scaleY: 1.1,
          },
          {
            type: "text",
            key: "basmalah",
            text: "Dengan nama Allah Yang Maha Pengasih\nlagi Maha Penyayang",
            left: 198,
            top: 120,
            originX: "center",
            width: 320,
            fontFamily: "Cormorant Garamond",
            fontSize: 14,
            lineHeight: 1.5,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "image",
            key: "rule-top",
            asset: "line1.png",
            left: 198,
            top: 175,
            originX: "center",
            scaleX: 0.55,
            scaleY: 0.55,
          },
          {
            type: "text",
            key: "groom",
            text: "YM Capt Tunku Ismail\nBin Tunku Yahaya",
            left: 198,
            top: 210,
            originX: "center",
            width: 320,
            fontFamily: "Cormorant Garamond",
            fontSize: 22,
            lineHeight: 1.3,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "amp",
            text: "&",
            left: 198,
            top: 272,
            originX: "center",
            width: 320,
            fontFamily: "Great Vibes",
            fontSize: 30,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "bride",
            text: "Nurul Faraliza Binti Md Yusof\n(Farah Elise)",
            left: 198,
            top: 312,
            originX: "center",
            width: 320,
            fontFamily: "Cormorant Garamond",
            fontSize: 22,
            lineHeight: 1.3,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "image",
            key: "date-plate",
            asset: "date.png",
            left: 198,
            top: 420,
            originX: "center",
            scaleX: 0.38,
            scaleY: 0.38,
          },
          {
            type: "image",
            key: "rule-bottom",
            asset: "line2.png",
            left: 198,
            top: 495,
            originX: "center",
            scaleX: 0.9,
            scaleY: 0.9,
          },
          {
            type: "text",
            key: "venue",
            text: "WILLOW HALL, FOREST VALLEY",
            left: 198,
            top: 525,
            originX: "center",
            width: 340,
            fontFamily: "Montserrat",
            fontSize: 11,
            charSpacing: 200,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "hashtag",
            text: "#WhenAMMetPM",
            left: 198,
            top: 560,
            originX: "center",
            width: 320,
            fontFamily: "Great Vibes",
            fontSize: 20,
            textAlign: "center",
            fill: "#8B6914",
          },
        ],
      },

      // ── 3. Hosts / parents ──────────────────────────────────────────────
      {
        id: "parents",
        name: "Hosts",
        elements: [
          {
            type: "text",
            key: "intro",
            text: "Dengan penuh kesyukuran, kami mempersilakan Y.Bhg\nTan Sri / Puan Sri / Datuk Seri / Dato Seri / Datin Seri /\nDatuk / Dato / Datin / Encik / Puan / Cik hadir ke majlis\nperkahwinan putera dan puteri kesayangan kami",
            left: 198,
            top: 70,
            originX: "center",
            width: 330,
            fontFamily: "Cormorant Garamond",
            fontSize: 13,
            lineHeight: 1.6,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "groom-parents-label",
            text: "Putera kepada",
            left: 198,
            top: 210,
            originX: "center",
            width: 320,
            fontFamily: "Montserrat",
            fontSize: 11,
            charSpacing: 200,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "groom-parents",
            text: "Almarhum Tunku Yahaya\nBin Tunku Tan Sri Ismail\n&\nPuan Salma Binti Mohamed Ibrahim",
            left: 198,
            top: 245,
            originX: "center",
            width: 330,
            fontFamily: "Cormorant Garamond",
            fontSize: 17,
            lineHeight: 1.5,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "image",
            key: "divider",
            asset: "line2.png",
            left: 198,
            top: 380,
            originX: "center",
            scaleX: 0.9,
            scaleY: 0.9,
          },
          {
            type: "text",
            key: "bride-parents-label",
            text: "Puteri kepada",
            left: 198,
            top: 415,
            originX: "center",
            width: 320,
            fontFamily: "Montserrat",
            fontSize: 11,
            charSpacing: 200,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "bride-parents",
            text: "Md Yusof Bin Harun\n&\nAzizah Binti Ab Rahim",
            left: 198,
            top: 450,
            originX: "center",
            width: 330,
            fontFamily: "Cormorant Garamond",
            fontSize: 17,
            lineHeight: 1.5,
            textAlign: "center",
            fill: "#8B6914",
          },
        ],
      },

      // ── 4. Event details ────────────────────────────────────────────────
      {
        id: "eventDetails",
        name: "Event Details",
        elements: [
          {
            type: "image",
            key: "crest",
            asset: "TEFI.png",
            left: 198,
            top: 60,
            originX: "center",
            scaleX: 0.28,
            scaleY: 0.28,
          },
          detailHeading("Tarikh", 140),
          detailBody("15 August 2026", 168),
          detailHeading("Hari", 210),
          detailBody("Sabtu", 238),
          detailHeading("Waktu", 280),
          detailBody("8.30 PM - 10.30 PM", 308),
          detailHeading("Tempat", 350),
          detailBody("Willow Hall, Forest Valley", 378),
          detailHeading("Tema Pakaian", 425),
          detailBody(
            "Traditional / Formal Attire\nLelaki: Baju Melayu atau Sut Formal\nPerempuan: Busana Tradisional atau Gaun Labuh",
            455,
          ),
          {
            type: "text",
            key: "dress-note",
            text: "Nota: Mohon kerjasama tetamu untuk tidak mengenakan pakaian kasual seperti T-shirt dan seluar jeans bagi menghormati majlis.",
            left: 198,
            top: 545,
            originX: "center",
            width: 320,
            fontFamily: "Cormorant Garamond",
            fontSize: 12,
            lineHeight: 1.5,
            textAlign: "center",
            fill: "#8B6914",
          },
        ],
      },

      // ── 5. Itinerary ────────────────────────────────────────────────────
      {
        id: "itinerary",
        name: "Itinerary",
        elements: [
          {
            type: "text",
            key: "title",
            text: "Atur Cara Majlis",
            left: 198,
            top: 60,
            originX: "center",
            width: 340,
            fontFamily: "Cormorant Garamond",
            fontSize: 26,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "image",
            key: "rule",
            asset: "line2.png",
            left: 198,
            top: 105,
            originX: "center",
            scaleX: 0.9,
            scaleY: 0.9,
          },
          ...itineraryRow("8.00 PM", "Kehadiran Tetamu", 150),
          ...itineraryRow("8.30 PM", "Ketibaan Pengantin", 190),
          ...itineraryRow("9.00 PM", "Jamuan Makan", 230),
          ...itineraryRow("10.30 PM", "Majlis Berakhir", 270),
          {
            type: "text",
            key: "note",
            text: "Nota: Kehadiran sepenuhnya sebelum ketibaan pengantin pada pukul 8.30 PM. Pendaftaran bermula pada pukul 7pm sehingga 8pm. Tetamu tidak dibenarkan keluar masuk sehingga majlis selesai bagi menghormati aturcara dan sesi rakaman.",
            left: 198,
            top: 350,
            originX: "center",
            width: 320,
            fontFamily: "Cormorant Garamond",
            fontSize: 12,
            lineHeight: 1.6,
            textAlign: "center",
            fill: "#8B6914",
          },
        ],
      },

      // ── 6. Counting Days ────────────────────────────────────────────────
      // The countdownBox element emits `countdownUnit`, which is what the
      // ticker in the editor AND in the published invitation rewrites every
      // second — no template-specific wiring.
      {
        id: "countdown",
        name: "Counting Days",
        elements: [
          {
            type: "text",
            key: "title",
            text: "Menanti Hari",
            left: 198,
            top: 60,
            originX: "center",
            width: 340,
            fontFamily: "Cormorant Garamond",
            fontSize: 26,
            textAlign: "center",
            fill: "#8B6914",
          },
          { type: "countdownBox", key: "day", label: "Hari", value: "00", left: 74 },
          { type: "countdownBox", key: "hour", label: "Jam", value: "00", left: 152 },
          { type: "countdownBox", key: "minute", label: "Minit", value: "00", left: 232 },
          { type: "countdownBox", key: "second", label: "Saat", value: "00", left: 314 },
        ],
      },

      // ── 7. Gallery ──────────────────────────────────────────────────────
      // TWO starter photos, matching the shared gallery block, because the
      // package photo counter discounts a FIXED number of starters
      // (GALLERY_STARTER_COUNT in CanvasEditor, derived from that block).
      // Shipping more here would eat into the customer's own photo budget.
      // img3-img8 are in the manifest and can be added from the Photos panel.
      {
        id: "gallery",
        name: "Gallery",
        elements: [
          {
            type: "text",
            key: "title",
            text: "Galeri",
            left: 198,
            top: 60,
            originX: "center",
            width: 340,
            fontFamily: "Cormorant Garamond",
            fontSize: 26,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "gallerySlot",
            key: "photo-1",
            index: 1,
            asset: "ImageGallery/img1.png",
            left: 190,
            top: 320,
            originX: "center",
            originY: "center",
            // Source 720x1080 into the standard 292x443 frame.
            scaleX: 292 / 720,
            scaleY: 443 / 1080,
          },
          {
            type: "gallerySlot",
            key: "photo-2",
            index: 2,
            asset: "ImageGallery/img2.png",
            left: 190,
            top: 320,
            originX: "center",
            originY: "center",
            scaleX: 292 / 720,
            scaleY: 443 / 1080,
            // Hidden initially — the slideshow reveals one photo at a time.
            visible: false,
          },
        ],
      },

      // ── 8. Guestbook ────────────────────────────────────────────────────
      // Visual only: startGuestbook() fills guestMessage / guestSender with the
      // real wishes on the published invitation.
      {
        id: "guestbook",
        name: "Guestbook",
        elements: [
          {
            type: "image",
            key: "paper",
            asset: "PAPER.png",
            left: 450,
            top: 312,
            originX: "center",
            scaleX: 0.3,
            scaleY: 0.3,
          },
          {
            type: "text",
            key: "title",
            text: "Guestbook",
            left: 195,
            top: 60,
            originX: "center",
            width: 340,
            fontFamily: "Cormorant Garamond",
            fontSize: 26,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "message",
            name: "guestMessage",
            text: "“Your wishes will appear here...”",
            left: 195,
            top: 150,
            originX: "center",
            width: 300,
            fontFamily: "Cormorant Garamond",
            fontSize: 16,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "sender",
            name: "guestSender",
            text: "- Guest Name",
            left: 195,
            top: 220,
            originX: "center",
            width: 300,
            fontFamily: "Cormorant Garamond",
            fontSize: 14,
            fontStyle: "italic",
            textAlign: "center",
            fill: "#8B6914",
          },
          { type: "guestbookNav", key: "prev", direction: "prev", left: 168, top: 262 },
          { type: "guestbookNav", key: "next", direction: "next", left: 222, top: 262 },
        ],
      },

      // ── 9. Prayer / closing ─────────────────────────────────────────────
      {
        id: "prayer",
        name: "Prayer",
        elements: [
          {
            type: "text",
            key: "title",
            text: "Doa",
            left: 198,
            top: 70,
            originX: "center",
            width: 320,
            fontFamily: "Cormorant Garamond",
            fontSize: 40,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "body",
            text: "Ya Allah, kami panjatkan doa agar majlis ini\ndipayungi rahmat-Mu,\ndilimpahi keberkatan,\ndan menjadi permulaan bagi satu ikatan yang\nabadi serta diredhai sampai ke syurga.",
            left: 198,
            top: 160,
            originX: "center",
            width: 330,
            fontFamily: "Cormorant Garamond",
            fontSize: 16,
            lineHeight: 1.7,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "hashtag",
            text: "#WhenAMMetPM",
            left: 198,
            top: 400,
            originX: "center",
            width: 320,
            fontFamily: "Great Vibes",
            fontSize: 22,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "text",
            key: "credit",
            text: "Made for your special day by",
            left: 198,
            top: 470,
            originX: "center",
            width: 300,
            fontFamily: "Montserrat",
            fontSize: 10,
            textAlign: "center",
            fill: "#8B6914",
          },
          {
            type: "image",
            key: "submark",
            asset: "Logo/Vi-Up Submark.png",
            left: 198,
            top: 510,
            originX: "center",
            scaleX: 0.035,
            scaleY: 0.035,
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Crimson Velvet — iFastNet template 2.
  //
  // Same arrangement as the template above: media stays on vi-up.com, only the
  // design data lives here. Everything it needs is already built — the manifest
  // client, the asset resolver, the crossOrigin stamping and the resilient
  // loader — so this entry is the ONLY thing that had to be added.
  //
  //   assetProvider: "ifastnet" + remoteTemplateId: 2
  //     "Envelop_CV/head.png"
  //        -> https://vi-up.com/uploads/templates/2/Envelop_CV/head.png
  //
  // DISPLAY NAME vs SOURCE NAME. `name` is what the Templates panel shows and
  // it is deliberately independent of how the files are stored: the folder
  // keeps its legacy /uploads/templates/2/ layout (with its MayaxAsyraaf
  // wrapper page and Text-Logo/Logo_MayaAsyraaf.png), and nothing on iFastNet
  // was renamed to get "Crimson Velvet" on the card.
  //
  // The art is authored as full-page 1080x1920 layers at exactly the artboard's
  // 9:16 ratio, so they drop in full-bleed at 396/1080 (see cvFullBleed).
  //
  // NOT USED, because the manifest reports them missing on disk — referencing
  // one would only produce a "[TemplateAsset] Unable to load" warning:
  //   Border Flower/PAPER.png (the top-level PAPER.png below is present),
  //   waze_btn.png, YOUR_FLORAL_IMAGE.png, fonts/Alice-{regular,bold}.otf.
  // ═══════════════════════════════════════════════════════════════════════
  crimsonVelvet: {
    id: "crimson-velvet",
    name: "Crimson Velvet",
    slug: "crimson-velvet",
    description:
      "Nine-page invitation in deep crimson velvet and gold: a wax-sealed envelope, floral-framed pages, itinerary, gallery and guestbook. Media is hosted on vi-up.com.",
    category: "wedding",
    version: "1.0.0",
    assetProvider: "ifastnet",
    remoteTemplateId: 2,
    // No `thumbnail`: the Templates panel only renders a card image when one is
    // declared, so this card stays text-only like the others and the panel
    // makes no request at all until the template is actually applied.
    canvas: {
      width: 396,
      height: 704,
      background: CV.cream,
    },
    // Descriptive only — the footer features are event-data driven and wired
    // globally, not per template. See TemplateFeatureHints.
    features: {
      rsvp: true,
      moneyGift: true,
      calendar: true,
      location: true,
      contact: true,
      music: true,
      guestbook: true,
      countdown: true,
      gallery: true,
    },
    pages: [
      // ── 1. Envelope ─────────────────────────────────────────────────────
      // envelope-head / envelope-body / envelope-seal are FUNCTIONAL names —
      // they mark the page as the openable cover, lock the parts against
      // dragging, and are what extract-envelope lifts into the published
      // invitation. The flap art points down to y=0.519 of its height and the
      // body starts at y=0.358 (both measured off the alpha channel), which is
      // where the seal sits.
      {
        id: "envelope",
        name: "Envelope",
        background: CV.crimson,
        elements: [
          cvFullBleed("body", "Envelop_CV/body.png", { name: "envelope-body" }),
          cvFullBleed("head", "Envelop_CV/head.png", { name: "envelope-head" }),
          {
            type: "text",
            key: "title",
            text: "Intimate Indulgence",
            left: 198,
            top: 42,
            originX: "center",
            width: 320,
            fontFamily: "Parisienne",
            fontSize: 30,
            textAlign: "center",
            fill: "#e8cf9a",
          },
          {
            type: "image",
            key: "monogram",
            // NOT the "B&G.svg" wordmark from this template — see the SVG note
            // in the header of this file. This one is a PNG and renders exactly.
            asset: "BG_Monogram.png",
            left: 198,
            top: 178,
            originX: "center",
            originY: "center",
            // 9386x14880 down to roughly 90x143.
            scaleX: 0.0096,
            scaleY: 0.0096,
          },
          {
            type: "image",
            key: "seal",
            name: "envelope-seal",
            asset: "Envelope Intro (2)/Envelope Intro/seal.png",
            left: 198,
            top: 365,
            originX: "center",
            originY: "center",
            // 1254px square down to 100px.
            scaleX: 0.08,
            scaleY: 0.08,
          },
          {
            type: "text",
            key: "press",
            text: "Press to open",
            left: 198,
            top: 560,
            originX: "center",
            width: 320,
            fontFamily: "Alegreya",
            fontSize: 18,
            textAlign: "center",
            fill: "#e8cf9a",
          },
        ],
      },

      // ── 2. Invitation ───────────────────────────────────────────────────
      {
        id: "invitation",
        name: "Invitation",
        background: CV.cream,
        elements: [
          cvFullBleed("frame", "Border Flower/7.png", { selectable: false, locked: true }),
          {
            type: "text",
            key: "intro",
            text: "With hearts full of gratitude,\nwe invite you to celebrate our wedding",
            left: 200,
            top: 200,
            originX: "center",
            width: 210,
            fontFamily: "Alegreya",
            fontSize: 13,
            lineHeight: 1.5,
            textAlign: "center",
            fill: CV.muted,
          },
          // The couple's names as EDITABLE text rather than the template's
          // baked-in "B&G.svg" wordmark — the first thing anyone using this
          // template changes, and the SVG cannot be used on canvas anyway (see
          // the SVG note in this file's header).
          {
            type: "text",
            key: "couple",
            text: "Bride & Groom",
            left: 200,
            top: 268,
            originX: "center",
            width: 220,
            fontFamily: "Great Vibes",
            fontSize: 34,
            lineHeight: 1.2,
            textAlign: "center",
            fill: CV.gold,
          },
          {
            type: "text",
            key: "date",
            text: "26 June 2026  |  Sunday",
            left: 200,
            top: 348,
            originX: "center",
            width: 210,
            fontFamily: "Montserrat",
            fontSize: 10,
            charSpacing: 120,
            textAlign: "center",
            fill: CV.gold,
          },
          {
            type: "text",
            key: "venue",
            text: "Neverleave Island Resort",
            left: 200,
            top: 378,
            originX: "center",
            width: 210,
            fontFamily: "Alegreya",
            fontSize: 15,
            textAlign: "center",
            fill: CV.ink,
          },
          {
            type: "text",
            key: "hashtag",
            text: "#SendItOut",
            left: 200,
            top: 470,
            originX: "center",
            width: 210,
            fontFamily: "Alex Brush",
            fontSize: 22,
            textAlign: "center",
            fill: CV.gold,
          },
        ],
      },

      // ── 3. Hosts ────────────────────────────────────────────────────────
      {
        id: "parents",
        name: "Hosts",
        background: CV.cream,
        elements: [
          cvFullBleed("frame", "Border Flower/7.png", { selectable: false, locked: true }),
          {
            type: "image",
            key: "monogram",
            asset: "BG_Monogram.png",
            left: 200,
            top: 232,
            originX: "center",
            originY: "center",
            // 9386x14880 down to roughly 56x89.
            scaleX: 0.006,
            scaleY: 0.006,
          },
          {
            type: "text",
            key: "greeting",
            text: "With Love and Gratitude",
            left: 200,
            top: 292,
            originX: "center",
            width: 210,
            fontFamily: "Montserrat",
            fontSize: 10,
            charSpacing: 140,
            textAlign: "center",
            fill: CV.gold,
          },
          {
            type: "text",
            key: "host-1",
            text: "Bride",
            left: 200,
            top: 318,
            originX: "center",
            width: 210,
            fontFamily: "Playfair Display",
            fontSize: 18,
            textAlign: "center",
            fill: CV.ink,
          },
          {
            type: "text",
            key: "amp",
            text: "&",
            left: 200,
            top: 348,
            originX: "center",
            width: 210,
            fontFamily: "Great Vibes",
            fontSize: 24,
            textAlign: "center",
            fill: CV.gold,
          },
          {
            type: "text",
            key: "host-2",
            text: "Groom",
            left: 200,
            top: 384,
            originX: "center",
            width: 210,
            fontFamily: "Playfair Display",
            fontSize: 18,
            textAlign: "center",
            fill: CV.ink,
          },
          {
            type: "text",
            key: "invite-text",
            text: "“Together with their families, we warmly invite you to join us in celebrating the wedding of our beloved couple. Your presence would bring joy and meaning to this special day.”",
            left: 200,
            top: 448,
            originX: "center",
            width: 210,
            fontFamily: "Alegreya",
            fontSize: 12,
            lineHeight: 1.5,
            textAlign: "center",
            fill: CV.muted,
          },
        ],
      },

      // ── 4. Event details ────────────────────────────────────────────────
      {
        id: "eventDetails",
        name: "Event Details",
        background: CV.cream,
        elements: [
          cvFullBleed("frame", "Border Flower/7.png", { selectable: false, locked: true }),
          cvHeading("DATE", 192),
          cvBody("26 June 2026", 212),
          cvHeading("TIME", 254),
          cvBody("9.00 AM – 2.00 PM", 274),
          cvHeading("VENUE", 316),
          cvBody("Neverleave Island Resort", 336),
          cvHeading("DRESS CODE", 380),
          cvBody(
            "Wear something nice, comfy, and wedding-photo approved. No pressure, but the camera will remember everything.",
            430,
            12,
          ),
        ],
      },

      // ── 5. Itinerary ────────────────────────────────────────────────────
      {
        id: "itinerary",
        name: "Itinerary",
        background: CV.cream,
        elements: [
          cvFullBleed("frame", "Border Flower/7.png", { selectable: false, locked: true }),
          {
            type: "text",
            key: "title",
            text: "Itinerary",
            left: 200,
            top: 196,
            originX: "center",
            width: 210,
            fontFamily: "Playfair Display",
            fontSize: 22,
            textAlign: "center",
            fill: CV.crimson,
          },
          ...cvItineraryRow("9.00 AM", "Guest arrival", 248),
          ...cvItineraryRow("9.30 AM", "Wedding ceremony", 288),
          ...cvItineraryRow("10.00 AM", "Light refreshments", 328),
          ...cvItineraryRow("11.30 AM", "Couple’s entrance", 368),
          ...cvItineraryRow("12.00 PM", "Lunch begins", 408),
          ...cvItineraryRow("2.00 PM", "Event concludes", 448),
        ],
      },

      // ── 6. Counting Days ────────────────────────────────────────────────
      // countdownBox emits `countdownUnit`, which the per-second ticker in the
      // editor and in the published invitation rewrites. No per-template code.
      {
        id: "countdown",
        name: "Counting Days",
        background: CV.cream,
        elements: [
          cvFullBleed("frame", "Border Flower/7.png", { selectable: false, locked: true }),
          {
            type: "text",
            key: "title",
            text: "Counting Days",
            left: 200,
            top: 200,
            originX: "center",
            width: 210,
            fontFamily: "Playfair Display",
            fontSize: 22,
            textAlign: "center",
            fill: CV.crimson,
          },
          {
            type: "countdownBox",
            key: "day",
            label: "Day",
            value: "00",
            // `top` shifts the whole box; the stock parts keep their offsets.
            top: 296,
            left: 120,
            width: 46,
            height: 70,
            // originX centre on the box makes it share the label's and value's
            // anchor, so all three line up inside the narrow floral opening.
            box: { originX: "center", fill: "#ece2d8", rx: 8, ry: 8 },
            labelStyle: { width: 46, fontSize: 10, fill: CV.muted, fontFamily: "Montserrat" },
            valueStyle: { width: 46, fontSize: 18, fill: CV.crimson, fontFamily: "Playfair Display" },
          },
          {
            type: "countdownBox",
            key: "hour",
            label: "Hour",
            value: "00",
            // `top` shifts the whole box; the stock parts keep their offsets.
            top: 296,
            left: 172,
            width: 46,
            height: 70,
            // originX centre on the box makes it share the label's and value's
            // anchor, so all three line up inside the narrow floral opening.
            box: { originX: "center", fill: "#ece2d8", rx: 8, ry: 8 },
            labelStyle: { width: 46, fontSize: 10, fill: CV.muted, fontFamily: "Montserrat" },
            valueStyle: { width: 46, fontSize: 18, fill: CV.crimson, fontFamily: "Playfair Display" },
          },
          {
            type: "countdownBox",
            key: "minute",
            label: "Minute",
            value: "00",
            // `top` shifts the whole box; the stock parts keep their offsets.
            top: 296,
            left: 224,
            width: 46,
            height: 70,
            // originX centre on the box makes it share the label's and value's
            // anchor, so all three line up inside the narrow floral opening.
            box: { originX: "center", fill: "#ece2d8", rx: 8, ry: 8 },
            labelStyle: { width: 46, fontSize: 10, fill: CV.muted, fontFamily: "Montserrat" },
            valueStyle: { width: 46, fontSize: 18, fill: CV.crimson, fontFamily: "Playfair Display" },
          },
          {
            type: "countdownBox",
            key: "second",
            label: "Second",
            value: "00",
            // `top` shifts the whole box; the stock parts keep their offsets.
            top: 296,
            left: 276,
            width: 46,
            height: 70,
            // originX centre on the box makes it share the label's and value's
            // anchor, so all three line up inside the narrow floral opening.
            box: { originX: "center", fill: "#ece2d8", rx: 8, ry: 8 },
            labelStyle: { width: 46, fontSize: 10, fill: CV.muted, fontFamily: "Montserrat" },
            valueStyle: { width: 46, fontSize: 18, fill: CV.crimson, fontFamily: "Playfair Display" },
          },
        ],
      },

      // ── 7. Gallery ──────────────────────────────────────────────────────
      // TWO starter photos, like every other template: the package photo
      // counter discounts a FIXED starter count (GALLERY_STARTER_COUNT in
      // CanvasEditor, derived from the shared gallery block), so shipping more
      // would eat into the customer's own photo budget.
      {
        id: "gallery",
        name: "Gallery",
        background: CV.cream,
        elements: [
          {
            type: "text",
            key: "title",
            text: "Gallery",
            left: 198,
            top: 60,
            originX: "center",
            width: 290,
            fontFamily: "Playfair Display",
            fontSize: 24,
            textAlign: "center",
            fill: CV.crimson,
          },
          {
            type: "gallerySlot",
            key: "photo-1",
            index: 1,
            asset: "aiCouple-1.png",
            left: 190,
            top: 320,
            originX: "center",
            originY: "center",
            // Source 1024x1536 into the standard 292x443 frame.
            scaleX: 292 / 1024,
            scaleY: 443 / 1536,
          },
          {
            type: "gallerySlot",
            key: "photo-2",
            index: 2,
            asset: "aiCouple-2.png",
            left: 190,
            top: 320,
            originX: "center",
            originY: "center",
            scaleX: 292 / 1024,
            scaleY: 443 / 1536,
            // Hidden initially — the slideshow reveals one photo at a time.
            visible: false,
          },
        ],
      },

      // ── 8. Guestbook ────────────────────────────────────────────────────
      // Visual only: startGuestbook() fills guestMessage / guestSender with the
      // real wishes on the published invitation.
      {
        id: "guestbook",
        name: "Guestbook",
        background: CV.cream,
        elements: [
          {
            type: "image",
            key: "paper",
            asset: "PAPER.png",
            left: 450,
            top: 312,
            originX: "center",
            scaleX: 0.3,
            scaleY: 0.3,
          },
          {
            type: "text",
            key: "title",
            text: "Guestbook",
            left: 195,
            top: 60,
            originX: "center",
            width: 290,
            fontFamily: "Playfair Display",
            fontSize: 24,
            textAlign: "center",
            fill: CV.crimson,
          },
          {
            type: "text",
            key: "message",
            name: "guestMessage",
            text: "“Your wishes will appear here...”",
            left: 195,
            top: 150,
            originX: "center",
            width: 300,
            fontFamily: "Alegreya",
            fontSize: 16,
            textAlign: "center",
            fill: CV.ink,
          },
          {
            type: "text",
            key: "sender",
            name: "guestSender",
            text: "- Guest Name",
            left: 195,
            top: 220,
            originX: "center",
            width: 300,
            fontFamily: "Alegreya",
            fontSize: 14,
            fontStyle: "italic",
            textAlign: "center",
            fill: CV.muted,
          },
          { type: "guestbookNav", key: "prev", direction: "prev", left: 168, top: 262 },
          { type: "guestbookNav", key: "next", direction: "next", left: 222, top: 262 },
        ],
      },

      // ── 9. Prayer / closing ─────────────────────────────────────────────
      {
        id: "prayer",
        name: "Prayer",
        background: CV.cream,
        elements: [
          cvFullBleed("frame", "Border Flower/7.png", { selectable: false, locked: true }),
          {
            type: "text",
            key: "title",
            text: "Prayer",
            left: 200,
            top: 196,
            originX: "center",
            width: 210,
            fontFamily: "Playfair Display",
            fontSize: 26,
            textAlign: "center",
            fill: CV.crimson,
          },
          {
            type: "text",
            key: "body",
            text: "Semoga Allah melimpahkan\nkeberkahan kepadamu dan\nkeberkahan atas pernikahanmu,\nserta mengumpulkan kalian\nberdua dalam kebaikan",
            left: 200,
            top: 290,
            originX: "center",
            width: 210,
            fontFamily: "Alegreya",
            fontSize: 14,
            lineHeight: 1.6,
            textAlign: "center",
            fill: CV.ink,
          },
          {
            type: "text",
            key: "hashtag",
            text: "#SendItOut",
            left: 200,
            top: 396,
            originX: "center",
            width: 210,
            fontFamily: "Alex Brush",
            fontSize: 22,
            textAlign: "center",
            fill: CV.gold,
          },
          {
            type: "text",
            key: "credit",
            text: "Made for your special day by",
            left: 200,
            top: 452,
            originX: "center",
            width: 210,
            fontFamily: "Montserrat",
            fontSize: 9,
            textAlign: "center",
            fill: CV.muted,
          },
          {
            type: "image",
            key: "submark",
            asset: "Logo/Vi-Up Submark.png",
            left: 200,
            top: 478,
            originX: "center",
            scaleX: 0.03,
            scaleY: 0.03,
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Ivory Decree — iFastNet template 1.
  //
  // Third template on the shared remote pipeline, added the same way as the two
  // above: media stays on vi-up.com, design data lives here, and not one line
  // of the manifest client, resolver, cache, Fabric loader or renderer changed.
  //
  //   assetProvider: "ifastnet" + remoteTemplateId: 1
  //     "Text-Logo/date.svg"
  //        -> https://vi-up.com/uploads/templates/1/Text-Logo/date.svg
  //
  // DISPLAY NAME vs SOURCE NAME. `name` is what the Templates panel shows; the
  // iFastNet folder keeps its legacy layout untouched (its MayaxAsyraaf/ wrapper
  // page and Text-Logo/Logo_MayaAsyraaf.png included). Nothing was renamed
  // remotely to produce "Ivory Decree" on the card.
  //
  // NOT USED, because the manifest reports them missing on disk:
  //   ornament border1.svg, Border Flower/7.png, Border Flower/PAPER.png
  //   (the top-level PAPER.png below is present), YOUR_FLORAL_IMAGE.png,
  //   Music/…mp3, fonts/Alice-{regular,bold}.otf — the design still sets Alice,
  //   which the app loads from Google Fonts, so the missing files cost nothing.
  // NOT USED for a different reason: this template's B&G.svg declares only a
  //   viewBox, which renders as a top-left crop (see the SVG note in the header).
  //   Its other two SVGs carry width/height and are fine.
  // ═══════════════════════════════════════════════════════════════════════
  ivoryDecree: {
    id: "ivory-decree",
    name: "Ivory Decree",
    slug: "ivory-decree",
    description:
      "Nine-page invitation on ivory damask inside a carved frame, with a wreathed monogram, engraved date plate, itinerary, gallery and guestbook. Media is hosted on vi-up.com.",
    category: "wedding",
    version: "1.0.0",
    assetProvider: "ifastnet",
    remoteTemplateId: 1,
    // No `thumbnail`, matching the other cards: the Templates panel only renders
    // an image when one is declared, so listing this template costs no request
    // at all and nothing is fetched until it is actually applied.
    canvas: {
      width: 396,
      height: 704,
      background: ID_.ivory,
    },
    // Descriptive only — the footer features are event-data driven and wired
    // globally, not per template. See TemplateFeatureHints.
    features: {
      rsvp: true,
      moneyGift: true,
      calendar: true,
      location: true,
      contact: true,
      music: true,
      guestbook: true,
      countdown: true,
      gallery: true,
    },
    pages: [
      // ── 1. Envelope ─────────────────────────────────────────────────────
      // Same envelope artwork as the shared block (identical 4626x4205 head and
      // 4500x5147 body), so it keeps that block's proven geometry. The three
      // `envelope-*` names are FUNCTIONAL: they mark the openable cover, lock
      // the parts, and are what extract-envelope lifts into the published page.
      // "Undangan" / "Walimatulurus" / "Press to open" are likewise the strings
      // that publisher matches on for the title, subtitle and prompt.
      {
        id: "envelope",
        name: "Envelope",
        background: ID_.ivory,
        elements: [
          {
            type: "image",
            key: "body",
            name: "envelope-body",
            asset: "Envelope Intro (2)/Envelope Intro/body.png",
            left: 200,
            top: 580,
            originX: "center",
            scaleX: 0.1,
            scaleY: 0.1,
          },
          {
            type: "image",
            key: "head",
            name: "envelope-head",
            asset: "Envelope Intro (2)/Envelope Intro/head.png",
            left: 195,
            top: 200,
            originX: "center",
            scaleX: 0.1,
            scaleY: 0.1,
          },
          {
            type: "text",
            key: "title",
            text: "Undangan",
            left: 198,
            top: 60,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 22,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "text",
            key: "subtitle",
            text: "Walimatulurus",
            left: 198,
            top: 96,
            originX: "center",
            width: 284,
            fontFamily: "Montserrat",
            fontSize: 11,
            charSpacing: 240,
            textAlign: "center",
            fill: ID_.gold,
          },
          {
            type: "image",
            key: "monogram",
            // 81x93 with explicit width/height in the file, so it rasterizes
            // correctly at any scale.
            asset: "Text-Logo/DA_initials.svg",
            left: 198,
            top: 210,
            originX: "center",
            originY: "center",
            scaleX: 1.5,
            scaleY: 1.5,
          },
          {
            type: "image",
            key: "seal",
            name: "envelope-seal",
            asset: "Envelope Intro (2)/Envelope Intro/seal.png",
            left: 190,
            top: 390,
            originX: "center",
            originY: "center",
            // 1000px square down to 100px.
            scaleX: 0.1,
            scaleY: 0.1,
          },
          {
            type: "text",
            key: "press",
            text: "Press to open",
            left: 198,
            top: 500,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 20,
            textAlign: "center",
            fill: ID_.muted,
          },
        ],
      },

      // ── 2. Invitation ───────────────────────────────────────────────────
      {
        id: "invitation",
        name: "Invitation",
        background: ID_.ivory,
        elements: [
          idFullBleed("frame", "HD_Vintage Floral.png", { selectable: false, locked: true }),
          {
            type: "image",
            key: "monogram",
            asset: "Text-Logo/DA_initials.svg",
            left: 198,
            top: 160,
            originX: "center",
            originY: "center",
            scaleX: 1.7,
            scaleY: 1.7,
          },
          {
            type: "text",
            key: "story",
            text: "What began as a simple connection\nblossomed into a love full of laughter, faith and dreams",
            left: 198,
            top: 290,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 15,
            lineHeight: 1.5,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "text",
            key: "invite-line",
            text: "you are invited to the day love finds its forever for,",
            left: 198,
            top: 348,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 13,
            textAlign: "center",
            fill: ID_.muted,
          },
          {
            type: "image",
            key: "date-plate",
            // 213x106, width/height declared in the file.
            asset: "Text-Logo/date.svg",
            left: 198,
            top: 440,
            originX: "center",
            originY: "center",
            scaleX: 1.15,
            scaleY: 1.15,
          },
          {
            type: "text",
            key: "venue",
            text: "Neverleave Island Resort",
            left: 198,
            top: 540,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 15,
            textAlign: "center",
            fill: ID_.ink,
          },
        ],
      },

      // ── 3. Hosts ────────────────────────────────────────────────────────
      {
        id: "parents",
        name: "Hosts",
        background: ID_.ivory,
        elements: [
          idFullBleed("frame", "HD_Vintage Floral.png", { selectable: false, locked: true }),
          {
            type: "text",
            key: "greeting",
            text: "Assalamualaikum WBT & Salam Sejahtera",
            left: 198,
            top: 105,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 13,
            textAlign: "center",
            fill: ID_.muted,
          },
          {
            type: "text",
            key: "host-1",
            text: "VZLY NEXUS",
            left: 198,
            top: 160,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 18,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "text",
            key: "host-amp",
            text: "&",
            left: 198,
            top: 196,
            originX: "center",
            width: 284,
            fontFamily: "Alex Brush",
            fontSize: 26,
            textAlign: "center",
            fill: ID_.gold,
          },
          {
            type: "text",
            key: "host-2",
            text: "VI-UP",
            left: 198,
            top: 234,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 18,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "text",
            key: "invitation-text",
            text: "“Dengan penuh hormat dan takzim,\nsukacita menjunjung Pengiran berangkat\nmenjemput Pehin / Dato / Datin\n/ Awang / Dayang / Tuan / Puan / Cik\nuntuk bersama-sama memeriahkan majlis\nwalimatulurus puteri kami dan pasangannya”",
            left: 198,
            top: 360,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 13,
            lineHeight: 1.6,
            textAlign: "center",
            fill: ID_.muted,
          },
          {
            type: "text",
            key: "couple-1",
            text: "BRIDE",
            left: 198,
            top: 480,
            originX: "center",
            width: 284,
            fontFamily: "Montserrat",
            fontSize: 15,
            charSpacing: 200,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "text",
            key: "couple-amp",
            text: "&",
            left: 198,
            top: 516,
            originX: "center",
            width: 284,
            fontFamily: "Alex Brush",
            fontSize: 26,
            textAlign: "center",
            fill: ID_.gold,
          },
          {
            type: "text",
            key: "couple-2",
            text: "GROOM",
            left: 198,
            top: 554,
            originX: "center",
            width: 284,
            fontFamily: "Montserrat",
            fontSize: 15,
            charSpacing: 200,
            textAlign: "center",
            fill: ID_.ink,
          },
        ],
      },

      // ── 4. Event details ────────────────────────────────────────────────
      {
        id: "eventDetails",
        name: "Event Details",
        background: ID_.ivory,
        elements: [
          idFullBleed("frame", "HD_Vintage Floral.png", { selectable: false, locked: true }),
          idHeading("DATE", 130),
          idBody("26 April 2026", 158),
          idHeading("TIME", 226),
          idBody("9.00 AM – 2.00 PM", 254),
          idHeading("VENUE", 322),
          idBody("Neverleave Island Resort", 350),
          idHeading("DRESS CODE", 418),
          idBody(
            "Pakaian Tradisional –\nBaju Kurung, Baju Melayu Lengkap,\nBatik atau lain-lain pakaian\ntradisional yang sopan",
            470,
            13,
          ),
        ],
      },

      // ── 5. Itinerary ────────────────────────────────────────────────────
      {
        id: "itinerary",
        name: "Itinerary",
        background: ID_.ivory,
        elements: [
          idFullBleed("frame", "HD_Vintage Floral.png", { selectable: false, locked: true }),
          {
            type: "text",
            key: "title",
            text: "Itinerary",
            left: 198,
            top: 110,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 24,
            textAlign: "center",
            fill: ID_.ink,
          },
          ...idItineraryRow("9.00 AM", "Ketibaan para jemputan", 185),
          ...idItineraryRow("9.30 AM", "Majlis Akad Nikah", 230),
          ...idItineraryRow("10.00 AM", "Bacaan doa\n(diikuti dengan jamuan ringan)", 280),
          ...idItineraryRow("11.30 AM", "Majlis bersanding", 340),
          ...idItineraryRow("12.00 PM", "Jamuan makan bermula", 385),
          ...idItineraryRow("2.00 PM", "Majlis bersurai", 430),
          {
            type: "text",
            key: "closing-note",
            text: "Jemput hadir mengikut masa yang ditetapkan",
            left: 198,
            top: 500,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 13,
            lineHeight: 1.5,
            textAlign: "center",
            fill: ID_.muted,
          },
        ],
      },

      // ── 6. Counting Days ────────────────────────────────────────────────
      // countdownBox emits `countdownUnit`, which the per-second ticker in the
      // editor and in the published invitation rewrites. No per-template code.
      {
        id: "countdown",
        name: "Counting Days",
        background: ID_.ivory,
        elements: [
          idFullBleed("frame", "HD_Vintage Floral.png", { selectable: false, locked: true }),
          {
            type: "text",
            key: "title",
            text: "Counting Days",
            left: 198,
            top: 150,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 24,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "countdownBox",
            key: "day",
            label: "Day",
            value: "00",
            // `top` shifts the whole box; the parts keep their stock offsets.
            top: 300,
            left: 92,
            width: 62,
            height: 76,
            // originX centre on the box shares the label's and value's anchor,
            // so all three line up.
            box: { originX: "center", fill: "#e6dccd", rx: 8, ry: 8 },
            labelStyle: { width: 62, fontSize: 11, fill: ID_.muted, fontFamily: "Montserrat" },
            valueStyle: { width: 62, fontSize: 20, fill: ID_.ink, fontFamily: "Alice" },
          },
          {
            type: "countdownBox",
            key: "hour",
            label: "Hour",
            value: "00",
            top: 300,
            left: 163,
            width: 62,
            height: 76,
            box: { originX: "center", fill: "#e6dccd", rx: 8, ry: 8 },
            labelStyle: { width: 62, fontSize: 11, fill: ID_.muted, fontFamily: "Montserrat" },
            valueStyle: { width: 62, fontSize: 20, fill: ID_.ink, fontFamily: "Alice" },
          },
          {
            type: "countdownBox",
            key: "minute",
            label: "Minute",
            value: "00",
            top: 300,
            left: 234,
            width: 62,
            height: 76,
            box: { originX: "center", fill: "#e6dccd", rx: 8, ry: 8 },
            labelStyle: { width: 62, fontSize: 11, fill: ID_.muted, fontFamily: "Montserrat" },
            valueStyle: { width: 62, fontSize: 20, fill: ID_.ink, fontFamily: "Alice" },
          },
          {
            type: "countdownBox",
            key: "second",
            label: "Second",
            value: "00",
            top: 300,
            left: 305,
            width: 62,
            height: 76,
            box: { originX: "center", fill: "#e6dccd", rx: 8, ry: 8 },
            labelStyle: { width: 62, fontSize: 11, fill: ID_.muted, fontFamily: "Montserrat" },
            valueStyle: { width: 62, fontSize: 20, fill: ID_.ink, fontFamily: "Alice" },
          },
        ],
      },

      // ── 7. Gallery ──────────────────────────────────────────────────────
      // TWO starter photos, like every other template: the package photo counter
      // discounts a FIXED starter count (GALLERY_STARTER_COUNT in CanvasEditor,
      // derived from the shared gallery block), so shipping more would eat into
      // the customer's own photo budget. The source shows aiCouple-2 first.
      {
        id: "gallery",
        name: "Gallery",
        background: ID_.ivory,
        elements: [
          {
            type: "text",
            key: "title",
            text: "Gallery",
            left: 198,
            top: 80,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 24,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "gallerySlot",
            key: "photo-1",
            index: 1,
            asset: "aiCouple-2.png",
            left: 198,
            top: 350,
            originX: "center",
            originY: "center",
            // Source 1024x1536 into the standard 292x443 frame.
            scaleX: 292 / 1024,
            scaleY: 443 / 1536,
          },
          {
            type: "gallerySlot",
            key: "photo-2",
            index: 2,
            asset: "aiCouple-1.png",
            left: 198,
            top: 350,
            originX: "center",
            originY: "center",
            scaleX: 292 / 1024,
            scaleY: 443 / 1536,
            // Hidden initially — the slideshow reveals one photo at a time.
            visible: false,
          },
        ],
      },

      // ── 8. Guestbook ────────────────────────────────────────────────────
      // Visual only: startGuestbook() fills guestMessage / guestSender with the
      // real wishes on the published invitation.
      {
        id: "guestbook",
        name: "Guestbook",
        background: ID_.ivory,
        elements: [
          {
            type: "image",
            key: "paper",
            asset: "PAPER.png",
            left: 450,
            top: 312,
            originX: "center",
            scaleX: 0.3,
            scaleY: 0.3,
          },
          {
            type: "text",
            key: "title",
            text: "Guestbook",
            left: 198,
            top: 80,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 24,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "text",
            key: "message",
            name: "guestMessage",
            text: "“Your wishes will appear here...”",
            left: 198,
            top: 170,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 16,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "text",
            key: "sender",
            name: "guestSender",
            text: "- Guest Name",
            left: 198,
            top: 235,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 14,
            fontStyle: "italic",
            textAlign: "center",
            fill: ID_.muted,
          },
          { type: "guestbookNav", key: "prev", direction: "prev", left: 170, top: 300 },
          { type: "guestbookNav", key: "next", direction: "next", left: 226, top: 300 },
        ],
      },

      // ── 9. Prayer / closing ─────────────────────────────────────────────
      {
        id: "prayer",
        name: "Prayer",
        background: ID_.ivory,
        elements: [
          idFullBleed("frame", "HD_Vintage Floral.png", { selectable: false, locked: true }),
          {
            type: "text",
            key: "title",
            text: "Prayer",
            left: 198,
            top: 120,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 30,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "text",
            key: "body",
            text: "Semoga Allah melimpahkan\nkeberkahan kepadamu dan\nkeberkahan atas pernikahanmu,\nserta mengumpulkan kalian\nberdua dalam kebaikan",
            left: 198,
            top: 280,
            originX: "center",
            width: 284,
            fontFamily: "Alice",
            fontSize: 16,
            lineHeight: 1.7,
            textAlign: "center",
            fill: ID_.ink,
          },
          {
            type: "text",
            key: "hashtag",
            text: "#SendItOut",
            left: 198,
            top: 430,
            originX: "center",
            width: 284,
            fontFamily: "Alex Brush",
            fontSize: 26,
            textAlign: "center",
            fill: ID_.gold,
          },
          {
            type: "text",
            key: "credit",
            text: "Made for your special day by",
            left: 198,
            top: 500,
            originX: "center",
            width: 284,
            fontFamily: "Montserrat",
            fontSize: 10,
            textAlign: "center",
            fill: ID_.muted,
          },
          {
            type: "image",
            key: "submark",
            asset: "Logo/Vi-Up Submark.png",
            left: 198,
            top: 535,
            originX: "center",
            originY: "center",
            // 1296x1115 at the 31px the source renders it.
            scaleX: 31 / 1296,
            scaleY: 31 / 1296,
          },
        ],
      },
    ],
  },

  // ── Add the next template below ─────────────────────────────────────────
  // A LOCAL (Vercel-hosted) template, for contrast with the two above:
  // midnightVelvet: {
  //   id: "midnight-velvet",
  //   name: "Midnight Velvet",
  //   slug: "midnight-velvet",
  //   thumbnail: "thumbnail.webp",          // resolved against baseAssetPath
  //   baseAssetPath: "/templates/crimson-velvet",
  //   canvas: { width: 396, height: 704, background: "#1a0508" },
  //   pages: [
  //     {
  //       id: "cover",
  //       background: "#1a0508",
  //       elements: [
  //         { type: "image", name: "envelope-body", asset: "body.webp", x: 198, y: 580, originX: "center" },
  //         { type: "text", text: "Undangan", x: 198, y: 60, originX: "center", fontSize: 22, fill: "#f5e0c8" },
  //       ],
  //     },
  //     { block: "gallery" },               // reuse a shared block as-is
  //   ],
  // },
};
