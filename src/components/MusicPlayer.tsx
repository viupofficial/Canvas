"use client";

import { useEffect, useMemo, useRef } from "react";
import { parseYouTubeId, youTubeEmbedUrl } from "@/src/lib/music";

// Plays background music from either an uploaded audio file or a YouTube link.
// `start` gates audible playback so callers can begin only after a user gesture
// (e.g. the envelope seal click) — browsers block audible autoplay otherwise.
export default function MusicPlayer({
  url,
  start = true,
  visible = false,
  className = "",
  style,
}: {
  url?: string | null;
  start?: boolean;
  // For the <audio> branch: show native controls (YouTube is always shown,
  // since it can't be controlled programmatically without the IFrame API).
  visible?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const ytId = useMemo(() => parseYouTubeId(url), [url]);

  // Drive the <audio> element so playback follows `start` (the envelope flow
  // flips this to true on the seal click).
  useEffect(() => {
    if (ytId) return;
    const a = audioRef.current;
    if (!a || !url) return;
    if (start) a.play().catch(() => {});
    else a.pause();
  }, [ytId, url, start]);

  if (!url) return null;

  if (ytId) {
    return (
      <iframe
        src={youTubeEmbedUrl(ytId, { autoplay: start })}
        title="Background music"
        allow="autoplay; encrypted-media"
        className={className}
        style={{ border: 0, width: 220, height: 124, ...style }}
      />
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
