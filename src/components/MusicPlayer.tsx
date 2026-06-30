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
  useEffect(() => {
    if (ytId) return;
    const a = audioRef.current;
    if (!a || !url) return;
    if (start) a.play().catch(() => {});
    else a.pause();
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
      controls
      className={className}
      style={{ ...(visible ? {} : { opacity: 0, pointerEvents: "none" }), ...style }}
    />
  );
}
