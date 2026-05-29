"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Plus, Pencil, Copy, Trash2 } from "lucide-react";
import {
  getProjects,
  createProject,
  duplicateProject,
  deleteProject,
  renameProject,
  type ProjectMeta,
} from "@/src/lib/projectStorage";

function formatEdited(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Edited just now";
  if (min < 60) return `Edited ${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Edited ${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Edited ${day} day${day > 1 ? "s" : ""} ago`;
  return `Edited ${new Date(iso).toLocaleDateString()}`;
}

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [mounted, setMounted] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const refresh = () => setProjects(getProjects());

  useEffect(() => {
    setMounted(true);
    refresh();
  }, []);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuId]);

  const handleCreate = () => {
    const project = createProject();
    router.push(`/editor/${project.id}`);
  };

  const handleOpen = (id: string) => {
    if (renamingId) return;
    router.push(`/editor/${id}`);
  };

  const handleDuplicate = (id: string) => {
    duplicateProject(id);
    setMenuId(null);
    refresh();
  };

  const handleDelete = (id: string, name: string) => {
    setMenuId(null);
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      deleteProject(id);
      refresh();
    }
  };

  const startRename = (p: ProjectMeta) => {
    setMenuId(null);
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const commitRename = () => {
    if (renamingId) {
      renameProject(renamingId, renameValue);
      refresh();
    }
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div className="min-h-screen bg-brand-cream text-brand-dark">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 bg-[#EDE2DE]">
        <div className="flex items-center gap-3">
          <img src="/vi-up-header-logo.svg" alt="Vi-Up" className="h-9 w-9" />
          <span className="text-[22px] font-bold text-[#7D5B59]">Vi-Up Studio</span>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-[#5a2d2d] text-white px-5 py-2.5 rounded-full text-[15px] font-bold hover:opacity-90 transition"
        >
          <Plus size={18} /> Create New Project
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-10">
        <h1 className="text-[20px] font-bold text-[#7D5B59] mb-5">Recent Projects</h1>

        {!mounted ? null : projects.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center text-center py-24 border-2 border-dashed border-[#D9C7C2] rounded-2xl bg-white/40">
            <div className="h-16 w-16 rounded-full bg-[#EDE2DE] flex items-center justify-center mb-4">
              <Plus size={28} className="text-[#7D5B59]" />
            </div>
            <h2 className="text-[18px] font-bold text-[#7D5B59]">No projects yet</h2>
            <p className="text-[14px] text-[#7D5B5999] mt-1 mb-5">
              Create your first design to get started.
            </p>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 bg-[#5a2d2d] text-white px-5 py-2.5 rounded-full text-[15px] font-bold hover:opacity-90 transition"
            >
              <Plus size={18} /> Create New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {/* Create-new card */}
            <button
              onClick={handleCreate}
              className="flex flex-col items-center justify-center gap-2 aspect-[3/4] rounded-2xl border-2 border-dashed border-[#D9C7C2] bg-white/40 text-[#7D5B59] hover:bg-white/70 transition"
            >
              <Plus size={32} />
              <span className="text-[14px] font-semibold">New Project</span>
            </button>

            {projects.map((p) => (
              <div
                key={p.id}
                className="group relative rounded-2xl bg-white border border-[#EDE2DE] overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer"
                onClick={() => handleOpen(p.id)}
              >
                {/* Thumbnail */}
                <div className="aspect-[3/4] bg-[#F7F2F0] flex items-center justify-center overflow-hidden">
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail} alt={p.name} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[#D9C7C2] text-[13px]">No preview</span>
                  )}
                </div>

                {/* Meta */}
                <div className="px-3 py-2.5">
                  {renamingId === p.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameValue("");
                        }
                      }}
                      className="w-full text-[14px] font-semibold text-[#191212] bg-[#F2E8E6] rounded px-2 py-1 outline-none"
                    />
                  ) : (
                    <div className="text-[14px] font-semibold text-[#191212] truncate">{p.name}</div>
                  )}
                  <div className="text-[11px] text-[#7D5B5999] mt-0.5">{formatEdited(p.updatedAt)}</div>
                </div>

                {/* Menu trigger */}
                <button
                  aria-label="Project options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId((cur) => (cur === p.id ? null : p.id));
                  }}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 border border-[#EDE2DE] flex items-center justify-center text-[#7D5B59] opacity-0 group-hover:opacity-100 hover:bg-white transition"
                >
                  <MoreVertical size={16} />
                </button>

                {menuId === p.id && (
                  <div
                    className="absolute top-11 right-2 z-20 min-w-[150px] bg-white border border-neutral-200 rounded-lg shadow-xl py-1 text-sm"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => startRename(p)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 text-neutral-700"
                    >
                      <Pencil size={14} className="text-neutral-500" /> Rename
                    </button>
                    <button
                      onClick={() => handleDuplicate(p.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 text-neutral-700"
                    >
                      <Copy size={14} className="text-neutral-500" /> Duplicate
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-red-50 text-red-600"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
