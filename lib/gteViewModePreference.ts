export type EditorViewMode = "canvas" | "tab" | "practice";

/** The last view is only worth restoring for the current work session, not days later. */
export const VIEW_MODE_TTL_MS = 8 * 60 * 60 * 1000;

const storageKey = (editorId: string) => `note2tabs:gte:view-mode:${editorId}`;
const isViewMode = (value: unknown): value is EditorViewMode => value === "canvas" || value === "tab" || value === "practice";

export function saveViewMode(editorId: string, mode: EditorViewMode, now = Date.now()) {
  try {
    window.localStorage.setItem(storageKey(editorId), JSON.stringify({ mode, at: now }));
  } catch {
    /* Storage can be disabled; the view just won't persist. */
  }
}

export function readViewMode(editorId: string, now = Date.now()): EditorViewMode | null {
  try {
    const raw = window.localStorage.getItem(storageKey(editorId));
    if (!raw) return null;
    const stored = JSON.parse(raw) as { mode?: unknown; at?: unknown };
    if (!isViewMode(stored.mode) || typeof stored.at !== "number") return null;
    const age = now - stored.at;
    if (age < 0 || age > VIEW_MODE_TTL_MS) {
      window.localStorage.removeItem(storageKey(editorId));
      return null;
    }
    return stored.mode;
  } catch {
    return null;
  }
}
