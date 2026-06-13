export const galleryPage = {
  version: "7.0.0",
  background: "#ffffff",
  objects: [
    // Title
    {
      type: "textbox",
      text: "Gallery",
      left: 198,
      top: 60,
      originX: "center",
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000"
    },

    // Image 1 — default photo, standardized frame.
    // Source 1024×1536 → 292×443 (scaleX 292/1024, scaleY 443/1536).
    // Anchored center at (190, 310). `name` keeps the page detectable.
    {
      type: "image",
      src: "/aiCouple-1.png",
      left: 190,
      top: 310,
      originX: "center",
      originY: "center",
      scaleX: 0.28515625,
      scaleY: 0.2884114583333333,
      name: "galleryImage1"
    },

    // Image 2 — same standardized frame, stacked directly on top of image 1.
    // Hidden initially: the gallery slideshow reveals one photo at a time.
    {
      type: "image",
      src: "/aiCouple-2.png",
      left: 190,
      top: 310,
      originX: "center",
      originY: "center",
      scaleX: 0.28515625,
      scaleY: 0.2884114583333333,
      visible: false,
      name: "galleryImage2"
    },
  ]
};

// Gallery page template
// All image slots share the same standardized 292×443 frame, anchored center at
// (190, 310), so they overlap into a single slot. "name" identifies them
// (galleryImage1 / galleryImage2 / …) so the page can be detected/removed by the
// Photos sidebar toggle, and so the slideshow can cycle which one is visible —
// the slot shows one photo at a time, swapping every few seconds (editor +
// published view). Uploaded photos are appended as more galleryImageN slots.
