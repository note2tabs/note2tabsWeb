import type {
  CanvasSnapshot,
  ChordFingering,
  EditorListItem,
  EditorSnapshot,
  TabCoord,
  TimingMapV2,
} from "../types/gte";
import { GTE_GUEST_EDITOR_ID } from "./gteGuestDraft";
import {
  MINIMUM_INTERIOR_TEMPO_SEGMENT_BARS,
  preserveExistingTimingForOffsetImport,
  stabilizeNewTranscriberTimingMap,
} from "./gteTranscriberTiming";

const AUTH_BASE = "/api/gte";
const GUEST_BASE = "/api/gte-guest";
const LANE_DELIMITER = "__ed__";
const EDITOR_PREFETCH_TTL_MS = 15_000;
type EditorBootstrapResult = {
  ok: boolean;
  status: number;
  text: string;
};
type EditorBootstrap = {
  editorId: string;
  promise: Promise<EditorBootstrapResult>;
};

declare global {
  interface Window {
    __note2tabsEditorBootstrap?: EditorBootstrap;
  }
}

const editorPrefetches = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<EditorOrCanvasSnapshot>;
  }
>();
export const MAX_EDITOR_NAME_LENGTH = 80;
export const TRANSCRIBER_IMPORT_CHUNK_MAX_BYTES = 96_000;
export const TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS = 24;
const TRANSCRIBER_IMPORT_MAX_SPLIT_DEPTH = 6;
export const TRANSCRIBER_TEMPO_STABILIZATION_POLICY = {
  enabled: true,
  preferDominantTempo: true,
  minimumInteriorSegmentBars: MINIMUM_INTERIOR_TEMPO_SEGMENT_BARS,
  emptyBarsInheritTempo: true,
  allowSingleOpeningBar: true,
  allowShortOpeningSegment: true,
  existingCanvasTiming: "preserve",
  existingCanvasAlignment: "track_offset_bars",
} as const;
export type EditorOrCanvasSnapshot = EditorSnapshot | CanvasSnapshot;
export type TranscriberSegment = {
  start_time_s?: number;
  end_time_s?: number;
  pitch_midi?: number;
  amplitude?: number | null;
  pitch_bend?: number[] | null;
  lineStart?: number;
  lineEnd?: number;
  midiNum?: number | null;
  MidiNumLine?: number[];
};
export type TranscriberSegmentGroup = TranscriberSegment[];
export type TranscriberTrack = {
  name: string;
  trackType: "tab" | "drums";
  instrumentId: string;
  segments: TranscriberSegmentGroup;
};
export type TranscriberImportResponse = {
  ok: true;
  target?: string;
  editorId: string;
  importedEditorIds?: string[];
  canvas?: CanvasSnapshot;
  quantization?: {
    applied: boolean;
    enabled?: boolean;
    subdivision?: string;
    strength?: number;
    quantizeDurations?: boolean;
    secondsPerBar?: number;
    framesPerBeat?: number;
    secondsPerBeat?: number;
  };
  alignment?: {
    applied: boolean;
    mode: "auto" | "preserve";
    source?: string;
    confidence?: number;
    appendFrame: number;
    importGroupId: string;
    warnings?: string[];
  };
};

export type TranscriberQuantization = {
  enabled: boolean;
  subdivision?: "1/4" | "1/8" | "1/16" | "1/32" | "1/64";
  strength?: number;
  quantizeDurations?: boolean;
};

type ImportTranscriberToSavedPayload = {
  segmentGroups: TranscriberSegmentGroup[];
  tracks?: TranscriberTrack[];
  target?: "new" | "existing";
  editorId?: string;
  name?: string;
  quantize?: boolean;
  quantization?: TranscriberQuantization;
  sourceJobId?: string;
  importGroupId?: string;
  rhythmOnsets?: number[];
};

export const normalizeEditorName = (name?: string) => {
  const normalized = name?.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_EDITOR_NAME_LENGTH).trimEnd();
};

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

function fetchEditor(editorId: string) {
  return requestForEditor<EditorOrCanvasSnapshot>(
    editorId,
    `/editors/${encodeURIComponent(editorId)}`
  );
}

function takeBootstrappedEditor(editorId: string) {
  if (typeof window === "undefined") return null;
  const bootstrap = window.__note2tabsEditorBootstrap;
  if (!bootstrap || bootstrap.editorId !== editorId) return null;
  delete window.__note2tabsEditorBootstrap;
  return bootstrap.promise.then(({ ok, text }) => {
    if (!ok) throw new Error(text || "Request failed");
    if (!text) return {} as EditorOrCanvasSnapshot;
    try {
      return JSON.parse(text) as EditorOrCanvasSnapshot;
    } catch {
      return text as unknown as EditorOrCanvasSnapshot;
    }
  });
}

function prefetchEditor(editorId: string) {
  const now = Date.now();
  const cached = editorPrefetches.get(editorId);
  if (cached && cached.expiresAt > now) return cached.promise;
  if (cached) editorPrefetches.delete(editorId);

  const promise = fetchEditor(editorId).catch((error) => {
    editorPrefetches.delete(editorId);
    throw error;
  });
  editorPrefetches.set(editorId, {
    expiresAt: now + EDITOR_PREFETCH_TTL_MS,
    promise,
  });
  return promise;
}

function getPrefetchedEditor(editorId: string) {
  const cached = editorPrefetches.get(editorId);
  editorPrefetches.delete(editorId);
  if (!cached || cached.expiresAt <= Date.now()) {
    return takeBootstrappedEditor(editorId) ?? fetchEditor(editorId);
  }
  return cached.promise;
}

export function chunkTranscriberSegmentGroups(
  groups: TranscriberSegmentGroup[],
  maxBytes: number = TRANSCRIBER_IMPORT_CHUNK_MAX_BYTES,
  maxGroups: number = TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS
): TranscriberSegmentGroup[][] {
  const chunks: TranscriberSegmentGroup[][] = [];
  let current: TranscriberSegmentGroup[] = [];
  let currentBytes = 2; // "[]"

  for (const group of groups) {
    const serializedGroup = JSON.stringify(group ?? []);
    const groupBytes = serializedGroup.length;
    const delimiterBytes = current.length > 0 ? 1 : 0;
    const nextBytes = currentBytes + delimiterBytes + groupBytes;
    const shouldFlush =
      current.length > 0 && (nextBytes > maxBytes || current.length >= maxGroups);
    if (shouldFlush) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    const delimiterAfterFlush = current.length > 0 ? 1 : 0;
    current.push(group);
    currentBytes += delimiterAfterFlush + groupBytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

const postTranscriberImportSaved = (
  payload: ImportTranscriberToSavedPayload & {
    alignmentMode?: "auto" | "preserve";
    appendMode?: "after_content" | "at_offset";
    includeCanvas?: boolean;
    tempoStabilization?: typeof TRANSCRIBER_TEMPO_STABILIZATION_POLICY;
    alignmentStrategy?: "track_offset_bars";
  }
) =>
  request<TranscriberImportResponse>("/transcriber/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, name: normalizeEditorName(payload.name) }),
  });

type TranscriberChunkImportResult = {
  editorId: string;
  importedEditorIds: string[];
  response: TranscriberImportResponse;
};

async function postTranscriberImportChunk(
  options: {
    target: "new" | "existing";
    editorId?: string;
    name?: string;
    quantization: TranscriberQuantization;
    sourceJobId?: string;
    importGroupId: string;
    rhythmOnsets: number[];
    includeCanvas?: boolean;
  },
  segmentGroups: TranscriberSegmentGroup[],
  tracks?: TranscriberTrack[]
): Promise<TranscriberImportResponse> {
  return postTranscriberImportSaved({
    segmentGroups,
    tracks,
    target: options.target,
    editorId: options.editorId,
    name: options.name,
    quantization: options.quantization,
    sourceJobId: options.sourceJobId,
    importGroupId: options.importGroupId,
    rhythmOnsets: options.rhythmOnsets,
    alignmentMode: "auto",
    appendMode: "after_content",
    includeCanvas: Boolean(options.includeCanvas),
    tempoStabilization: TRANSCRIBER_TEMPO_STABILIZATION_POLICY,
    alignmentStrategy: "track_offset_bars",
  });
}

async function importTranscriberChunkWithRetry(
  options: Parameters<typeof postTranscriberImportChunk>[0],
  segmentGroups: TranscriberSegmentGroup[],
  tracks?: TranscriberTrack[],
  depth: number = 0
): Promise<TranscriberChunkImportResult> {
  try {
    const response = await postTranscriberImportChunk(options, segmentGroups, tracks);
    return {
      editorId: response.editorId || options.editorId || "",
      importedEditorIds: Array.isArray(response.importedEditorIds) ? response.importedEditorIds : [],
      response,
    };
  } catch (error) {
    if (segmentGroups.length <= 1 || depth >= TRANSCRIBER_IMPORT_MAX_SPLIT_DEPTH) {
      throw error;
    }
    const middle = Math.max(1, Math.floor(segmentGroups.length / 2));
    const left = segmentGroups.slice(0, middle);
    const right = segmentGroups.slice(middle);

    const splitTracks = tracks?.length === segmentGroups.length ? tracks : undefined;
    const leftResult = await importTranscriberChunkWithRetry(
      options,
      left,
      splitTracks?.slice(0, middle),
      depth + 1
    );
    const rightResult = await importTranscriberChunkWithRetry(
      {
        ...options,
        target: "existing",
        editorId: leftResult.editorId,
        name: undefined,
      },
      right,
      splitTracks?.slice(middle),
      depth + 1
    );
    return {
      editorId: rightResult.editorId,
      importedEditorIds: [...leftResult.importedEditorIds, ...rightResult.importedEditorIds],
      response: rightResult.response,
    };
  }
}

const createImportGroupId = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `import-${randomUuid}`;
  return `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const collectTranscriberRhythmOnsets = (
  groups: TranscriberSegmentGroup[],
  supplied: number[] = []
) =>
  Array.from(
    new Set(
      [
        ...supplied,
        ...groups.flatMap((group) =>
          group.map((segment) => Number(segment?.start_time_s)).filter(Number.isFinite)
        ),
      ]
        .map(Number)
        .filter((value) => Number.isFinite(value) && value >= 0)
        .map((value) => Math.round(value * 1_000_000) / 1_000_000)
    )
  ).sort((left, right) => left - right);

async function retainOnlyImportedTracks(
  editorId: string,
  canvas: CanvasSnapshot,
  importedEditorIds: string[]
): Promise<CanvasSnapshot> {
  const importedIds = new Set(importedEditorIds.filter(Boolean));
  if (importedIds.size === 0 || !canvas.editors.some((lane) => importedIds.has(lane.id))) {
    return canvas;
  }

  let nextCanvas = canvas;
  const unimportedLaneIds = canvas.editors
    .filter((lane) => !importedIds.has(lane.id))
    .map((lane) => lane.id);

  for (const laneId of unimportedLaneIds) {
    if (nextCanvas.editors.length <= 1) break;
    const result = await requestForEditor<{ ok: true; canvas: CanvasSnapshot; removedEditorId: string }>(
      editorId,
      `/editors/${encodeURIComponent(editorId)}/canvas/editors/${encodeURIComponent(laneId)}`,
      { method: "DELETE" }
    );
    nextCanvas = result.canvas;
  }

  if (nextCanvas.editors.some((lane) => !importedIds.has(lane.id))) {
    throw new Error("Transcriber import left an unexpected non-imported track.");
  }

  return nextCanvas;
}

async function importTranscriberToSaved(
  payload: ImportTranscriberToSavedPayload
): Promise<TranscriberImportResponse> {
  const groups = Array.isArray(payload.segmentGroups) ? payload.segmentGroups : [];
  if (!groups.length) {
    throw new Error("segmentGroups is required");
  }
  if (payload.target === "existing" && !payload.editorId) {
    throw new Error("editorId is required when target is existing");
  }

  const chunks = chunkTranscriberSegmentGroups(groups);
  const trackBySegments = Array.isArray(payload.tracks) && payload.tracks.length === groups.length
    ? payload.tracks
    : undefined;
  let groupOffset = 0;
  let lastResponse: TranscriberImportResponse | null = null;
  const importedEditorIds: string[] = [];
  const importGroupId = payload.importGroupId || createImportGroupId();
  const rhythmOnsets = collectTranscriberRhythmOnsets(groups, payload.rhythmOnsets);
  const quantization: TranscriberQuantization = payload.quantization ?? {
    enabled: Boolean(payload.quantize),
    subdivision: "1/16",
    strength: 1,
    quantizeDurations: false,
  };
  let currentEditorId = payload.editorId;
  let nextTarget: "new" | "existing" = payload.target === "existing" ? "existing" : "new";
  const existingSnapshot =
    payload.target === "existing" && payload.editorId
      ? await fetchEditor(payload.editorId).catch(() => null)
      : null;
  const existingCanvas =
    existingSnapshot && "editors" in existingSnapshot ? existingSnapshot : null;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunkTracks = trackBySegments?.slice(groupOffset, groupOffset + chunks[index].length);
    const result = await importTranscriberChunkWithRetry(
      {
        target: nextTarget,
        editorId: currentEditorId,
        name: index === 0 ? payload.name : undefined,
        quantization,
        sourceJobId: payload.sourceJobId,
        importGroupId,
        rhythmOnsets,
        includeCanvas: index === chunks.length - 1,
      },
      chunks[index],
      chunkTracks
    );
    groupOffset += chunks[index].length;
    currentEditorId = result.editorId || currentEditorId;
    nextTarget = "existing";
    lastResponse = result.response;
    if (result.importedEditorIds.length > 0) {
      importedEditorIds.push(...result.importedEditorIds);
    }
  }

  if (!lastResponse || !currentEditorId) {
    throw new Error("Transcriber import failed");
  }

  const finalImportedEditorIds =
    importedEditorIds.length > 0 ? importedEditorIds : lastResponse.importedEditorIds || [];
  if (lastResponse.canvas) {
    const timingMap = existingCanvas
      ? preserveExistingTimingForOffsetImport(lastResponse.canvas, existingCanvas)
      : stabilizeNewTranscriberTimingMap(lastResponse.canvas);
    const patched = await requestForEditor<{ ok: true; canvas: CanvasSnapshot; timingMap: TimingMapV2 }>(
      currentEditorId,
      `/editors/${encodeURIComponent(currentEditorId)}/timing`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: Math.max(1, Number(lastResponse.canvas.version) || 1),
          timingMap,
        }),
      }
    );
    lastResponse = { ...lastResponse, canvas: patched.canvas };
    if (payload.target !== "existing") {
      lastResponse = {
        ...lastResponse,
        canvas: await retainOnlyImportedTracks(currentEditorId, patched.canvas, finalImportedEditorIds),
      };
    }
  }

  return {
    ok: true,
    target: lastResponse.target ?? (payload.target === "existing" ? "existing" : "new"),
    editorId: currentEditorId,
    importedEditorIds: finalImportedEditorIds,
    quantization: lastResponse.quantization,
    alignment: lastResponse.alignment,
    canvas: lastResponse.canvas,
  };
}

type ImportTranscriberToGuestPayload = {
  segmentGroups: TranscriberSegmentGroup[];
  tracks?: TranscriberTrack[];
  editorId?: string;
  name?: string;
  quantize?: boolean;
  quantization?: TranscriberQuantization;
  sourceJobId?: string;
  importGroupId?: string;
  rhythmOnsets?: number[];
};

async function importTranscriberToGuest(
  payload: ImportTranscriberToGuestPayload
): Promise<TranscriberImportResponse> {
  const existingSnapshot = payload.editorId
    ? await fetchEditor(payload.editorId).catch(() => null)
    : null;
  const existingCanvas =
    existingSnapshot &&
    "editors" in existingSnapshot &&
    existingSnapshot.editors.some((lane) => lane.notes.length > 0 || lane.chords.length > 0)
      ? existingSnapshot
      : null;
  let response = await request<TranscriberImportResponse>(
    "/transcriber/import",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        target: "guest",
        alignmentMode: "auto",
        appendMode: "after_content",
        alignmentStrategy: "track_offset_bars",
        includeCanvas: true,
        tempoStabilization: TRANSCRIBER_TEMPO_STABILIZATION_POLICY,
        quantization: payload.quantization ?? {
          enabled: Boolean(payload.quantize),
          subdivision: "1/16",
          strength: 1,
          quantizeDurations: false,
        },
      }),
    },
    GUEST_BASE
  );
  if (!response.canvas) return response;
  const timingMap = existingCanvas
    ? preserveExistingTimingForOffsetImport(response.canvas, existingCanvas)
    : stabilizeNewTranscriberTimingMap(response.canvas);
  const patched = await requestForEditor<{ ok: true; canvas: CanvasSnapshot; timingMap: TimingMapV2 }>(
    response.editorId,
    `/editors/${encodeURIComponent(response.editorId)}/timing`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: Math.max(1, Number(response.canvas.version) || 1),
        timingMap,
      }),
    }
  );
  const importedEditorIds = response.importedEditorIds || [];
  response = {
    ...response,
    canvas: existingCanvas
      ? patched.canvas
      : await retainOnlyImportedTracks(response.editorId, patched.canvas, importedEditorIds),
  };
  return response;
}

export const gteApi = {
  listEditors: () => request<{ editors: EditorListItem[] }>("/editors"),
  createEditor: (editorId?: string, name?: string) =>
    request<{ editorId: string; snapshot: CanvasSnapshot }>("/editors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editorId, name: normalizeEditorName(name) }),
    }),
  importTranscriberToSaved: (payload: ImportTranscriberToSavedPayload) =>
    importTranscriberToSaved(payload),
  importTranscriberToGuest: (payload: ImportTranscriberToGuestPayload) =>
    importTranscriberToGuest(payload),
  prefetchEditor,
  getEditor: getPrefetchedEditor,
  deleteEditor: (editorId: string) =>
    requestForEditor<{ ok: true }>(editorId, `/editors/${editorId}`, {
      method: "DELETE",
    }),
  applySnapshot: (
    editorId: string,
    snapshot: EditorOrCanvasSnapshot | Record<string, any>,
    concurrency?: { expectedVersion?: number; expectedDraftRevision?: number }
  ) =>
    requestForEditor<{ ok: true; snapshot: any; canvas?: CanvasSnapshot }>(editorId, `/editors/${editorId}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot, ...concurrency }),
    }),
  setTrackInstrument: (editorId: string, laneId: string, instrumentId: string) =>
    request<{ ok: true }>("/track-instrument", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editorId, laneId, instrumentId }),
    }, AUTH_BASE),
  commitEditor: (editorId: string, options?: { keepalive?: boolean }) =>
    requestForEditor<{ ok: true; snapshot: CanvasSnapshot }>(editorId, `/editors/${editorId}/commit`, {
      method: "POST",
      keepalive: Boolean(options?.keepalive),
    }),
  patchTimingMap: (editorId: string, expectedVersion: number, timingMap: TimingMapV2) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; timingMap: TimingMapV2 }>(
      editorId,
      `/editors/${editorId}/timing`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion, timingMap }),
      }
    ),
  setBarTempo: (
    editorId: string,
    payload: { expectedVersion: number; barIndexes: number[]; bpm: number; applyToAll?: boolean }
  ) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; timingMap: TimingMapV2 }>(
      editorId,
      `/editors/${editorId}/timing/bars`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ),
  setTimeSignatureMap: (
    editorId: string,
    payload: {
      expectedVersion: number;
      timeSignature: number;
      timeSignatureBottom: number;
      barIndexes: number[];
      applyToAll?: boolean;
      behavior: "adjust" | "keep";
    }
  ) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; timingMap: TimingMapV2 }>(
      editorId,
      `/editors/${editorId}/timing/meter`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ),
  setLaneTimelineOffset: (
    editorId: string,
    laneId: string,
    payload: {
      expectedVersion?: number;
      timelineOffsetFrames: number;
      applyToImportGroup?: boolean;
    }
  ) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; laneIds: string[]; timelineOffsetFrames: number }>(
      editorId,
      `/editors/${editorId}/canvas/lanes/${encodeURIComponent(laneId)}/offset`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ),
  mergeTracks: (
    editorId: string,
    payload: { expectedVersion: number; laneIds: string[]; name?: string; keepOriginals?: boolean }
  ) =>
    requestForEditor<{
      ok: true;
      canvas: CanvasSnapshot;
      mergedLaneId: string;
      sourceLaneIds: string[];
      keptOriginals: boolean;
    }>(editorId, `/editors/${editorId}/canvas/tracks/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
  addCanvasEditor: (
    editorId: string,
    name?: string,
    options?: {
      editorType?: "tab" | "chords" | "drums" | string;
      trackType?: "tab" | "chords" | "drums" | string;
      type?: "tab" | "chords" | "drums" | string;
      chordEditor?: Record<string, unknown>;
    }
  ) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; editor: EditorSnapshot }>(
      editorId,
      `/editors/${editorId}/canvas/editors`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...options }),
      }
    ),
  importEditorJson: (canvasId: string, laneId: string, payload: unknown) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot; canvas: CanvasSnapshot }>(
      canvasId,
      `/editors/${canvasId}__ed__${laneId}/import_json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ),
  saveDrumNote: (
    canvasId: string,
    laneId: string,
    note: { id: number; startTime: number; length: number; tab: [number, number] }
  ) =>
    requestForEditor<{ ok: true; note: EditorSnapshot["notes"][number]; canvas: CanvasSnapshot }>(
      canvasId,
      `/editors/${canvasId}__ed__${laneId}/drum_hits`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note),
      }
    ),
  saveDrumNotes: (
    canvasId: string,
    laneId: string,
    notes: Array<{
      id: number;
      startTime: number;
      length: number;
      tab: [number, number];
    }>
  ) =>
    requestForEditor<{
      ok: true;
      notes: EditorSnapshot["notes"];
      canvas: CanvasSnapshot;
    }>(
      canvasId,
      `/editors/${canvasId}__ed__${laneId}/drum_hits/batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      }
    ),
  deleteDrumNote: (canvasId: string, laneId: string, noteId: number) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot }>(
      canvasId,
      `/editors/${canvasId}__ed__${laneId}/drum_hits/${noteId}`,
      { method: "DELETE" }
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
  addNoteEffect: (editorId: string, note1Id: number, note2Id: number, type: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/note-effects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note1Id, note2Id, type }),
    }),
  deleteNoteEffect: (editorId: string, effectId: number) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/note-effects/${effectId}`, {
      method: "DELETE",
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
  getChordFingerings: (root: string, type: string) =>
    request<{ fingerings: ChordFingering[] }>(
      `/api/chord-fingerings?root=${encodeURIComponent(root)}&type=${encodeURIComponent(type)}`,
      {},
      ""
    ),
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
  exportAsciiTab: (editorId: string) =>
    requestForEditor<{
      tabText: string;
      lines: string[];
      beatsPerBar: number;
      charactersPerBar: number;
    }>(editorId, `/editors/${editorId}/export_ascii`),
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
  importAsciiTab: (
    editorId: string,
    payload: {
      text: string;
      name?: string;
    }
  ) =>
    requestForEditor<{ ok: true; canvas: CanvasSnapshot; editor: EditorSnapshot }>(
      editorId,
      `/editors/${editorId}/canvas/import_ascii`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ),
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
  generateCuts: (
    editorId: string,
    payload?: {
      tuning?: EditorSnapshot["tuning"];
      maxFret?: number;
    }
  ) =>
    requestForEditor<{ ok: true; snapshot: EditorSnapshot }>(editorId, `/editors/${editorId}/cuts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
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
