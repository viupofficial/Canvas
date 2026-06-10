"use client";

import React from "react";
import ProjectEditor from "@/src/components/ProjectEditor";
import "../../globals.css";

// Public teaser route — a standalone "try the editor" experience.
// Exposes every editor page/function but, unlike the regular editor:
//   • the logo does NOT link back to the homepage filing system,
//   • there is no user profile dropdown,
//   • the Share button is replaced by a Login button.
// Runs in ephemeral (no projectId) mode, so nothing is filed against an account.
export default function TeaserPage() {
  return <ProjectEditor teaser />;
}
