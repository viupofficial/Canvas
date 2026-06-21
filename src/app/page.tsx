"use client";

import React, { useEffect, useState } from "react";
import { getCanvasUser, type CanvasUser } from "@/src/lib/userSession";
import DesignerDashboard from "@/src/components/DesignerDashboard";
import { LoadingState } from "@/src/components/canvas-states";

// Legacy landing ("/"): reads the session stored by the /[userId] login-landing
// route (localStorage viup_canvas_user) and shows the designer dashboard. New
// entrypoints use /designer?user_id=... which validates the role via PHP first;
// this route is kept for backward compatibility.
export default function HomePage() {
  const [user, setUser] = useState<CanvasUser | null | undefined>(undefined);

  useEffect(() => {
    const u = getCanvasUser();
    if (!u) {
      window.location.href = "https://vi-up.com/login";
      return;
    }
    setUser(u);
  }, []);

  if (!user) return <LoadingState label="Loading your projects…" />;
  return <DesignerDashboard user={user} />;
}
