"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DesignerDashboard from "@/src/components/DesignerDashboard";
import { LoadingState, ErrorState } from "@/src/components/canvas-states";
import { setCanvasUser, getCanvasUser, type CanvasUser } from "@/src/lib/userSession";
import { getUser, canAccessDesigner } from "@/src/lib/viupApi";

// Route guard for the full designer dashboard at /designer.
//   /designer?user_id=123
// Requires user_id, validates role 3 (designer) via PHP, then renders the
// dashboard. Editors (role 2) and everyone else are blocked here — they must
// open a specific event from My Event instead.
export default function DesignerGuard() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("user_id");

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<{ title: string; message: string }>({ title: "", message: "" });
  const [user, setUser] = useState<CanvasUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fail = (title: string, message: string) => {
      if (cancelled) return;
      setError({ title, message });
      setStatus("error");
    };

    async function run() {
      // Fall back to a cached session when the URL omits user_id (e.g. the logo
      // link back to the dashboard from within the editor).
      const cached = getCanvasUser();
      const effectiveId = userId || (cached ? String(cached.id) : null);

      if (!effectiveId) {
        return fail(
          "Missing designer information.",
          "Open the canvas from your designer account on vi-up.com.",
        );
      }

      try {
        const data = await getUser(effectiveId);
        if (cancelled) return;

        if (!data.success || !data.user) {
          return fail("Designer access only.", data.message || "We could not verify your account.");
        }
        if (!canAccessDesigner(data.user)) {
          return fail(
            "Designer access only.",
            "This dashboard is for designers. Editors must open a specific event from My Event.",
          );
        }

        setCanvasUser(data.user);
        setUser(data.user);
        setStatus("ready");
      } catch (e) {
        console.error("[DesignerGuard] failed", e);
        fail("Designer access only.", (e as Error)?.message || "Something went wrong.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (status === "loading") return <LoadingState label="Loading your dashboard…" />;

  if (status === "error" || !user) {
    return (
      <ErrorState
        title={error.title || "Designer access only."}
        message={error.message}
        actionHref="https://vi-up.com/login"
        actionLabel="Back to login"
      />
    );
  }

  return <DesignerDashboard user={user} />;
}
