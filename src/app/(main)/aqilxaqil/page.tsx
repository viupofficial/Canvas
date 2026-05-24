"use client";
import EventFooter from "../../../components/EventFooter";
import '../../globals.css';
import { useEffect, useRef, useState } from "react";

const PROJECT_PAGES = [{"version":"7.0.0","background":"#ffffff","objects":[{"type":"image","version":"5.3.0","left":200,"top":100,"originX":"center","scaleX":0.08,"scaleY":0.08,"src":"/bismillah.png"},{"type":"textbox","text":"What began as a simple connection\nblossomed into a love full of laughter, faith and dreams","left":202,"top":360,"originX":"center","width":320,"fontSize":16,"lineHeight":1.6,"textAlign":"center","fill":"#000"},{"type":"textbox","text":"you are invited to the day love finds its forever for,","left":202,"top":410,"originX":"center","width":320,"fontSize":14,"textAlign":"center","fill":"#666"},{"type":"textbox","text":"26 October 2025 | Sunday","left":202,"top":430,"originX":"center","width":320,"fontSize":14,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"SkyGlass Designer Event Hall","left":202,"top":455,"originX":"center","width":320,"fontSize":14,"textAlign":"center","fill":"#333"},{"type":"image","version":"5.3.0","left":200,"top":230,"originX":"center","scaleX":0.08,"scaleY":0.08,"src":"/Maya&Asyraaf_Gold.png"}]},{"version":"7.0.0","background":"#ffffff","objects":[{"type":"Textbox","text":"Prayer","left":198,"top":70,"originX":"center","width":320,"fontSize":48,"fontWeight":"bold","textAlign":"center","fill":"#000000"},{"type":"Textbox","text":"Semoga Allah melimpahkan","left":198,"top":140,"originX":"center","width":320,"fontSize":28,"lineHeight":1.4,"textAlign":"center","fill":"#000000"},{"type":"Textbox","text":"keberkahan kepadamu dan","left":198,"top":180,"originX":"center","width":320,"fontSize":28,"lineHeight":1.4,"textAlign":"center","fill":"#000000"},{"type":"Textbox","text":"keberkahan atas pernikahanmu,","left":198,"top":240,"originX":"center","width":320,"fontSize":28,"lineHeight":1.4,"textAlign":"center","fill":"#000000"},{"type":"Textbox","text":"serta mengumpulkan kalian","left":198,"top":320,"originX":"center","width":300,"fontSize":28,"lineHeight":1.4,"textAlign":"center","fill":"#000000"},{"type":"Textbox","text":"berdua dalam kebaikan","left":198,"top":380,"originX":"center","width":320,"fontSize":28,"lineHeight":1.4,"textAlign":"center","fill":"#000000"},{"type":"textbox","text":"#MayaXAsyraaf","left":198,"top":440,"width":300,"fontSize":18,"fontStyle":"italic","textAlign":"center","fill":"#333"},{"type":"textbox","text":"Made for your special day by","left":198,"top":500,"width":300,"fontSize":12,"textAlign":"center","fill":"#666"},{"type":"image","version":"5.3.0","left":200,"top":530,"originX":"center","scaleX":0.03,"scaleY":0.03,"src":"/Vi-Up-Submark.png"}]},{"version":"7.0.0","background":"#ffffff","objects":[{"type":"textbox","text":"Counting Days","left":190,"top":50,"originX":"center","fontSize":24,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"rect","left":74,"top":140,"width":70,"height":90,"fill":"#f5f5f5","rx":10,"ry":10},{"type":"textbox","text":"Day","left":74,"top":130,"originX":"center","width":56,"fontSize":12,"fontStyle":"italic","textAlign":"center","fill":"#333"},{"type":"textbox","text":"00","left":74,"top":160,"originX":"center","width":56,"fontSize":22,"fontWeight":"bold","textAlign":"center","fill":"#000","countdownUnit":"day"},{"type":"rect","left":152,"top":140,"width":70,"height":90,"fill":"#f5f5f5","rx":10,"ry":10},{"type":"textbox","text":"Hour","left":152,"top":130,"originX":"center","width":56,"fontSize":12,"fontStyle":"italic","textAlign":"center","fill":"#333"},{"type":"textbox","text":"00","left":152,"top":160,"originX":"center","width":56,"fontSize":22,"fontWeight":"bold","textAlign":"center","fill":"#000","countdownUnit":"hour"},{"type":"rect","left":232,"top":140,"width":70,"height":90,"fill":"#f5f5f5","rx":10,"ry":10},{"type":"textbox","text":"Minute","left":232,"top":130,"originX":"center","width":56,"fontSize":12,"fontStyle":"italic","textAlign":"center","fill":"#333"},{"type":"textbox","text":"00","left":232,"top":160,"originX":"center","width":56,"fontSize":22,"fontWeight":"bold","textAlign":"center","fill":"#000","countdownUnit":"minute"},{"type":"rect","left":314,"top":140,"width":70,"height":90,"fill":"#f5f5f5","rx":10,"ry":10},{"type":"textbox","text":"Second","left":314,"top":130,"originX":"center","width":56,"fontSize":12,"fontStyle":"italic","textAlign":"center","fill":"#333"},{"type":"textbox","text":"00","left":314,"top":160,"originX":"center","width":56,"fontSize":22,"fontWeight":"bold","textAlign":"center","fill":"#000","countdownUnit":"second"}]},{"version":"7.0.0","background":"#ffffff","objects":[{"type":"textbox","text":"Itinerary","left":180,"top":50,"originX":"center","fontSize":24,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"9.00 AM","left":60,"top":120,"width":80,"fontSize":14,"fontWeight":"bold","textAlign":"left","fill":"#000"},{"type":"textbox","text":"Ketibaan para jemputan","left":210,"top":120,"width":220,"fontSize":14,"fontWeight":"normal","textAlign":"left","fill":"#000"},{"type":"textbox","text":"9.30 AM","left":60,"top":150,"width":80,"fontSize":14,"fontWeight":"bold","textAlign":"left","fill":"#000"},{"type":"textbox","text":"Majlis Akad Nikah","left":210,"top":150,"width":220,"fontSize":14,"fontWeight":"normal","textAlign":"left","fill":"#000"},{"type":"textbox","text":"10.00 AM","left":60,"top":180,"width":80,"fontSize":14,"fontWeight":"bold","textAlign":"left","fill":"#000"},{"type":"textbox","text":"Bacaan doa (diikuti dengan jamuan ringan)","left":210,"top":180,"width":220,"fontSize":14,"fontWeight":"normal","textAlign":"left","fill":"#000"},{"type":"textbox","text":"11.30 AM","left":60,"top":210,"width":80,"fontSize":14,"fontWeight":"bold","textAlign":"left","fill":"#000"},{"type":"textbox","text":"Majlis bersanding","left":210,"top":210,"width":220,"fontSize":14,"fontWeight":"normal","textAlign":"left","fill":"#000"},{"type":"textbox","text":"12.00 PM","left":60,"top":240,"width":80,"fontSize":14,"fontWeight":"bold","textAlign":"left","fill":"#000"},{"type":"textbox","text":"Jamuan makan bermula","left":210,"top":240,"width":220,"fontSize":14,"fontWeight":"normal","textAlign":"left","fill":"#000"},{"type":"textbox","text":"2.00 PM","left":60,"top":270,"width":80,"fontSize":14,"fontWeight":"bold","textAlign":"left","fill":"#000"},{"type":"textbox","text":"Majlis bersurai","left":210,"top":270,"width":220,"fontSize":14,"fontWeight":"normal","textAlign":"left","fill":"#000"},{"type":"textbox","text":"","left":60,"top":320,"width":80,"fontSize":14,"fontWeight":"bold","textAlign":"left","fill":"#000"},{"type":"textbox","text":"Jemput hadir mengikut masa yang ditetapkan","left":180,"top":320,"width":220,"fontSize":14,"fontWeight":"bold","textAlign":"left","fill":"#000"}]},{"version":"7.0.0","background":"#ffffff","objects":[{"type":"textbox","text":"Date","left":185,"top":80,"originX":"center","width":300,"fontSize":18,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"26 October 2025","left":185,"top":110,"originX":"center","width":300,"fontSize":14,"lineHeight":1.5,"textAlign":"center","fill":"#333"},{"type":"textbox","text":"Time","left":185,"top":160,"originX":"center","width":300,"fontSize":18,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"9.00 AM – 2.00 PM","left":185,"top":190,"originX":"center","width":300,"fontSize":14,"lineHeight":1.5,"textAlign":"center","fill":"#333"},{"type":"textbox","text":"Venue","left":185,"top":240,"originX":"center","width":300,"fontSize":18,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"SkyGlass Designer Event Hall\nT5-22-01, Tower 5, Sky Park @ Cyberjaya,\nJalan Teknokrat 1, Cyber 3,\n63000 Cyberjaya, Selangor","left":185,"top":300,"originX":"center","width":300,"fontSize":14,"lineHeight":1.5,"textAlign":"center","fill":"#333"},{"type":"textbox","text":"Dress Code","left":185,"top":420,"originX":"center","width":300,"fontSize":18,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"Pakaian Tradisional –\nBaju Kurung, Baju Melayu Lengkap,\nBatik atau lain-lain pakaian\ntradisional yang sopan","left":185,"top":480,"originX":"center","width":300,"fontSize":14,"lineHeight":1.5,"textAlign":"center","fill":"#333"}]},{"version":"7.0.0","background":"#ffffff","objects":[{"type":"textbox","text":"Assalamualaikum WBT & Salam Sejahtera","left":180,"top":80,"originX":"center","width":320,"fontSize":14,"textAlign":"center","fill":"#333"},{"type":"textbox","text":"SHEIKH SHAMSHRUL\nHEDRA BIN SHEIKH MUSA","left":180,"top":120,"originX":"center","width":320,"fontSize":16,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"&","left":180,"top":170,"originX":"center","fontSize":24,"fontFamily":"TeXGyreTermes","textAlign":"center"},{"type":"textbox","text":"NORMARLINA BINTI\nHJ MOHD DAUD","left":180,"top":200,"originX":"center","width":320,"fontSize":16,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"“Dengan penuh hormat dan takzim,\nsukacita menjunjung Pengiran berangkat\nmenjemput Pehin / Dato / Datin\n/ Awang / Dayang / Tuan / Puan / Cik\nuntuk bersama - sama memeriahkan majlis\nwalimatulurus puteri kami dan pasangannya”","left":180,"top":310,"originX":"center","width":320,"fontSize":14,"lineHeight":1.6,"textAlign":"center","fill":"#333"},{"type":"textbox","text":"SITI MAYA NADHIRAH BINTI\nSHEIKH SHAMSHRUL HEDRA","left":180,"top":440,"originX":"center","width":320,"fontSize":18,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"&","left":180,"top":500,"originX":"center","fontSize":28,"fontFamily":"TeXGyreTermes","textAlign":"center"},{"type":"textbox","text":"MUHAMMAD NUR ASYRAAF\nBIN AZMAN","left":180,"top":550,"originX":"center","width":320,"fontSize":18,"fontWeight":"bold","textAlign":"center","fill":"#000"}]},{"version":"7.0.0","background":"#ffffff","objects":[{"type":"textbox","text":"Gallery","left":190,"top":60,"originX":"center","fontSize":24,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"rect","left":187,"top":200,"width":300,"height":180,"fill":"#e5e5e5","rx":10,"ry":10,"name":"galleryImage1"},{"type":"rect","left":187,"top":200,"width":300,"height":180,"fill":"#e5e5e5","rx":10,"ry":10,"name":"galleryImage2"}]},{"version":"7.0.0","background":"#ffffff","objects":[{"type":"image","version":"5.3.0","left":320,"top":360,"originX":"center","scaleX":0.3,"scaleY":0.3,"angle":270,"src":"/Paper.png"},{"type":"textbox","text":"Guestbook","left":195,"top":60,"originX":"center","fontSize":24,"fontWeight":"bold","textAlign":"center","fill":"#000"},{"type":"textbox","text":"“Your wishes will appear here...”","left":195,"top":150,"originX":"center","width":300,"fontSize":16,"textAlign":"center","fill":"#333","name":"guestMessage"},{"type":"textbox","text":"- Guest Name","left":195,"top":220,"originX":"center","width":300,"fontSize":14,"fontStyle":"italic","textAlign":"center","fill":"#666","name":"guestSender"},{"type":"textbox","text":"←","left":175,"top":260,"fontSize":24,"textAlign":"center","name":"prevBtn"},{"type":"textbox","text":"→","left":220,"top":260,"fontSize":24,"textAlign":"center","name":"nextBtn"}]}];
const MUSIC_URL: string | null = null;

function CanvasPlayer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [gone, setGone]       = useState(false);
  const [animating, setAnimating] = useState(false);

  // Lock scroll on mount; unlock when envelope is gone
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (gone) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }, [gone]);

  function handleSealClick() {
    if (animating || gone) return;
    setAnimating(true);

    // Start music on seal click
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }

    // After animation flies out (1s), fade the cover then hide it
    setTimeout(() => {
      setTimeout(() => setGone(true), 500);
    }, 1000);
  }

  useEffect(() => {
    if (!rootRef.current) return;
    if (typeof window === "undefined") return;

    const w = 396;
    const h = 704;

    import("fabric").then((mod: any) => {
      const fabric = mod.fabric ?? mod.default ?? mod;
      PROJECT_PAGES.forEach((pageData: any, index: number) => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `width:${w}px;max-width:100%;line-height:0;margin:0 auto;`;
        wrapper.id = "page-" + index;

        const canvasEl = document.createElement("canvas");
        canvasEl.id = "canvas-" + index;
        wrapper.appendChild(canvasEl);
        rootRef.current!.appendChild(wrapper);

        const rc = new fabric.Canvas(canvasEl, {
          selection: false,
          preserveObjectStacking: true,
        });
        rc.setDimensions({ width: w, height: h });
        rc.backgroundColor = "#ffffff";

        if (pageData) {
          rc.loadFromJSON(pageData, () => {
            rc.discardActiveObject();
            rc.forEachObject((obj: any) => {
              obj.set({ selectable: false, hasControls: false, hasBorders: false, evented: true });
              obj.setCoords();
            });
            rc.requestRenderAll();
          });
        }
      });
    });
  }, []);

  return (
    <>

        {!gone && (
          <>
            <style>{`
              .env-cover {
                position: fixed; inset: 0; z-index: 9999;
                background-color: "#f5e8dd";
                overflow: hidden;
                display: flex; flex-direction: column;
                align-items: center; justify-content: flex-start;
                transition: opacity 0.5s ease;
              }
              .env-cover.env-fading { opacity: 0; pointer-events: none; }
              .env-part { transition: transform 1s ease, opacity 1s ease; }
              .env-move-up   { transform: translateY(-110vh) !important; opacity: 0 !important; }
              .env-move-down { transform: translateY(110vh)  !important; opacity: 0 !important; }
            `}</style>

            <div className={`env-cover${animating ? " env-fading" : ""}`}>

              {/* Top texts */}
              <span className={`env-part${animating ? " env-move-up" : ""}`}
                style={{ fontFamily: "serif", fontStyle: "italic", fontSize: 20, color: "#2f2f2f", marginTop: 60, zIndex: 5, position: "relative" }}>
                Undangan
              </span>
              <span className={`env-part${animating ? " env-move-up" : ""}`}
                style={{ fontFamily: "serif", fontStyle: "italic", fontSize: 16, color: "#2f2f2f", marginTop: 6, zIndex: 5, position: "relative" }}>
                Walimatulurus
              </span>

              {/* Logo */}
              <img className={`env-part${animating ? " env-move-up" : ""}`}
                src="/Maya&Asyraaf_Blk.png" alt="logo"
                style={{ width: 180, height: "auto", marginTop: 24, zIndex: 5, position: "relative" }} />

              {/* Press to open */}
              <span className={`env-part${animating ? " env-move-down" : ""}`}
                style={{ fontFamily: "serif", fontStyle: "italic", fontSize: 14, color: "#555", marginTop: 20, zIndex: 5, position: "relative" }}>
                Press to open
              </span>

              {/* Envelope head — overlaps from centre-bottom area */}
              <img className={`env-part${animating ? " env-move-up" : ""}`}
                src="/head.png" alt="envelope head"
                style={{ position: "absolute", bottom: 140, left: "50%", transform: "translateX(-50%)", width: "120%", maxWidth: 475, zIndex: 3, pointerEvents: "none" }} />

              {/* Seal — sits on top of head, clickable */}
              <img className={`env-part${animating ? " env-move-up" : ""}`}
                src="/seal.png" alt="seal"
                onClick={handleSealClick}
                style={{ position: "absolute", bottom: 195, left: "50%", transform: "translateX(-50%)", width: 110, height: 110, cursor: "pointer", zIndex: 4 }} />

              {/* Envelope body — anchored to bottom */}
              <img className={`env-part${animating ? " env-move-down" : ""}`}
                src="/body.png" alt="envelope body"
                style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 396, zIndex: 2, pointerEvents: "none" }} />
            </div>
          </>
        )}

      <div ref={rootRef} style={{ display: "flex", flexDirection: "column", alignItems: "center" }} />
      {MUSIC_URL && (
        <audio
          ref={audioRef}
          src={MUSIC_URL}
          loop
          controls
          style={{ position: "fixed", left: 12, bottom: 80, zIndex: 10 }}
        />
      )}
    </>
  );
}

export default function Page() {
  const contacts = [];
  const moneyGift = null;
  const calendar = null;
  const location = null;
  const rsvpConfig = null;

  return (
    <main>
      <CanvasPlayer />
      <EventFooter
        contacts={contacts}
        moneyGift={moneyGift}
        calendar={calendar}
        location={location}
        rsvpConfig={rsvpConfig}
      />
    </main>
  );
}
