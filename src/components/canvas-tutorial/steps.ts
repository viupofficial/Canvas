// Step definitions for the first-run canvas walkthrough.
//
// Every step points at REAL editor controls through the `data-tutorial`
// attributes added to the existing components:
//   • canvas-editor/sidebar.tsx      → data-tutorial="tool-<id>"  (desktop rail)
//   • canvas-editor/mobile-toolbar.tsx → data-tutorial="tool-<id>" (phone rail)
//   • canvas-editor/editor-header.tsx  → data-tutorial="preview"   (both rails)
//
// Desktop and phone carry the SAME attribute, so a step needs no viewport
// variants: the overlay resolves every selector and spotlights whichever copies
// are actually on screen (see resolveTargets in CanvasTutorial).

export type TutorialPlacement = "right" | "left" | "top" | "bottom";

export type TutorialStep = {
  /** Stable id — used as the React key and for logging. */
  id: string;
  title: string;
  body: string;
  /**
   * One or more real controls to spotlight. The highlight is the union of the
   * visible matches, so a step can cover a contiguous run of rail buttons.
   */
  selectors: string[];
  /** Preferred tooltip side; the overlay falls back when it doesn't fit. */
  placement?: TutorialPlacement;
};

/** Intro card — no target, centred over the dimmed canvas. */
export const TUTORIAL_INTRO = {
  title: "Ready to Create Your Invitation?",
  body: "Let's walk through the tools you'll use to build your e-invitation — templates, design, media, event details and RSVP. It only takes a minute, and you can skip it any time.",
  startLabel: "Start a Guide Tour",
  skipLabel: "Skip for now",
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "templates",
    title: "Choose your Template",
    body: "Start here. Pick a ready-made design that suits your event — every part of it stays editable once it's on the canvas.",
    selectors: ['[data-tutorial="tool-templates"]'],
    placement: "right",
  },
  {
    id: "design",
    title: "Add your Design Elements and Text",
    body: "Drop in graphics, stickers and shapes, change the page background, and add or restyle any text on your invitation.",
    selectors: [
      '[data-tutorial="tool-elements"]',
      '[data-tutorial="tool-background"]',
      '[data-tutorial="tool-text"]',
    ],
    placement: "right",
  },
  {
    id: "media",
    title: "Upload your Media",
    body: "Bring your invitation to life with your own photo gallery and a background song that plays for your guests.",
    selectors: ['[data-tutorial="tool-photo"]', '[data-tutorial="tool-music"]'],
    placement: "right",
  },
  {
    id: "details",
    title: "Fill in your Event Details",
    body: "Add the contacts guests can reach, the venue for directions, and the date and time that drives the calendar and countdown.",
    selectors: [
      '[data-tutorial="tool-contact"]',
      '[data-tutorial="tool-location"]',
      '[data-tutorial="tool-calendar"]',
    ],
    placement: "right",
  },
  {
    id: "rsvp",
    title: "Set up your RSVP & Special Features",
    body: "Collect attendance replies from your guests and add a money gift page with your account or QR details.",
    selectors: ['[data-tutorial="tool-rsvp"]', '[data-tutorial="tool-money"]'],
    placement: "right",
  },
  {
    id: "preview",
    title: "Preview your Invitation",
    body: "See exactly what your guests will see. When everything looks right, use Share to publish your invitation and send the link.",
    selectors: ['[data-tutorial="preview"]'],
    placement: "bottom",
  },
];
