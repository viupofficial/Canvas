"use client";

import { useParams } from "next/navigation";
import ProjectEditor from "@/src/components/ProjectEditor";

export default function EditorProjectPage() {
  const params = useParams();
  const raw = params?.projectId;
  const projectId = Array.isArray(raw) ? raw[0] : raw;
  return <ProjectEditor projectId={projectId} />;
}
