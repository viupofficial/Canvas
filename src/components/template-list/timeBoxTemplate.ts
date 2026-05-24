// Helper to generate countdown box (label + value + background)
// Used to simulate HTML layout inside Fabric canvas

const createCountdownBox = (label: string, value: string, left: number) => {
  return [
    // Background box
    {
      type: "rect",
      left,
      top: 140,
      width: 70,
      height: 90,
      fill: "#f5f5f5",
      rx: 10,
      ry: 10
    },

    // Label (Day / Hour)
    {
      type: "textbox",
      text: label,
      left: left + 0,
      top: 130,
      originX: "center",
      width: 56,
      fontSize: 12,
      fontStyle: "italic",
      textAlign: "center",
      fill: "#333"
    },

    // Value (00)
    {
      type: "textbox",
      text: value,
      left: left + 0,
      top: 160,
      originX: "center",
      width: 56,
      fontSize: 22,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000",
      countdownUnit: label.toLowerCase()
    }
  ];
};

// Countdown page layout
// Each box is generated dynamically to avoid repeating code
export const countdownPage = {
  version: "7.0.0",
  background: "#ffffff",
  objects: [
    // Title
    {
      type: "textbox",
      text: "Counting Days",
      left: 190,
      top: 50,
      originX: "center",
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000"
    },

    // Boxes
    ...createCountdownBox("Day", "00", 74),
    ...createCountdownBox("Hour", "00", 152),
    ...createCountdownBox("Minute", "00", 232),
    ...createCountdownBox("Second", "00", 314)
  ]
};
