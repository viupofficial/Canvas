"use client";

import React, { useEffect, useRef, useState } from "react";

const CANVAS_WIDTH = 396;
const CANVAS_HEIGHT = 704;

interface PhonePreviewWrapperProps {
  children: React.ReactNode;
  pageCount?: number;
}

export default function PhonePreviewWrapper({
  children,
  pageCount = 1,
}: PhonePreviewWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calculate = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      // Leave room for phone chrome (notch + status bar ~60px, bottom ~24px)
      const availH = clientHeight - 84;
      const availW = clientWidth - 48;
      setScale(Math.min(availW / CANVAS_WIDTH, availH / CANVAS_HEIGHT, 1));
    };

    calculate();
    const ro = new ResizeObserver(calculate);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const phoneH = CANVAS_HEIGHT * pageCount + (pageCount - 1) * 16 + 84;

  return (
    <div
      ref={containerRef}
      className="flex flex-1 items-center justify-center h-full overflow-hidden bg-gray-200"
    >
      {/* Phone shell */}
      <div
        style={{
          width: CANVAS_WIDTH * scale + 32,
          height: phoneH * scale + 32,
          borderRadius: 36 * scale,
          boxShadow:
            "0 0 0 2px #555, 0 0 0 6px #1a1a1a, 0 20px 60px rgba(0,0,0,0.5)",
          background: "#1a1a1a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          overflow: "hidden",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* Notch */}
        <div
          style={{
            width: 90 * scale,
            height: 22 * scale,
            background: "#1a1a1a",
            borderRadius: `0 0 ${14 * scale}px ${14 * scale}px`,
            zIndex: 10,
            flexShrink: 0,
          }}
        />

        {/* Screen area */}
        <div
          style={{
            flex: 1,
            width: "100%",
            background: "#fff",
            overflowY: "auto",
            overflowX: "hidden",
            scrollbarWidth: "none",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {/* Scaled canvas content */}
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top center",
              width: CANVAS_WIDTH,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              paddingBottom: 16,
            }}
          >
            {children}
          </div>
        </div>

        {/* Home indicator */}
        <div
          style={{
            width: 80 * scale,
            height: 4 * scale,
            background: "#555",
            borderRadius: 2 * scale,
            margin: `${8 * scale}px 0`,
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}
