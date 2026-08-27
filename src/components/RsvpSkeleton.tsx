"use client";

import React from "react";

// Loading skeleton for the RSVP canvas, traced off skeleton_rsvp.png.
//
// Deliberately NOT the 900 KB PNG: the skeleton is the thing that covers the
// wait, so it cannot itself be a network round-trip. Everything in that mock is
// two flat colours and rounded shapes, so it costs ~2 KB inline and — unlike a
// flattened raster — it scales to any viewport and can animate.
//
// Coordinates are the RsvpPlayer stage (396×704), converted from the source PNG
// at 1560/396 = 3.939 px per stage unit, so the skeleton lands where the real
// invitation elements do. Measured values, not eyeballed:
//   paper #ECE2D1 · flap #EDE3D3 · placeholder #C9BCAA · fold edge #CAC1B4
export const RSVP_SKELETON_PAPER = "#ECE2D1";

const PLACEHOLDER = "#C9BCAA";
const FLAP = "#EDE3D3";
const FOLD_EDGE = "#CAC1B4";

// Fold: least-squares fit of the crisp edge on each arm gives symmetric slopes
// (+0.5692 / -0.5691), so the V is drawn symmetric about the stage centre.
// Both the fold and the flap are drawn 40 units past each side of the viewBox
// (y = 323.5 - 40 x 0.5692 = 300.7 there), then clipped back to it. Without the
// overhang the flap's drop shadow paints a vertical seam down the artwork's
// edges; the clip is what actually removes it, because "meet" clips at the
// element box, not at the viewBox, so the overhang would otherwise spill into
// the letterbox margins on a wide viewport.
const FOLD = "M-40 300.7 L198 436.2 L436 300.7";
const FLAP_SHAPE = "M-40 -40 H436 V300.7 L198 436.2 L-40 300.7 Z";

// The wax seal, isolated by a morphological open (radius 7, which removes the
// fold line without eating the blob), then sampled at 36 radial steps around
// (198.02, 421.2) and rebuilt as a
// closed Catmull-Rom spline, so its wobble is the mock's wobble.
const SEAL =
  "M251.65 421.2C251.57 424.23,250.83 427.52,249.4 430.25C247.96 432.99,244.79 435.15,243.05 437.58C241.31 440.01,240.32 442.41,238.97 444.84C237.62 447.26,236.4 449.73,234.92 452.16C233.44 454.59,232.01 457.24,230.09 459.41C228.17 461.57,225.84 463.53,223.41 465.16C220.98 466.8,218.24 468.1,215.5 469.2C212.75 470.3,209.85 471.3,206.94 471.76C204.03 472.22,200.99 472.01,198.02 471.97C195.06 471.92,191.97 472.24,189.15 471.51C186.34 470.78,183.45 469.41,181.14 467.59C178.83 465.77,177.14 462.76,175.27 460.6C173.41 458.44,172.18 456.17,169.96 454.64C167.74 453.12,164.7 452.75,161.95 451.46C159.2 450.18,155.92 448.89,153.45 446.93C150.99 444.97,148.55 442.44,147.16 439.71C145.76 436.98,145.05 433.62,145.09 430.53C145.13 427.44,146.96 424.23,147.38 421.2C147.81 418.16,147.27 415.25,147.65 412.31C148.03 409.38,148.6 406.35,149.66 403.59C150.72 400.84,152.31 398.19,154 395.78C155.69 393.37,157.61 391.01,159.81 389.13C162.02 387.25,164.81 385.99,167.23 384.49C169.64 382.99,171.91 381.5,174.32 380.14C176.73 378.78,179.17 377.53,181.7 376.35C184.24 375.17,186.82 373.97,189.54 373.07C192.26 372.18,195.13 371.38,198.02 371C200.92 370.61,203.98 370.45,206.92 370.76C209.85 371.07,212.99 371.56,215.63 372.83C218.27 374.1,220.4 376.61,222.74 378.38C225.09 380.16,227.51 381.61,229.68 383.47C231.85 385.33,234.04 387.29,235.75 389.54C237.46 391.79,238.37 394.57,239.96 396.99C241.54 399.4,243.6 401.49,245.26 404.01C246.91 406.52,248.83 409.18,249.9 412.05C250.96 414.91,251.73 418.16,251.65 421.2Z";

// x / y / w / h in stage units; every bar is a full pill (rx = h/2).
const BARS: ReadonlyArray<[number, number, number, number]> = [
  [132, 110.68, 132, 17.26],
  [14.22, 156.37, 367.57, 34.52],
  [165.51, 212.22, 64.98, 21.32],
  // The source PNG has this one 2.5 units right of centre; every other bar is
  // centred, so that reads as an export nudge rather than intent.
  [81.74, 256.89, 232.52, 29.45],
  [132, 495.51, 132, 17.26],
];

export default function RsvpSkeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  // The <svg> is absolutely positioned rather than sized by the flex parent.
  // An <svg> with a viewBox has an intrinsic aspect ratio, and on a wide
  // viewport that ratio wins over `flex: 1`: the element grows to
  // width x (width * 704/396) and overflows, so the artwork renders as a huge
  // top crop instead of letterboxing. inset-0 pins the box to the wrapper.
  //
  // That geometry is set INLINE, not only through the utility classes. This
  // component renders at the earliest moment a route has anything to show (a
  // Suspense fallback, the editor's pre-init overlay), which can land before
  // the stylesheet does — and with the classes still inert the svg snaps to its
  // intrinsic ratio and flashes across the page many times too large. Inline
  // styles hold the box no matter when the CSS arrives. Only the animation
  // needs the stylesheet, and it is fine for that to start a frame late.
  return (
    <div
      className={`relative h-full w-full ${className}`}
      // Fills its container inline too. Sizing the wrapper through a utility
      // class alone collapses it to height 0 until the stylesheet lands, and
      // the svg's height:100% then resolves against zero — the skeleton is in
      // the DOM but invisible for exactly the window it exists to cover.
      style={{ position: "relative", width: "100%", height: "100%", ...style }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        viewBox="0 0 396 704"
        // "meet" letterboxes, but the artwork's paper is the same cream the
        // host paints, so the margins are invisible and nothing distorts.
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Loading invitation"
      >
        <defs>
          <filter id="rsvpSkeletonFold" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dy="2.6" stdDeviation="1.9" floodColor="#9C8B72" floodOpacity="0.34" />
          </filter>
          <linearGradient id="rsvpSkeletonSheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <clipPath id="rsvpSkeletonClip">
            <rect x="0" y="0" width="396" height="704" />
          </clipPath>
        </defs>

        <g clipPath="url(#rsvpSkeletonClip)">
          <rect x="0" y="0" width="396" height="704" fill={RSVP_SKELETON_PAPER} />

          {/* Envelope flap: everything above the V, casting a shadow onto the paper. */}
          <path d={FLAP_SHAPE} fill={FLAP} filter="url(#rsvpSkeletonFold)" />
          <path d={FOLD} fill="none" stroke={FOLD_EDGE} strokeWidth="1.3" strokeLinejoin="round" />

          <g className="rsvp-skeleton-breathe">
            {BARS.map(([x, y, w, h]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={h / 2} fill={PLACEHOLDER} />
            ))}
            <path d={SEAL} fill={PLACEHOLDER} />
          </g>

          <rect
            className="rsvp-skeleton-sheen"
            x="0"
            y="-282"
            width="396"
            height="282"
            fill="url(#rsvpSkeletonSheen)"
          />
        </g>
      </svg>
    </div>
  );
}
