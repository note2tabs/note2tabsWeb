import type { EditorListItem, EditorSnapshot, TabCoord } from "../types/gte";

const BASE = "/api/gte";

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
    request<{ editorId: string; snapshot: EditorSnapshot }>("/editors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editorId, name }),
    }),
  getEditor: (editorId: string) => request<EditorSnapshot>(`/editors/${editorId}`),
  deleteEditor: (editorId: string) =>
    request<{ ok: true }>(`/editors/${editorId}`, {
      method: "DELETE",
    }),
  applySnapshot: (editorId: string, snapshot: EditorSnapshot) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot }),
    }),
  setEditorName: (editorId: string, name: string) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
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
      `/editors/${editorId}/notes/${noteId}/set_start_time?start_time=${encodeURIComponent(startTime)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime, start_time: startTime, snapToGrid, snap_to_grid: snapToGrid }),
      }
    ),
  setNoteLength: (editorId: string, noteId: number, length: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(
      `/editors/${editorId}/notes/${noteId}/set_length`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length }),
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
  setChordStartTime: (editorId: string, chordId: number, startTime: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(
      `/editors/${editorId}/chords/${chordId}/set_start_time?start_time=${encodeURIComponent(startTime)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime, start_time: startTime }),
      }
    ),
  setChordLength: (editorId: string, chordId: number, length: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(
      `/editors/${editorId}/chords/${chordId}/set_length`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length }),
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
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/seconds_per_bar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secondsPerBar }),
    }),
  setTimeSignature: (editorId: string, timeSignature: number) =>
    request<{ ok: true; snapshot: EditorSnapshot }>(`/editors/${editorId}/time_signature`, {
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
