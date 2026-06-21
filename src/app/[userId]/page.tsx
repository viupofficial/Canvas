"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { setCanvasUser } from "@/src/lib/userSession";
import { getUser, canAccessDesigner } from "@/src/lib/viupApi";
import { LoadingState, ErrorState } from "@/src/components/canvas-states";

// Backward-compatible login landing: vi-up.com used to redirect here as
// /<userId> (e.g. https://canvas.vi-up.com/144). The canvas is now split by
// role, so this route only routes designers onward and tells editors/customers
// to use the proper entrypoint:
//   - is_admin === 3 (designer) → /designer?user_id={userId}
//   - is_admin === 2 (editor)   → must open a specific event from My Event
//   - otherwise                 → blocked
export default function CanvasUserPage() {
  const params = useParams();
  const router = useRouter();
  const raw = params?.userId;
  const userId = Array.isArray(raw) ? raw[0] : raw;

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "redirecting" }
    | { kind: "error"; title: string; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function loadUser() {
      try {
        const data = await getUser(userId as string);
        if (cancelled) return;

        if (!data.success || !data.user) {
          setState({
            kind: "error",
            title: "User not found",
            message: data.message || "Please log in again.",
          });
          return;
        }

        const role = Number(data.user.is_admin);

        if (canAccessDesigner(data.user)) {
          // Designer → hand off to the full dashboard.
          setCanvasUser(data.user);
          setState({ kind: "redirecting" });
          router.replace(`/designer?user_id=${data.user.id}`);
          return;
        }

        if (role === 2) {
          setState({
            kind: "error",
            title: "Open your event from My Event",
            message: "Editors must open a specific event from the My Event page on vi-up.com.",
          });
          return;
        }

        setState({
          kind: "error",
          title: "You do not have access to the canvas",
          message: "This area is reserved for designers and assigned editors.",
        });
      } catch (err) {
        console.error("Failed to fetch user:", err);
        if (!cancelled) {
          setState({
            kind: "error",
            title: "Could not reach the server",
            message: "Please try again in a moment.",
          });
        }
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  if (state.kind === "error") {
    return (
      <ErrorState
        title={state.title}
        message={state.message}
        actionHref="https://vi-up.com/MyEvent"
        actionLabel="Go to My Event"
      />
    );
  }

  return <LoadingState label="Loading your account…" />;
}
