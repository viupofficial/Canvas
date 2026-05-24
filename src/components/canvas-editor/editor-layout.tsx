'use client';
import { useState } from "react"
import Sidebar from "@/src/components/canvas-editor/sidebar"
import EventFooter from "@/src/components/EventFooter"


const navItems = [
  { href: '/dashboard', icon: '', label: 'Dashboard' },
  { href: '/analytics', icon: '', label: 'Analytics' },
  { href: '/leaderboard', icon: '', label: 'Leaderboard' },
  { href: '/friends', icon: '', label: 'Friends' },
  { href: '/settings', icon: '', label: 'Settings' },
];



/**
 * EditorPage is the main component of the canvas editor.
 * It contains the sidebar and the event footer.
 * The sidebar is used to set the contacts, money gift, calendar, location and RSVP config.
 * The event footer is used to display the contacts, money gift, calendar, location and RSVP config.
 */
export default function EditorPage() {
  /**
   * Contacts are the contacts of the event.
   * They are stored in the state.
   */
  const [contacts, setContacts] = useState([]);

  /**
   * MoneyGift is the money gift of the event.
   * It is stored in the state.
   */
  const [moneyGift, setMoneyGift] = useState(null);

  /**
   * Calendar is the calendar of the event.
   * It is stored in the state.
   */
  const [calendar, setCalendar] = useState(null);

  /**
   * Location is the location of the event.
   * It is stored in the state.
   */
  const [location, setLocation] = useState(null);

  /**
   * RSVPConfig is the RSVP config of the event.
   * It is stored in the state.
   */
  const [rsvpConfig, setRSVPConfig] = useState({
    navColor: "#000000",
    navOpacity: 100,
    textColor: "#000000",
    textOpacity: 100,
  });

  return (
    <>
      <Sidebar />
      <EventFooter contacts={contacts} moneyGift={moneyGift} calendar={calendar} location={location} rsvpConfig={rsvpConfig} />
    </>
  );
}

