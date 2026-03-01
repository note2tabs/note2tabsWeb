import type { CanvasSnapshot, EditorListItem, EditorSnapshot, TabCoord } from "../types/gte";
import { GTE_GUEST_EDITOR_ID } from "./gteGuestDraft";

const AUTH_BASE = "/api/gte";
const GUEST_BASE = "/api/gte-guest";
const LANE_DELIMITER = "__ed__";
export type EditorOrCanvasSnapshot = EditorSnapshot | CanvasSnapshot;

export const buildLaneEditorRef = (canvasId: string, laneId: string) =>
  `${canvasId}${LANE_DELIMITER}${laneId}`;

const isGuestEditorRef = (editorId?: string | null) =>
  Boolean(
    editorId &&
      (editorId === GTE_GUEST_EDITOR_ID || editorId.startsWith(`${GTE_GUEST_EDITOR_ID}${LANE_DELIMITER}`))
  );

const getBaseForEditor = (editorId?: string | null) => (isGuestEditorRef(editorId) ? GUEST_BASE : AUTH_BASE);

const encodeSnapToGridQuery = (snapToGrid?: boolean) =>
  snapToGrid === undefined
    ? ""
    : `&snap_to_grid=${encodeURIComponent(String(snapToGrid))}&snapToGrid=${encodeURIComponent(String(snapToGrid))}`;

async function request<T>(path: string, options: RequestInit = {}, base: string = AUTH_BASE): Promise<T> {
  const res = await fetch(`${base}${path}`, options);
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

async function requestForEditor<T>(
  editorId: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return request<T>(path, options, getBaseForEditor(editorId));
}

export const gteApi = {
  listEditors: () => request<{ editors: EditorListItem[] }>("/editors"),
  createEditor: (editorId?: string, name?: string) =>
    request<{ editorId: string; snapshot: CanvasSnapshot }>("/editors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editorId, name }),
    }),
  getEditor: (editorId: string) => requestForEditor<EditorOrCanvasSnapshot>(editorId, `/editors/${editorId}`),
  deleteEditor: (editorId: string) =>
    requestForEditor<{ ok: true }>(editorId, `/editors/${editorId}`, {
      method: "DELETE",
    }),
  applySnapshot: (editorId: string, snapshot: EditorOrCanvasSnapshot | Record<string, any>) =>
    requestForEditor<{ ok: true; snapshot: any; canvas?: CanvasSnapshot }>(editorId, `/editors/${editorId}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot }),
    }),
  commitEditor: (editorId: string, options?: { keepalive?: boolean }) =>
    requestForEditor<{ ok: true; snapshot: CanvasSnapshot }>(editorId, `/editors/${editorId}/commit`, {
      method: "POST",
      keepalive: Boolean(options?.keepalive),
    }),
  setEditorName: (editorId: string, name: string) =>
    requestForEditor<{ ok: true; snapshot: EditorOrCanvasSnapshot; canvas?: CanvasSnapshot }>(
      editorId,
      `/editors/${editorId}/name`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      }
    ),
  addCanvasEditor: (editorId: string, name?: string) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; editor: EditorSnapshot }>(
      editorId,
      `/editors/${editorId}/canvas/editors`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      }
    ),
  deleteCanvasEditor: (editorId: string, laneId: string) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; removedEditorId: string }>(
      editorId,
      `/editors/${editorId}/canvas/editors/${encodeURIComponent(laneId)}`,
      {
        method: "DELETE",
      }
    ),
  reorderCanvasEditor: (editorId: string, laneId: string, toIndex: number) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot }>(editorId, `/editors/${editorId}/canvas/editors/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ laneId, toIndex }),
    }),
  selectCanvasBars: (editorId: string, laneId: string, barIndices: number[]) =>
    requestForEditor<{ ok: true; clipboard: EditorSnapshot }>(editorId, `/editors/${editorId}/canvas/bars/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ laneId, barIndexes: barIndices }),
    }),
  insertCanvasBars: (
    editorId: string,
    laneId: string,
    insertIndex: number,
    clipboard: EditorSnapshot | Record<string, any>
  ) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; snapshot: EditorSnapshot }>(
      editorId,
      `/editors/${editorId}/canvas/bars/insert`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laneId, insertIndex, clipboard }),
      }
    ),
  deleteCanvasBars: (editorId: string, laneId: string, barIndices: number[]) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; snapshot: EditorSnapshot }>(
      editorId,
      `/editors/${editorId}/canvas/bars/delete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laneId, barIndexes: barIndices }),
      }
    ),
  moveCanvasBars: (
    editorId: string,
    payload: {
      sourceLaneId: string;
      targetLaneId: string;
      barIndices: number[];
      insertIndex: number;
    }
  ) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; snapshot: EditorSnapshot }>(
      editorId,
      `/editors/${editorId}/canvas/bars/move`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLaneId: payload.sourceLaneId,
          targetLaneId: payload.targetLaneId,
          barIndexes: payload.barIndices,
          insertIndex: payload.insertIndex,
        }),
      }
    ),
  addBars: (editorId: string, count: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/bars/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
    }),
  reorderBars: (editorId: string, fromIndex: number, toIndex: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/bars/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromIndex, toIndex }),
    }),
  removeBar: (editorId: string, index: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/bars/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    }),
  addNote: (
    editorId: string,
    payload: { tab: TabCoord; startTime: number; length: number; snapToGrid?: boolean }
  ) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteNote: (editorId: string, noteId: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/notes/${noteId}`, {
      method: "DELETE",
    }),
  assignNoteTab: (editorId: string, noteId: number, tab: TabCoord) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(
      editorId,
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
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(
      editorId,
      `/editors/${editorId}/notes/${noteId}/set_start_time?start_time=${encodeURIComponent(startTime)}${encodeSnapToGridQuery(snapToGrid)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime, start_time: startTime, snapToGrid, snap_to_grid: snapToGrid }),
      }
    ),
  setNoteLength: (editorId: string, noteId: number, length: number, snapToGrid?: boolean) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(
      editorId,
      `/editors/${editorId}/notes/${noteId}/set_length?length=${encodeURIComponent(length)}${encodeSnapToGridQuery(snapToGrid)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length, snapToGrid, snap_to_grid: snapToGrid }),
      }
    ),
  getNoteOptimals: (editorId: string, noteId: number) =>
    requestForEditor<{ possibleTabs: TabCoord[]; blockedTabs: TabCoord[] }>(
      editorId,
      `/editors/${editorId}/notes/${noteId}/optimals`
    ),
  assignOptimals: (editorId: string, noteIds: number[]) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/optimals/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteIds }),
    }),
  makeChord: (editorId: string, noteIds: number[]) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/chords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteIds }),
    }),
  deleteChord: (editorId: string, chordId: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/chords/${chordId}`, {
      method: "DELETE",
    }),
  disbandChord: (editorId: string, chordId: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(
      editorId,
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
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(
      editorId,
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
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(
      editorId,
      `/editors/${editorId}/chords/${chordId}/set_length?length=${encodeURIComponent(length)}${encodeSnapToGridQuery(snapToGrid)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length, snapToGrid, snap_to_grid: snapToGrid }),
      }
    ),
  sliceChord: (editorId: string, chordId: number, time: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/chords/${chordId}/slice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time }),
    }),
  setChordTabs: (editorId: string, chordId: number, tabs: TabCoord[]) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/chords/${chordId}/tabs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabs }),
    }),
  getChordAlternatives: (editorId: string, chordId: number) =>
    requestForEditor<{ alternatives: TabCoord[][] }>(editorId, `/editors/${editorId}/chords/${chordId}/alternatives`),
  shiftChordOctave: (editorId: string, chordId: number, direction: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/chords/${chordId}/octave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    }),
  exportTab: (editorId: string) =>
    requestForEditor<{
      stamps: Array<[number, TabCoord, number]>;
      framesPerMessure: number;
      fps: number;
      totalFrames: number;
      tabStrings: string[];
    }>(editorId, `/editors/${editorId}/export`),
  importTab: (
    editorId: string,
    payload: {
      stamps: Array<[number, TabCoord, number]>;
      framesPerMessure?: number;
      fps?: number;
      totalFrames?: number;
    }
  ) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/import`, {
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
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/import_append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  setSecondsPerBar: (editorId: string, secondsPerBar: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot; canvas?: CanvasSnapshot }>(
      editorId,
      `/editors/${editorId}/seconds_per_bar`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secondsPerBar }),
      }
    ),
  setTimeSignature: (editorId: string, timeSignature: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot; canvas?: CanvasSnapshot }>(
      editorId,
      `/editors/${editorId}/time_signature`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeSignature }),
      }
    ),
  generateCuts: (editorId: string) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/cuts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
  applyManualCuts: (editorId: string, cutPositionsWithCoords: any) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/cuts/apply_manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cutPositionsWithCoords }),
    }),
  shiftCutBoundary: (editorId: string, boundaryIndex: number, newTime: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/cuts/shift_boundary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boundaryIndex, newTime }),
    }),
  insertCutAt: (editorId: string, time: number, coord?: TabCoord) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/cuts/insert_at`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time, coord }),
    }),
  deleteCutBoundary: (editorId: string, boundaryIndex: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/cuts/delete_boundary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boundaryIndex }),
    }),
};
