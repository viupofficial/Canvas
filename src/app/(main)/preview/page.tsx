"use client";

import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import EventFooter from "../../../components/EventFooter";

export default function PreviewPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null);

  const [pages, setPages] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);

  // Event footer data
  const [contacts, setContacts] = useState<any[]>([]);
  const [moneyGift, setMoneyGift] = useState<any | null>(null);
  const [calendar, setCalendar] = useState<any | null>(null);
  const [location, setLocation] = useState<any | null>(null);
  const [rsvpConfig, setRsvpConfig] = useState<any | null>(null);

  // 🔥 LOAD DATA FROM LOCAL STORAGE
  useEffect(() => {
    const raw = localStorage.getItem("viup_project");
    if (raw) {
      const data = JSON.parse(raw);
      setPages(data.pages || []);
      setCurrentPage(data.currentPage || 0);
      setMusicUrl(data.musicUrl || null);
    }

    const eventRaw = localStorage.getItem("viup_event_data");
    if (eventRaw) {
      const eventData = JSON.parse(eventRaw);
      setContacts(eventData.contacts || []);
      setMoneyGift(eventData.moneyGift || null);
      setCalendar(eventData.calendar || null);
      setLocation(eventData.location || null);
      setRsvpConfig(eventData.rsvpConfig || null);
    }
  }, []);

  // 🔥 INIT FABRIC (READ ONLY + FIX SIZE)
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      selection: false,
    });

    // ✅ IMPORTANT: set correct dimensions (match your editor)
    canvas.setDimensions({
      width: 396,
      height: 704,
    });

    canvas.backgroundColor = "#ffffff";

    // extra locking (no interactions at all)
    canvas.skipTargetFind = true;
    canvas.hoverCursor = "default";

    fabricRef.current = canvas;

    return () => {
      canvas.dispose();
    };
  }, []);

  // 🔥 LOAD CURRENT PAGE INTO CANVAS
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !pages.length) return;

    const pageData = pages[currentPage];

    canvas.clear();

    if (pageData) {
      canvas.loadFromJSON(pageData, () => {
        canvas.forEachObject((obj: any) => {
            obj.selectable = false;
            obj.evented = false;
            obj.setCoords(); // 🔥 VERY IMPORTANT
          });

          canvas.calcOffset(); // 🔥 recalculate canvas position
          canvas.renderAll();  // 🔥 force render

          // 🔒 lock interactions
          canvas.selection = false;
          canvas.skipTargetFind = true;
          canvas.upperCanvasEl.style.pointerEvents = "none";

        canvas.renderAll();
        //keyword to refresh and shot canvass content for text sometimes when adding new page
        //or preview ayat hilang so letak ayat settimeout untuk tunjuk balik
        setTimeout(() => {
            canvas.renderAll();
          }, 50);
      });
    }
  }, [pages, currentPage]);

  // 🔥 AUTO SLIDE (OPTIONAL)
  useEffect(() => {
    if (!pages.length) return;

    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % pages.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [pages]);

  // Manual navigation for preview pages
  const goNext = () => {
    setCurrentPage((prev) => (prev + 1) % pages.length);
  };

  const goPrev = () => {
    setCurrentPage((prev) =>
      (prev - 1 + pages.length) % pages.length
    );
  };

  return (
    <div className="w-full h-screen flex items-center justify-center bg-white">

      <div className="flex items-center gap-4">

        {/* LEFT BUTTON */}
        <button
          onClick={goPrev}
          className="text-xl px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
        >
          ←
        </button>

        {/* CANVAS + FOOTER stacked like a phone */}
        <div
          className="relative shadow-xl rounded-lg overflow-hidden"
          style={{ width: "396px" }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: "396px",
              height: "704px",
              display: "block",
            }}
          />

          {/* EVENT FOOTER sits at the bottom of the canvas frame */}
          <div style={{ width: "396px" }}>
            <EventFooter
              contacts={contacts}
              moneyGift={moneyGift}
              calendar={calendar}
              location={location}
              rsvpConfig={rsvpConfig}
            />
          </div>
        </div>

        {/* RIGHT BUTTON */}
        <button
          onClick={goNext}
          className="text-xl px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
        >
          →
        </button>

      </div>

      {/* MUSIC */}
      {musicUrl && (
        <audio src={musicUrl} autoPlay loop controls className="mt-4" />
      )}
    </div>
  );
}
