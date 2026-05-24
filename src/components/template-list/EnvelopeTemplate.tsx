export const envelopePage = {
  version: "7.0.0",
  background: "#f5e8dd",
  objects: [

    {
  type: "image",
  version: "5.3.0",
  left: 200,
  top: 580,
  originX: "center",
  scaleX: 0.1,
  scaleY: 0.1,
  src: "/body.png",
  name: "envelope-body"
},
      {
  type: "image",
  version: "5.3.0",
  left: 195,
  top: 200,
  originX: "center",
  scaleX: 0.1,
  scaleY: 0.1,
  src: "/head.png",
  name: "envelope-head"
},

    // Undangan
    {
      type: "textbox",
      text: "Undangan",
      left: 190,
      top: 50,
      originX: "center",
      fontSize: 20,
      fontFamily: "serif",
      textAlign: "center",
      fill: "#000"
    },

    // Walimatulurus
    {
      type: "textbox",
      text: "Walimatulurus",
      left: 190,
      top: 110,
      originX: "center",
      fontSize: 16,
      textAlign: "center",
      fill: "#000"
    },

    // Press to open
    {
      type: "textbox",
      text: "Press to open",
      left: 190,
      top: 485,
      originX: "center",
      fontSize: 25,
      textAlign: "center",
      fill: "#333"
      
    },

    // 👇 IMAGE PLACEHOLDERS (we load actual images later)
    {
      type: "textbox",
      text: "Bride x Groom",
      left: 190,
      top: 200,
      originX: "center",
      width: 320,
      fontSize: 28,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000"
    },

  

    {
  type: "image",
  version: "5.3.0",
  left: 190,
  top: 390,
  originX: "center",
  scaleX: 0.1,
  scaleY: 0.1,
  src: "/seal.png",
  name: "envelope-seal"
},

  
  ]
};