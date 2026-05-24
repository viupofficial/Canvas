import { useEffect, useRef } from "react";

export default function MusicPlayer({ url }: { url?: string }) {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (url && audioRef.current) {
            audioRef.current.src = url;
        }
    }, [url]);

    if (!url) return null;

    return (
        <audio
            ref={audioRef}
            autoPlay
            loop
            controls
            className="hidden"
        />
    );
}