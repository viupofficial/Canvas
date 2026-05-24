const createParentsSection = (top: number) => {
  return [
    {
      type: "textbox",
      text: "Assalamualaikum WBT & Salam Sejahtera",
      left: 180,
      top,
      originX: "center",
      width: 320,
      fontSize: 14,
      textAlign: "center",
      fill: "#333"
    },

    {
      type: "textbox",
      text: `VIUP`,
      left: 180,
      top: top + 40,
      originX: "center",
      width: 320,
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000"
    },

    {
      type: "textbox",
      text: "&",
      left: 180,
      top: top + 90,
      originX: "center",
      fontSize: 24,
      fontFamily: "TeXGyreTermes",
      textAlign: "center"
    },

    {
      type: "textbox",
      text: `VIUP`,
      left: 180,
      top: top + 120,
      originX: "center",
      width: 320,
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000"
    }
  ];
};
const createInvitationText = (top: number) => [
  {
    type: "textbox",
    text: `“Dengan penuh hormat dan takzim,
sukacita menjunjung Pengiran berangkat
menjemput Pehin / Dato / Datin
/ Awang / Dayang / Tuan / Puan / Cik
untuk bersama - sama memeriahkan majlis
walimatulurus puteri kami dan pasangannya”`,
    left: 180,
    top,
    originX: "center",
    width: 320,
    fontSize: 14,
    lineHeight: 1.6,
    textAlign: "center",
    fill: "#333"
  }
];
const createBrideGroomSection = (top: number) => {
  return [
    {
      type: "textbox",
      text: `VIUP`,
      left: 180,
      top,
      originX: "center",
      width: 320,
      fontSize: 18,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000"
    },

    {
      type: "textbox",
      text: "&",
      left: 180,
      top: top + 60,
      originX: "center",
      fontSize: 28,
      fontFamily: "TeXGyreTermes",
      textAlign: "center"
    },

    {
      type: "textbox",
      text: `VIUP`,
      left: 180,
      top: top + 110,
      originX: "center",
      width: 320,
      fontSize: 18,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000"
    }
  ];
};
// Bride & Groom section
// Large typography with emphasis and centered layout

export const parentsPage = {
  version: "7.0.0",
  background: "#ffffff",
  objects: [
    ...createParentsSection(80),

    ...createInvitationText(310),

    ...createBrideGroomSection(440)
  ]
};