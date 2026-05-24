export const galleryPage = {
  version: "7.0.0",
  background: "#ffffff",
  objects: [
    // Title
    {
      type: "textbox",
      text: "Gallery",
      left: 190,
      top: 60,
      originX: "center",
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000"
    },

    // Image 1 placeholder
    {
      type: "rect",
      left: 187,
      top: 200,
      width: 300,
      height: 180,
      fill: "#e5e5e5",
      rx: 10,
      ry: 10,
      name: "galleryImage1"
    },

    

    // Image 2 placeholder
    {
      type: "rect",
      left: 187,
      top: 200,
      width: 300,
      height: 180,
      fill: "#e5e5e5",
      rx: 10,
      ry: 10,
      name: "galleryImage2"
    },

    
  ]
};

// Gallery page template
// Uses placeholder rectangles for images
// Actual images will replace these dynamically later

// "name" is used to identify placeholders later
// Allows image replacement (like Canva frames)