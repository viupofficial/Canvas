//explain all of this coding to me in detail, what is the purpose of this code and how does it work?
//This code defines a template for a guestbook page using a JSON-like structure. The purpose of this code is to create a visual layout 
// for a guestbook where visitors can leave their messages and see messages from others.

//how does it work inside the code how is it called and how does it interact with other parts of the application?
// The `guestbookPage` object contains properties that define the version, background color, and an array of objects that represent 
// different elements on the page (like textboxes and images). Each object has properties 
// that specify its type, position, styling, and content.

//can you list the other files that call this template and explain how they use it?
// The code snippet provided does not include information about other files that call this template. However, in a typical application, 
// this template would be imported and used in a component or page that renders the guestbook. 
// The dynamic content (like messages and pagination) would be handled through JavaScript, where the template serves as 
// the static 
// layout for displaying the guestbook entries. 
// The `guestMessages` array is an example of how messages might be stored and displayed on the page, 
// with functionality to navigate through messages using the left and right buttons.


export const guestbookPage = {
  version: "7.0.0",
  background: "#ffffff",
  objects: [

      {
  type: "image",
  version: "5.3.0",
  left: 450,
  top: 312,
  originX: "center",
  scaleX: 0.3,
  scaleY: 0.3,
  angle: 0,
  // Filename is uppercase on disk (public/PAPER.png). The mixed-case "/Paper.png"
  // resolved on case-insensitive Windows but 404'd on the case-sensitive Linux
  // deploy — and a failed image load rejects the whole enlivenObjects batch, so
  // the entire guestbook element failed to insert. Match the real filename.
  src: "/PAPER.png"
},
    // Title
    {
      type: "textbox",
      text: "Guestbook",
      left: 195,
      top: 60,
      originX: "center",
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      fill: "#000"
    },

    // Message (dynamic later)
    {
      type: "textbox",
      text: "“Your wishes will appear here...”",
      left: 195,
      top: 150,
      originX: "center",
      width: 300,
      fontSize: 16,
      textAlign: "center",
      fill: "#333",
      name: "guestMessage"
    },

    // Sender
    {
      type: "textbox",
      text: "- Guest Name",
      left: 195,
      top: 220,
      originX: "center",
      width: 300,
      fontSize: 14,
      fontStyle: "italic",
      textAlign: "center",
      fill: "#666",
      name: "guestSender"
    },

    // Left button — brown rounded pill behind the arrow. Fabric textboxes can't
    // render a rounded background, so the button is a separate rect painted first
    // (below) with the white glyph centred on top.
    {
      type: "rect",
      left: 168,
      top: 262,
      width: 44,
      height: 44,
      rx: 12,
      ry: 12,
      originX: "center",
      originY: "center",
      fill: "#f2ede9",
      stroke: "#e6ddd6",
      strokeWidth: 1,
      name: "prevBtnBg"
    },
    {
      type: "textbox",
      text: "←",
      left: 168,
      top: 262,
      width: 44,
      originX: "center",
      originY: "center",
      fontSize: 22,
      textAlign: "center",
      fill: "#333",
      name: "prevBtn"
    },

    // Right button
    {
      type: "rect",
      left: 222,
      top: 262,
      width: 44,
      height: 44,
      rx: 12,
      ry: 12,
      originX: "center",
      originY: "center",
      fill: "#f2ede9",
      stroke: "#e6ddd6",
      strokeWidth: 1,
      name: "nextBtnBg"
    },
    {
      type: "textbox",
      text: "→",
      left: 222,
      top: 262,
      width: 44,
      originX: "center",
      originY: "center",
      fontSize: 22,
      textAlign: "center",
      fill: "#333",
      name: "nextBtn"
    }
  ]
};// Guestbook template (visual only)
// Dynamic content (messages, pagination) handled via JS — see startGuestbook
// in RsvpPlayer, which fills guestMessage/guestSender with real entries (or a
// neutral "No guestbook entries yet." placeholder when there are none).

