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

    // Image 2 — same standardized frame as image 1.
    {
      type: "image",
      src: "/aiCouple-2.png",
      left: 190,
      top: 310,
      originX: "center",
      originY: "center",
      scaleX: 0.28515625,
      scaleY: 0.2884114583333333,
      name: "galleryImage2"
    },
  ]
};

// Gallery page template
// Both image slots use the same standardized 292×443 frame, anchored center at
// (190, 310). "name" identifies them (galleryImage1 / galleryImage2) so the
// page can be detected/removed by the Photos sidebar toggle.
