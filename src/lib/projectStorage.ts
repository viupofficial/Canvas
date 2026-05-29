// Browser-storage project filing system (v1, pre-database).
//
// Storage layout (localStorage):
//   viup_projects_index        -> ProjectMeta[]  (lightweight list for the dashboard)
//   viup_project_{projectId}   -> ProjectData    (full canvas JSON for one project)
//
// The index is kept small (no canvas JSON) so the dashboard loads fast and we
// don't rewrite every project on each save. Swap these functions for real DB
// calls later without touching the UI.

export type ProjectMeta = {
  id: string;
  name: string;
  thumbnail: string; // small dataURL, may be ""
  createdAt: string;
  updatedAt: string;
};

export type ProjectData = {
  id: string;
  name: string;
  canvasJson: any; // editor payload: { pages, currentPage, musicUrl, eventName }
  createdAt: string;
  updatedAt: string;
};

const INDEX_KEY = "viup_projects_index";
const projectKey = (id: string) => `viup_project_${id}`;
const DEFAULT_NAME = "Untitled Design";

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

function readIndex(): ProjectMeta[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(list: ProjectMeta[]) {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("[projectStorage] failed to write index", e);
  }
}

function upsertIndex(meta: ProjectMeta) {
  const list = readIndex();
  const i = list.findIndex((p) => p.id === meta.id);
  if (i >= 0) list[i] = meta;
  else list.push(meta);
  writeIndex(list);
}

export function generateProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Dashboard list, most-recently-updated first.
export function getProjects(): ProjectMeta[] {
  return readIndex().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

// Create a blank project, persist its metadata + full data, return the full data.
export function createProject(name: string = DEFAULT_NAME, id?: string): ProjectData {
  const now = new Date().toISOString();
  const project: ProjectData = {
    id: id ?? generateProjectId(),
    name,
    canvasJson: null,
    createdAt: now,
    updatedAt: now,
  };
  if (hasStorage()) {
    try {
      localStorage.setItem(projectKey(project.id), JSON.stringify(project));
    } catch (e) {
      console.error("[projectStorage] failed to create project", e);
    }
  }
  upsertIndex({ id: project.id, name: project.name, thumbnail: "", createdAt: now, updatedAt: now });
  return project;
}

export function getProject(id: string): ProjectData | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(projectKey(id));
    return raw ? (JSON.parse(raw) as ProjectData) : null;
  } catch {
    return null;
  }
}

// Make sure a project exists for an id (covers direct URL navigation). Returns it.
export function ensureProject(id: string, name: string = DEFAULT_NAME): ProjectData {
  return getProject(id) ?? createProject(name, id);
}

// Persist canvas JSON (+ optional thumbnail/name) for a project, bumping updatedAt
// and syncing the index entry.
export function saveProject(
  id: string,
  data: { canvasJson: any; thumbnail?: string; name?: string },
): ProjectData {
  const existing = getProject(id);
  const now = new Date().toISOString();
  const full: ProjectData = {
    id,
    name: data.name ?? existing?.name ?? DEFAULT_NAME,
    canvasJson: data.canvasJson,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (hasStorage()) {
    try {
      localStorage.setItem(projectKey(id), JSON.stringify(full));
    } catch (e) {
      console.error("[projectStorage] failed to save project", e);
    }
  }
  const indexEntry = readIndex().find((p) => p.id === id);
  upsertIndex({
    id,
    name: full.name,
    thumbnail: data.thumbnail ?? indexEntry?.thumbnail ?? "",
    createdAt: full.createdAt,
    updatedAt: now,
  });
  return full;
}

// Patch arbitrary metadata fields (name / thumbnail) and bump updatedAt.
export function updateProjectMetadata(id: string, updates: Partial<Pick<ProjectMeta, "name" | "thumbnail">>) {
  const full = getProject(id);
  const now = new Date().toISOString();
  if (full) {
    const nextFull: ProjectData = { ...full, ...updates, updatedAt: now };
    if (hasStorage()) {
      try {
        localStorage.setItem(projectKey(id), JSON.stringify(nextFull));
      } catch (e) {
        console.error("[projectStorage] failed to update project", e);
      }
    }
  }
  const list = readIndex();
  const i = list.findIndex((p) => p.id === id);
  if (i >= 0) {
    list[i] = { ...list[i], ...updates, updatedAt: now };
    writeIndex(list);
  }
}

export function renameProject(id: string, newName: string) {
  const name = newName.trim() || DEFAULT_NAME;
  updateProjectMetadata(id, { name });
}

// Copy a project (new id, new "{name} Copy", same canvas + thumbnail).
export function duplicateProject(id: string): ProjectData | null {
  const source = getProject(id);
  const sourceMeta = readIndex().find((p) => p.id === id);
  if (!source && !sourceMeta) return null;

  const now = new Date().toISOString();
  const newId = generateProjectId();
  const baseName = source?.name ?? sourceMeta?.name ?? DEFAULT_NAME;
  const copy: ProjectData = {
    id: newId,
    name: `${baseName} Copy`,
    canvasJson: source?.canvasJson ?? null,
    createdAt: now,
    updatedAt: now,
  };
  if (hasStorage()) {
    try {
      localStorage.setItem(projectKey(newId), JSON.stringify(copy));
    } catch (e) {
      console.error("[projectStorage] failed to duplicate project", e);
    }
  }
  upsertIndex({
    id: newId,
    name: copy.name,
    thumbnail: sourceMeta?.thumbnail ?? "",
    createdAt: now,
    updatedAt: now,
  });
  return copy;
}

export function deleteProject(id: string) {
  if (hasStorage()) {
    try {
      localStorage.removeItem(projectKey(id));
    } catch (e) {
      console.error("[projectStorage] failed to remove project data", e);
    }
  }
  writeIndex(readIndex().filter((p) => p.id !== id));
}
