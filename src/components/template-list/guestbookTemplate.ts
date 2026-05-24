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
  left: 320,
  top: 360,
  originX: "center",
  scaleX: 0.3,
  scaleY: 0.3,
  angle: 270,
  src: "/Paper.png"
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

    // Left button
    {
      type: "textbox",
      text: "←",
      left: 175,
      top: 260,
      fontSize: 24,
      textAlign: "center",
      name: "prevBtn"
    },

    // Right button
    {
      type: "textbox",
      text: "→",
      left: 220,
      top: 260,
      fontSize: 24,
      textAlign: "center",
      name: "nextBtn"
    }
  ]
};// Guestbook template (visual only)
// Dynamic content (messages, pagination) handled via JS

const guestMessages = [
  { message: "Semoga bahagia hingga ke syurga ❤️", sender: "Ali" },
  { message: "Congrats! Stay strong together 💍", sender: "Siti" },
  { message: "Love you guys!! 🎉", sender: "Aiman" }
];

let currentIndex = 0;

