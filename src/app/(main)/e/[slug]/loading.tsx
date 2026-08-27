import PreviewSkeleton from "@/src/components/PreviewSkeleton";
import "../../../globals.css";

// Streamed while page.tsx awaits the event blob. That fetch is uncached
// (force-dynamic + cache: "no-store"), so a guest opening an invitation link
// waits on a network round-trip with nothing on screen; this fills it with the
// invitation taking shape instead of a blank tab.
export default function Loading() {
  return <PreviewSkeleton />;
}
