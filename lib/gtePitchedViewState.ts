/** Bounded, browser-session UI state only. Musical data always lives in the
 * shared EditorSnapshot. Never persist transient drags or duplicate notes here. */
export type MidiViewState = { zoom: number; row: number; left: number; top: number; selection: string[];
  grid: number; triplet: boolean; strength: number; snap: boolean; mode: "select" | "draw"; follow: boolean; showNoteLabels: boolean };
const views = new Map<string, Partial<MidiViewState>>();
export function readPitchedViewState(editorId: string): Partial<MidiViewState> { return typeof window === "undefined" ? {} : views.get(editorId) ?? {}; }
export function savePitchedViewState(editorId: string, patch: Partial<MidiViewState>) {
  if (typeof window === "undefined") return;
  const next = { ...views.get(editorId), ...patch };
  views.delete(editorId); views.set(editorId, next);
  if (views.size > 40) views.delete(views.keys().next().value!);
}
