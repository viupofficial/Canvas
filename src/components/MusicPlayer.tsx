"use client";

import { useEffect, useMemo, useRef } from "react";
import { parseYouTubeId } from "@/src/lib/music";

// Load the YouTube IFrame Player API once and share it across all players.
let ytApiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

// Plays background music from either an uploaded audio file or a YouTube link.
// `start` gates audible playback so callers can begin only after a user gesture
// (e.g. the envelope seal click, or the sidebar play button) — browsers block
// audible autoplay otherwise.
//
// YouTube is played AUDIO-ONLY: the player is mounted off-screen and driven via
// the IFrame API, so the video itself is never shown — only the sound plays.
export default function MusicPlayer({
  url,
  start = true,
  visible = false,
  className = "",
  style,
}: {
  url?: string | null;
  start?: boolean;
  // For the <audio> branch: show native controls. (YouTube is always hidden.)
  visible?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const startRef = useRef(start);
  startRef.current = start;
  const ytId = useMemo(() => parseYouTubeId(url), [url]);

  // <audio> branch: follow `start` (the envelope flow / sidebar button flips it).
  //
  // There are no visible controls, so a rejected play() would leave the invite
  // silent with no way for the guest to recover — retry on the first gesture
  // anywhere on the page (browsers unlock audio from any user interaction).
  useEffect(() => {
    if (ytId) return;
    const a = audioRef.current;
    if (!a || !url) return;
    if (!start) {
      a.pause();
      return;
    }

    let cleanup: (() => void) | undefined;
    a.play().catch(() => {
      const retry = () => {
        if (!startRef.current) return;
        audioRef.current?.play().catch(() => {});
      };
      const events = ["pointerdown", "touchstart", "keydown", "click"] as const;
      events.forEach((e) =>
        document.addEventListener(e, retry, { once: true, passive: true })
      );
      cleanup = () =>
        events.forEach((e) => document.removeEventListener(e, retry));
    });
    return () => cleanup?.();
  }, [ytId, url, start]);

  // YouTube branch: build a hidden player once per video id.
  useEffect(() => {
    if (!ytId) return;
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !YT || !ytHostRef.current) return;
      ytPlayerRef.current = new YT.Player(ytHostRef.current, {
        width: 200,
        height: 120,
        videoId: ytId,
        playerVars: {
          autoplay: startRef.current ? 1 : 0,
          loop: 1,
          playlist: ytId, // loop=1 needs playlist set to the same id
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (e: any) => {
            if (startRef.current) e.target.playVideo();
            else e.target.pauseVideo();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        ytPlayerRef.current?.destroy?.();
      } catch {}
      ytPlayerRef.current = null;
    };
  }, [ytId]);

  // Drive play/pause on an existing YouTube player when `start` changes.
  useEffect(() => {
    if (!ytId) return;
    const p = ytPlayerRef.current;
    if (!p || typeof p.playVideo !== "function") return;
    if (start) p.playVideo();
    else p.pauseVideo();
  }, [ytId, start]);

  // Mobile browsers pause audio when the tab is backgrounded — e.g. tapping the
  // Waze / Google Maps buttons opens the app over the invite — and do NOT resume
  // it when the guest returns. Re-assert playback whenever the page becomes
  // visible again, but only if `start` still says the music should be playing.
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== "visible" || !startRef.current) return;
      if (ytId) {
        const p = ytPlayerRef.current;
        if (p && typeof p.playVideo === "function") p.playVideo();
      } else {
        audioRef.current?.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [ytId]);

  if (!url) return null;

  if (ytId) {
    // Mounted but parked off-screen: audio keeps playing, video is never seen.
    return (
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: -9999,
          top: 0,
          width: 200,
          height: 120,
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        <div ref={ytHostRef} />
      </div>
    );
  }

  return (
    <audio
      ref={audioRef}
      src={url}
      autoPlay={start}
      loop
      // Native controls ONLY when a caller explicitly opts in. Without this the
      // browser paints its media bar over the invitation (see the footer nav on
      // /preview-local and /e/[slug]) — background music must stay invisible.
      controls={visible}
      aria-hidden={visible ? undefined : true}
      tabIndex={visible ? undefined : -1}
      className={className}
      style={{
        // Zero-footprint hiding: `display:none` can stop playback in some
        // browsers, so park it instead. Keep it out of layout entirely so no
        // stray gap appears where the control bar used to be.
        ...(visible
          ? {}
          : {
              position: "absolute",
              width: 0,
              height: 0,
              opacity: 0,
              pointerEvents: "none",
            }),
        ...style,
      }}
    />
  );
}
