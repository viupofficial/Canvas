"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Plus, Pencil, Copy, Trash2 } from "lucide-react";
import type { CanvasUser } from "@/src/lib/userSession";
import UserMenu from "@/src/components/UserMenu";
import {
  getDesigns,
  getDesign,
  createDesign,
  createProjectEvent,
  updateDesign,
  deleteDesign,
  deleteProjectEvent,
  extractDesigns,
  extractDesign,
  num,
  type ViupDesign,
} from "@/src/lib/viupApi";

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

// Full designer dashboard: gallery of designs + create/rename/duplicate/delete.
// Reused by the "/" landing (legacy localStorage session) and the guarded
// "/designer" route (validated via PHP). The `user` is always provided by the
// caller after it has been verified — this component does NOT do role checks.
export default function DesignerDashboard({ user }: { user: CanvasUser }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ViupDesign[]>([]);
  const [mounted, setMounted] = useState(false);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState("");
  const userRef = useRef<CanvasUser>(user);
  userRef.current = user;

  const refresh = async () => {
    try {
      // Dashboard lists ALL of the designer's designs (no event filter).
      const data = await getDesigns(userRef.current.id);
      setProjects(extractDesigns(data));
    } catch (e) {
      console.error("[dashboard] failed to load designs", e);
    }
  };

  useEffect(() => {
    setMounted(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuId]);

  // "Create New Project" — creates a REAL event in PHP (events row + user_event
  // slug + designs row tied to the event), then opens the new event canvas.
  // Designer-only: the route already gates role 3, but we re-check defensively.
  const handleCreateNewProject = async () => {
    const u = userRef.current;
    if (!u?.id) {
      setCreateError("Missing user information.");
      return;
    }
    if (Number(u.is_admin) !== 3) {
      setCreateError("Designer access only.");
      return;
    }

    try {
      setCreatingProject(true);
      setCreateError("");

      const data = await createProjectEvent({
        userId: u.id,
        title: "Untitled",
        templateId: null,
        hasSeating: 0,
      });

      if (!data.success || !data.canvas_url) {
        throw new Error(data.message || "Failed to create project.");
      }

      // PHP returns the full canvas_url (canvas.vi-up.com/designer/e/{slug}?…).
      window.location.href = data.canvas_url;
    } catch (err) {
      console.error("[dashboard] failed to create project", err);
      setCreateError((err as Error)?.message || "Failed to create project.");
      setCreatingProject(false);
    }
    // On success we navigate away, so we intentionally leave creatingProject
    // true to keep the button disabled until the redirect completes.
  };

  const handleOpen = (p: ViupDesign) => {
    if (renamingId) return;
    // Event-bound designs must open through the event route so the canvas gets
    // user_id + event_id (required for autosave, guestbook and RSVP). The [slug]
    // is cosmetic — we use event_id, matching the My Event "Canvas" link. Free
    // designs with no event fall back to the legacy project-id route.
    const eventId = num(p.event_id);
    if (eventId != null) {
      router.push(
        `/designer/e/${eventId}?user_id=${userRef.current.id}&event_id=${eventId}&design_id=${p.id}`,
      );
    } else {
      router.push(`/designer/${p.id}`);
    }
  };

  const handleDuplicate = async (id: number) => {
    setMenuId(null);
    try {
      const source = extractDesign(await getDesign(userRef.current.id, id));
      await createDesign({
        user_id: num(userRef.current.id),
        name: `${source?.name || "Untitled Design"} Copy`,
        json_data: source?.json_data ?? {},
      });
      refresh();
    } catch (e) {
      console.error("[dashboard] failed to duplicate design", e);
    }
  };

  const handleDelete = async (p: ViupDesign) => {
    setMenuId(null);
    // Event-bound designs must be deleted through the shared PHP endpoint so the
    // whole project (event, design, rsvp, guestbook, slug, files) goes — and the
    // MyEvent card disappears too. Free designs use the design-only endpoint.
    const eventId = num(p.event_id);
    const isEventBound = eventId != null;
    const ok = window.confirm(
      isEventBound
        ? `Delete "${p.name}"? This will remove the event, canvas design, RSVP, guestbook, and exported files. This cannot be undone.`
        : `Delete "${p.name}"? This cannot be undone.`,
    );
    if (!ok) return;

    try {
      if (isEventBound) {
        await deleteProjectEvent({
          userId: userRef.current.id,
          eventId,
          designId: p.id,
        });
      } else {
        await deleteDesign({ design_id: num(p.id), user_id: num(userRef.current.id) });
      }
      // Optimistically drop the card, then refetch to stay in sync with PHP.
      setProjects((prev) => prev.filter((item) => item.id !== p.id));
    } catch (e) {
      console.error("[dashboard] failed to delete project", e);
      alert((e as Error)?.message || "Failed to delete project.");
    }
    refresh();
  };

  const startRename = (p: ViupDesign) => {
    setMenuId(null);
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const commitRename = async () => {
    if (renamingId) {
      try {
        await updateDesign({
          design_id: num(renamingId),
          user_id: num(userRef.current.id),
          name: renameValue.trim() || "Untitled Design",
        });
      } catch (e) {
        console.error("[dashboard] failed to rename design", e);
      }
      refresh();
    }
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div className="min-h-screen bg-brand-cream text-brand-dark">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 bg-[#EDE2DE] h-[111px]">
        <div className="flex items-center justify-start pl-[106px]">
          <a href="/" className="flex items-center justify-center gap-4 my-9 mr-[20px] ">
            <img src="/Vi-Up Submark.png" alt="Vi-Up" className="h-[30px] w-[30px]" />
          </a>
        </div>
        <div className="flex items-center gap-5 mr-[90px]">
          <button
            onClick={handleCreateNewProject}
            disabled={creatingProject}
            className="flex items-center gap-2 bg-[#5a2d2d] text-white px-5 py-2.5 rounded-full text-[15px] font-bold hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Plus size={18} /> {creatingProject ? "Creating…" : "Create New Project"}
          </button>
          <UserMenu />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-10">
        {createError && (
          <div
            role="alert"
            className="mb-5 rounded-lg bg-[#FDECEC] border border-[#F3B6B6] px-4 py-2.5 text-[13px] font-semibold text-[#B23B3B]"
          >
            {createError}
          </div>
        )}

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
              onClick={handleCreateNewProject}
              disabled={creatingProject}
              className="flex items-center  gap-2 bg-[#5a2d2d] text-white px-5 py-2.5 rounded-full text-[15px] font-bold hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus size={18} /> {creatingProject ? "Creating…" : "Create New Project"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {/* Create-new card */}
            <button
              onClick={handleCreateNewProject}
              disabled={creatingProject}
              className="flex flex-col items-center justify-center gap-2 aspect-[3/4] rounded-2xl border-2 border-dashed border-[#D9C7C2] bg-white/40 text-[#7D5B59] hover:bg-white/70 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus size={32} />
              <span className="text-[14px] font-semibold">{creatingProject ? "Creating…" : "New Project"}</span>
            </button>

            {projects.map((p) => (
              <div
                key={p.id}
                className="group relative rounded-2xl bg-white border border-[#EDE2DE] overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer"
                onClick={() => handleOpen(p)}
              >
                {/* Thumbnail */}
                <div className="aspect-[3/4] bg-[#F7F2F0] flex items-center justify-center overflow-hidden">
                  {p.preview_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.preview_url} alt={p.name} className="w-full h-full object-contain" />
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
                  <div className="text-[11px] text-[#7D5B5999] mt-0.5">
                    {formatEdited(p.last_modified || p.updated_at || p.created_at || "")}
                  </div>
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
                      onClick={() => handleDelete(p)}
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
