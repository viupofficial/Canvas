"use client";

import React from "react";
import { Settings, Wrench, Sparkles } from "lucide-react";
import "../../globals.css";

// Public "coming soon" / maintenance page.
// Friendly holding screen for features that aren't live yet.
export default function ComingSoonPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-cream text-[#7D5B59] flex items-center justify-center px-6">
      {/* Soft floating decorative blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#EDE2DE] opacity-60 blur-3xl cs-float-slow" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-[#E7D3CD] opacity-50 blur-3xl cs-float-slower" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl">
        {/* Logo */}
        <img
          src="/Vi-Up Submark.png"
          alt="Vi-Up"
          className="h-[56px] w-[56px] mb-8 cs-bob"
        />

        {/* Animated maintenance gears */}
        <div className="relative mb-10 h-[150px] w-[150px]">
          {/* Big gear */}
          <Settings
            className="absolute left-1/2 top-1/2 h-[110px] w-[110px] -translate-x-1/2 -translate-y-1/2 text-[#5a2d2d] cs-spin"
            strokeWidth={1.25}
          />
          {/* Small gear, counter-rotating */}
          <Settings
            className="absolute right-1 top-2 h-[60px] w-[60px] text-[#B98E86] cs-spin-reverse"
            strokeWidth={1.5}
          />
          {/* Wrench accent */}
          <div className="absolute -left-2 bottom-0 cs-swing origin-top">
            <Wrench className="h-[40px] w-[40px] text-[#7D5B59]" strokeWidth={1.5} />
          </div>
        </div>

        {/* Badge */}
        <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-[13px] font-bold uppercase tracking-wide text-[#5a2d2d] shadow-sm">
          <Sparkles className="h-4 w-4" />
          Under Construction
        </span>

        {/* Headline */}
        <h1 className="text-[34px] sm:text-[44px] font-bold leading-tight text-[#5a2d2d]">
          New features are coming soon
        </h1>

        {/* Message */}
        <p className="mt-4 text-[16px] sm:text-[18px] text-[#7D5B59]/80 max-w-md">
          We&apos;re crafting something special for you. Please be patient and
          continue the journey with{" "}
          <span className="font-bold text-[#5a2d2d]">Vi-Up</span>. 💍
        </p>

        {/* Animated progress shimmer bar */}
        <div className="mt-9 h-2 w-64 overflow-hidden rounded-full bg-[#EDE2DE]">
          <div className="h-full w-1/3 rounded-full bg-[#5a2d2d] cs-progress" />
        </div>

        {/* Back to editor */}
        <a
          href="/teaser"
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-[#5a2d2d] px-7 py-3 text-[16px] font-bold text-white shadow transition hover:opacity-90"
        >
          Back to the editor
        </a>
      </div>

      {/* Scoped animations */}
      <style jsx>{`
        .cs-spin {
          animation: cs-spin 9s linear infinite;
        }
        .cs-spin-reverse {
          animation: cs-spin-plain 6s linear infinite reverse;
        }
        .cs-swing {
          animation: cs-swing 2.4s ease-in-out infinite;
        }
        .cs-bob {
          animation: cs-bob 3s ease-in-out infinite;
        }
        .cs-float-slow {
          animation: cs-bob 7s ease-in-out infinite;
        }
        .cs-float-slower {
          animation: cs-bob 9s ease-in-out infinite;
        }
        .cs-progress {
          animation: cs-progress 2.2s ease-in-out infinite;
        }
        @keyframes cs-spin {
          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }
        .cs-spin-reverse {
          /* small gear isn't centered, so override the transform origin path */
          animation-name: cs-spin-plain;
        }
        @keyframes cs-spin-plain {
          to {
            transform: rotate(-360deg);
          }
        }
        @keyframes cs-swing {
          0%,
          100% {
            transform: rotate(-12deg);
          }
          50% {
            transform: rotate(12deg);
          }
        }
        @keyframes cs-bob {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        @keyframes cs-progress {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(320%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .cs-spin,
          .cs-spin-reverse,
          .cs-swing,
          .cs-bob,
          .cs-float-slow,
          .cs-float-slower,
          .cs-progress {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
