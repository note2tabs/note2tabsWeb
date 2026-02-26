import type { CanvasSnapshot, EditorListItem, EditorSnapshot, TabCoord } from "../types/gte";

const BASE = "/api/gte";
const LANE_DELIMITER = "__ed__";
export type EditorOrCanvasSnapshot = EditorSnapshot | CanvasSnapshot;

export const buildLaneEditorRef = (canvasId: string, laneId: string) =>
  `${canvasId}${LANE_DELIMITER}${laneId}`;

const encodeSnapToGridQuery = (snapToGrid?: boolean) =>
  snapToGrid === undefined
    ? ""
    : `&snap_to_grid=${encodeURIComponent(String(snapToGrid))}&snapToGrid=${encodeURIComponent(String(snapToGrid))}`;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || "Request failed");
  }
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export const gteApi = {
  listEditors: () => request<{ editors: EditorListItem[] }>("/editors"),
  createEditor: (editorId?: string, name?: string) =>
    request<{ editorId: string; snapshot: CanvasSnapshot }>("/editors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editorId, name }),
    }),
  getEditor: (editorId: string) => request<EditorOrCanvasSnapshot>(`/editors/${editorId}`),
  deleteEditor: (editorId: string) =>
    request<{ ok: true }>(`/editors/${editorId}`, {
      method: "DELETE",
    }),
  applySnapshot: (editorId: string, snapshot: EditorOrCanvasSnapshot | Record<string, any>) =>
    request<{ ok: true; snapshot: any; canvas?: CanvasSnapshot }>(`/editors/${editorId}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot }),
    }),
  commitEditor: (editorId: string, options?: { keepalive?: boolean }) =>
    request<{ ok: true; snapshot: CanvasSnapshot }>(`/editors/${editorId}/commit`, {
      method: "POST",
      keepalive: Boolean(options?.keepalive),
    }),
  setEditorName: (editorId: string, name: string) =>
    request<{ ok: true; snapshot: EditorOrCanvasSnapshot; canvas?: CanvasSnapshot }>(`/editors/${editorId}/name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  addCanvasEditor: (editorId: string, name?: string) =>
    request<{ ok: true; canvas: CanvasSnapshot; editor: EditorSnapshot }>(`/editors/${editorId}/canvas/editors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  deleteCanvasEditor: (editorId: string, laneId: string) =>
    request<{ ok: true; canvas: CanvasSnapshot; removedEditorId: string }>(
      `/editors/${editorId}/canvas/editors/${encodeURIComponent(laneId)}`,
      {
        method: "DELETE",
      }
    ),
  addBars: (editorId: string, count: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/bars/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
    }),
  reorderBars: (editorId: string, fromIndex: number, toIndex: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/bars/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromIndex, toIndex }),
    }),
  removeBar: (editorId: string, index: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/bars/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    }),
  addNote: (
    editorId: string,
    payload: { tab: TabCoord; startTime: number; length: number; snapToGrid?: boolean }
  ) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteNote: (editorId: string, noteId: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/notes/${noteId}`, {
      method: "DELETE",
    }),
  assignNoteTab: (editorId: string, noteId: number, tab: TabCoord) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(
      `/editors/${editorId}/notes/${noteId}/assign_tab`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab }),
      }
    ),
  setNoteStartTime: (
    editorId: string,
    noteId: number,
    startTime: number,
    snapToGrid?: boolean
  ) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(
      `/editors/${editorId}/notes/${noteId}/set_start_time?start_time=${encodeURIComponent(startTime)}${encodeSnapToGridQuery(snapToGrid)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime, start_time: startTime, snapToGrid, snap_to_grid: snapToGrid }),
      }
    ),
  setNoteLength: (editorId: string, noteId: number, length: number, snapToGrid?: boolean) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(
      `/editors/${editorId}/notes/${noteId}/set_length?length=${encodeURIComponent(length)}${encodeSnapToGridQuery(snapToGrid)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length, snapToGrid, snap_to_grid: snapToGrid }),
      }
    ),
  getNoteOptimals: (editorId: string, noteId: number) =>
    request<{ possibleTabs: TabCoord[]; blockedTabs: TabCoord[] }>(
      `/editors/${editorId}/notes/${noteId}/optimals`
    ),
  assignOptimals: (editorId: string, noteIds: number[]) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/optimals/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteIds }),
    }),
  makeChord: (editorId: string, noteIds: number[]) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/chords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteIds }),
    }),
  deleteChord: (editorId: string, chordId: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/chords/${chordId}`, {
      method: "DELETE",
    }),
  disbandChord: (editorId: string, chordId: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(
      `/editors/${editorId}/chords/${chordId}/disband`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    ),
  setChordStartTime: (
    editorId: string,
    chordId: number,
    startTime: number,
    snapToGrid?: boolean
  ) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(
      `/editors/${editorId}/chords/${chordId}/set_start_time?start_time=${encodeURIComponent(startTime)}${encodeSnapToGridQuery(snapToGrid)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime,
          start_time: startTime,
          snapToGrid,
          snap_to_grid: snapToGrid,
        }),
      }
    ),
  setChordLength: (editorId: string, chordId: number, length: number, snapToGrid?: boolean) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(
      `/editors/${editorId}/chords/${chordId}/set_length?length=${encodeURIComponent(length)}${encodeSnapToGridQuery(snapToGrid)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length, snapToGrid, snap_to_grid: snapToGrid }),
      }
    ),
  sliceChord: (editorId: string, chordId: number, time: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/chords/${chordId}/slice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time }),
    }),
  setChordTabs: (editorId: string, chordId: number, tabs: TabCoord[]) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/chords/${chordId}/tabs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabs }),
    }),
  getChordAlternatives: (editorId: string, chordId: number) =>
    request<{ alternatives: TabCoord[][] }>(`/editors/${editorId}/chords/${chordId}/alternatives`),
  shiftChordOctave: (editorId: string, chordId: number, direction: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/chords/${chordId}/octave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    }),
  exportTab: (editorId: string) =>
    request<{
      stamps: Array<[number, TabCoord, number]>;
      framesPerMessure: number;
      fps: number;
      totalFrames: number;
      tabStrings: string[];
    }>(`/editors/${editorId}/export`),
  importTab: (
    editorId: string,
    payload: {
      stamps: Array<[number, TabCoord, number]>;
      framesPerMessure?: number;
      fps?: number;
      totalFrames?: number;
    }
  ) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  appendImportTab: (
    editorId: string,
    payload: {
      stamps: Array<[number, TabCoord, number]>;
      framesPerMessure?: number;
      fps?: number;
      totalFrames?: number;
    }
  ) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/import_append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  setSecondsPerBar: (editorId: string, secondsPerBar: number) =>
    request<{ ok: true; snapshot: EditorSnapshot; canvas?: CanvasSnapshot }>(`/editors/${editorId}/seconds_per_bar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secondsPerBar }),
    }),
  setTimeSignature: (editorId: string, timeSignature: number) =>
    request<{ ok: true; snapshot: EditorSnapshot; canvas?: CanvasSnapshot }>(`/editors/${editorId}/time_signature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeSignature }),
    }),
  generateCuts: (editorId: string) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/cuts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
  applyManualCuts: (editorId: string, cutPositionsWithCoords: any) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/cuts/apply_manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cutPositionsWithCoords }),
    }),
  shiftCutBoundary: (editorId: string, boundaryIndex: number, newTime: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/cuts/shift_boundary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boundaryIndex, newTime }),
    }),
  insertCutAt: (editorId: string, time: number, coord?: TabCoord) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/cuts/insert_at`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time, coord }),
    }),
  deleteCutBoundary: (editorId: string, boundaryIndex: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/cuts/delete_boundary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boundaryIndex }),
    }),
};
