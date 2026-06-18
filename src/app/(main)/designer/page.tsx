"use client";

import React from "react";
import ProjectEditor from "@/src/components/ProjectEditor";
import "../../globals.css";

// Legacy /designer route (no project id) — opens the editor in ephemeral mode,
// using the original localStorage save behaviour. New project files live at
// /designer/[projectId] and are managed from the dashboard.
export default function Page() {
  return <ProjectEditor />;
}
