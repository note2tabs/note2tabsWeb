import { GetServerSideProps } from "next";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type UIEvent as ReactUiEvent,
} from "react";
import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import { authOptions } from "../api/auth/[...nextauth]";
import { useRouter } from "next/router";
import { buildLaneEditorRef, gteApi } from "../../lib/gteApi";
import {
  buildMetronomeClicks,
  equalPowerPanGains,
  frameDeltaToSeconds,
  nextSpeedTrainerValue,
  normalizePlaybackSpeed,
  normalizeTrackPan,
  resolvePracticeLoopRange,
} from "../../lib/gtePractice";
import {
  DEFAULT_TRACK_INSTRUMENT_ID,
  getBuiltinTrackInstrumentOptions,
  loadTrackInstrumentOptions,
  normalizeTrackInstrumentId,
  prepareTrackInstrument,
  schedulePreparedTrackNote,
  type TrackInstrumentOption,
  warmTrackInstrument,
} from "../../lib/gteSoundfonts";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";
import GteWorkspace from "../../components/GteWorkspace";
import {
  GTE_GUEST_EDITOR_ID,
  createGuestSnapshot,
  readGuestDraft,
} from "../../lib/gteGuestDraft";
import { TUNING_PRESETS, applyTuningToSnapshot, getSnapshotTuning, normalizeCapo } from "../../lib/gteTuning";
import NoIndexHead from "../../components/NoIndexHead";

type Props = {
  editorId: string;
  isGuestMode: boolean;
};

const FIXED_FRAMES_PER_BAR = 480;
const DEFAULT_SECONDS_PER_BAR = 2;
const CANVAS_AUTOSAVE_MS = 20000;
const MAX_CANVAS_HISTORY = 64;
const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40];
const TIMELINE_ZOOM_MIN = 10;
const TIMELINE_ZOOM_MAX = 250;
const TIMELINE_ZOOM_DEFAULT = 100;
const CONTROL_COMMIT_DEBOUNCE_MS = 350;
const MOBILE_EDITOR_BREAKPOINT_PX = 768;
const GTE_GUEST_CANVAS_STORAGE_KEY = "note2tabs:gte:guest-canvas:v1";

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "image",
  "hidden",
]);

const isShortcutTextEntryTarget = (target: HTMLElement | null) => {
  if (!target) return false;
  if (target.isContentEditable || target.closest("textarea, select")) return true;
  const input = target.closest("input");
  if (!(input instanceof HTMLInputElement)) return false;
  const type = (input.type || "text").toLowerCase();
  return !NON_TEXT_INPUT_TYPES.has(type);
};

const blurFocusedShortcutControl = (target: HTMLElement | null) => {
  const focusedControl = target?.closest("button, a, input[type='range']");
  if (focusedControl instanceof HTMLElement) {
    focusedControl.blur();
  }
};

const fpsFromSecondsPerBar = (secondsPerBar: number) =>
  Math.max(1, Math.round(FIXED_FRAMES_PER_BAR / Math.max(0.1, secondsPerBar)));

const isCanvasSnapshot = (value: unknown): value is CanvasSnapshot =>
  Boolean(value && typeof value === "object" && Array.isArray((value as CanvasSnapshot).editors));

const normalizeLane = (
  lane: EditorSnapshot,
  laneId: string,
  secondsPerBar: number,
  index: number
): EditorSnapshot => {
  const safeSeconds = Math.max(0.1, toNumber(secondsPerBar, toNumber(lane.secondsPerBar, DEFAULT_SECONDS_PER_BAR)));
  const totalFrames = Math.max(FIXED_FRAMES_PER_BAR, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR)));
  const rawName = typeof lane.name === "string" ? lane.name.trim() : "";
  const defaultNamePattern = /^(editor|transcription)\s+\d+$/i;
  const laneName = !rawName || defaultNamePattern.test(rawName) ? `Tab ${index + 1}` : rawName;
  return {
    ...lane,
    id: laneId,
    name: laneName,
    instrumentId: normalizeTrackInstrumentId(lane.instrumentId),
    framesPerMessure: FIXED_FRAMES_PER_BAR,
    secondsPerBar: safeSeconds,
    fps: fpsFromSecondsPerBar(safeSeconds),
    totalFrames,
    timeSignature: Math.max(1, Math.min(64, Math.round(toNumber(lane.timeSignature, 8)))),
    notes: Array.isArray(lane.notes) ? lane.notes : [],
    chords: Array.isArray(lane.chords) ? lane.chords : [],
    cutPositionsWithCoords:
      Array.isArray(lane.cutPositionsWithCoords) && lane.cutPositionsWithCoords.length
        ? lane.cutPositionsWithCoords
        : [[[0, totalFrames], [2, 0]]],
    optimalsByTime:
      lane.optimalsByTime && typeof lane.optimalsByTime === "object" ? lane.optimalsByTime : {},
    tabRef: Array.isArray(lane.tabRef) ? lane.tabRef : createGuestSnapshot(laneId).tabRef,
  };
};

const normalizeCanvas = (raw: unknown, fallbackCanvasId: string): CanvasSnapshot => {
  if (isCanvasSnapshot(raw)) {
    const safeSeconds = Math.max(
      0.1,
      toNumber(raw.secondsPerBar, toNumber(raw.editors?.[0]?.secondsPerBar, DEFAULT_SECONDS_PER_BAR))
    );
    const normalizedEditors = (raw.editors || []).map((lane, index) =>
      normalizeLane(lane, lane.id || `ed-${index + 1}`, safeSeconds, index)
    );
    return {
      id: raw.id || fallbackCanvasId,
      name: raw.name || "Untitled",
      schemaVersion: raw.schemaVersion,
      canvasSchemaVersion: raw.canvasSchemaVersion,
      version: raw.version,
      updatedAt: raw.updatedAt,
      secondsPerBar: safeSeconds,
      editors: normalizedEditors.length
        ? normalizedEditors
        : [normalizeLane(createGuestSnapshot("ed-1"), "ed-1", safeSeconds, 0)],
    };
  }

  const lane = normalizeLane(
    (raw as EditorSnapshot) || createGuestSnapshot("ed-1"),
    "ed-1",
    toNumber((raw as EditorSnapshot)?.secondsPerBar, DEFAULT_SECONDS_PER_BAR),
    0
  );
  return {
    id: fallbackCanvasId,
    name: lane.name || "Untitled",
    schemaVersion: 1,
    canvasSchemaVersion: 1,
    version: lane.version || 1,
    updatedAt: lane.updatedAt,
    secondsPerBar: lane.secondsPerBar || DEFAULT_SECONDS_PER_BAR,
    editors: [lane],
  };
};

type BarSelectionState = {
  laneId: string;
  barIndices: number[];
};

type BarDragState = {
  sourceLaneId: string;
  barIndices: number[];
};

const getLaneBarCount = (lane: EditorSnapshot) =>
  Math.max(
    1,
    Math.ceil(
      Math.max(FIXED_FRAMES_PER_BAR, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR))) /
        FIXED_FRAMES_PER_BAR
    )
  );

const normalizeTimeSignature = (value: unknown) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return null;
  return Math.max(1, Math.min(64, Math.round(next)));
};

const normalizeBpm = (value: unknown) => {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return null;
  return Math.max(1, next);
};

const secondsPerBarToBpm = (secondsPerBar: unknown, beatsPerBar: unknown) => {
  const seconds = Math.max(0.1, toNumber(secondsPerBar, DEFAULT_SECONDS_PER_BAR));
  const beats = normalizeTimeSignature(beatsPerBar) ?? 8;
  return (60 / seconds) * beats;
};

const bpmToSecondsPerBar = (bpm: unknown, beatsPerBar: unknown) => {
  const normalizedBpm = normalizeBpm(bpm);
  const beats = normalizeTimeSignature(beatsPerBar) ?? 8;
  if (!normalizedBpm) return null;
  return Math.max(0.1, (60 / normalizedBpm) * beats);
};

const formatBpm = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const normalizeTrackVolume = (value: unknown) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return 1;
  return Math.max(0, Math.min(1, next));
};

type GuestCanvasDraftRecord = {
  version: 1;
  savedAt: string;
  canvas: CanvasSnapshot;
};

const readGuestCanvasDraft = (): CanvasSnapshot | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(GTE_GUEST_CANVAS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestCanvasDraftRecord | CanvasSnapshot;
    const canvas =
      parsed && typeof parsed === "object" && "canvas" in parsed
        ? (parsed as GuestCanvasDraftRecord).canvas
        : (parsed as CanvasSnapshot);
    if (!canvas || typeof canvas !== "object" || !Array.isArray(canvas.editors)) return null;
    return canvas;
  } catch {
    return null;
  }
};

const writeGuestCanvasDraft = (canvas: CanvasSnapshot) => {
  if (typeof window === "undefined") return;
  const payload: GuestCanvasDraftRecord = {
    version: 1,
    savedAt: new Date().toISOString(),
    canvas,
  };
  window.localStorage.setItem(GTE_GUEST_CANVAS_STORAGE_KEY, JSON.stringify(payload));
};

const normalizeBarIndices = (lane: EditorSnapshot, barIndices: number[]) => {
  const barCount = getLaneBarCount(lane);
  return Array.from(
    new Set(
      barIndices
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= 0 && value < barCount)
    )
  ).sort((left, right) => left - right);
};

const buildDefaultCutRegions = (totalFrames: number): EditorSnapshot["cutPositionsWithCoords"] => [
  [[0, Math.max(FIXED_FRAMES_PER_BAR, Math.round(toNumber(totalFrames, FIXED_FRAMES_PER_BAR)))], [2, 0]],
];

const isSameTabCoord = (left: [number, number], right: [number, number]) =>
  left[0] === right[0] && left[1] === right[1];

const cloneCutRegion = (region: EditorSnapshot["cutPositionsWithCoords"][number]) => [
  [Number(region[0][0]), Number(region[0][1])],
  [Number(region[1][0]), Number(region[1][1])],
] as EditorSnapshot["cutPositionsWithCoords"][number];

const cleanLaneCutSegments = (lane: EditorSnapshot): EditorSnapshot => {
  const totalFrames = Math.max(
    FIXED_FRAMES_PER_BAR,
    Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR))
  );
  const normalizedRegions = (Array.isArray(lane.cutPositionsWithCoords) ? lane.cutPositionsWithCoords : [])
    .map((region) => {
      const start = Math.max(0, Math.min(totalFrames - 1, Math.round(toNumber(region?.[0]?.[0], 0))));
      const end = Math.max(start + 1, Math.min(totalFrames, Math.round(toNumber(region?.[0]?.[1], totalFrames))));
      const coord: [number, number] = [
        Math.round(toNumber(region?.[1]?.[0], 2)),
        Math.round(toNumber(region?.[1]?.[1], 0)),
      ];
      return [[start, end], coord] as EditorSnapshot["cutPositionsWithCoords"][number];
    })
    .filter((region) => region[0][1] > region[0][0])
    .sort((left, right) => left[0][0] - right[0][0]);

  const merged: EditorSnapshot["cutPositionsWithCoords"] = [];
  normalizedRegions.forEach((region) => {
    const last = merged[merged.length - 1];
    if (last && isSameTabCoord(last[1], region[1])) {
      last[0][1] = Math.max(last[0][1], region[0][1]);
      return;
    }
    merged.push(cloneCutRegion(region));
  });

  return {
    ...lane,
    cutPositionsWithCoords: merged.length ? merged : buildDefaultCutRegions(totalFrames),
  };
};

const cleanCanvasCutSegments = (canvas: CanvasSnapshot): CanvasSnapshot => ({
  ...canvas,
  editors: canvas.editors.map((lane) => cleanLaneCutSegments(lane)),
});

const selectBarsFromLane = (lane: EditorSnapshot, barIndices: number[]): EditorSnapshot | null => {
  const normalized = normalizeBarIndices(lane, barIndices);
  if (!normalized.length) return null;

  const notes: EditorSnapshot["notes"] = [];
  const chords: EditorSnapshot["chords"] = [];
  const cutPositionsWithCoords: EditorSnapshot["cutPositionsWithCoords"] = [];

  normalized.forEach((barIndex, outputIndex) => {
    const barStart = barIndex * FIXED_FRAMES_PER_BAR;
    const barEnd = barStart + FIXED_FRAMES_PER_BAR;
    const outputStart = outputIndex * FIXED_FRAMES_PER_BAR;
    const offset = outputStart - barStart;

    lane.notes.forEach((note) => {
      const noteStart = Math.round(toNumber(note.startTime, 0));
      if (noteStart < barStart || noteStart >= barEnd) return;
      notes.push({
        ...note,
        id: notes.length + 1,
        startTime: noteStart + offset,
        length: Math.max(1, Math.round(toNumber(note.length, 1))),
        tab: [note.tab[0], note.tab[1]],
        optimals: Array.isArray(note.optimals)
          ? note.optimals.map((tab) => [tab[0], tab[1]] as [number, number])
          : [],
      });
    });

    lane.chords.forEach((chord) => {
      const chordStart = Math.round(toNumber(chord.startTime, 0));
      if (chordStart < barStart || chordStart >= barEnd) return;
      chords.push({
        ...chord,
        id: chords.length + 1,
        startTime: chordStart + offset,
        length: Math.max(1, Math.round(toNumber(chord.length, 1))),
        originalMidi: Array.isArray(chord.originalMidi) ? [...chord.originalMidi] : [],
        currentTabs: Array.isArray(chord.currentTabs)
          ? chord.currentTabs.map((tab) => [tab[0], tab[1]] as [number, number])
          : [],
        ogTabs: Array.isArray(chord.ogTabs)
          ? chord.ogTabs.map((tab) => [tab[0], tab[1]] as [number, number])
          : [],
      });
    });

    lane.cutPositionsWithCoords.forEach((cutRegion) => {
      const start = Math.round(toNumber(cutRegion[0]?.[0], barStart));
      const end = Math.round(toNumber(cutRegion[0]?.[1], barEnd));
      const overlapStart = Math.max(barStart, start);
      const overlapEnd = Math.min(barEnd, end);
      if (overlapEnd <= overlapStart) return;
      const coord = [
        Math.round(toNumber(cutRegion[1]?.[0], 2)),
        Math.round(toNumber(cutRegion[1]?.[1], 0)),
      ] as [number, number];
      cutPositionsWithCoords.push([
        [overlapStart - barStart + outputStart, overlapEnd - barStart + outputStart],
        coord,
      ]);
    });
  });

  const totalFrames = normalized.length * FIXED_FRAMES_PER_BAR;
  return normalizeLane(
    {
      ...lane,
      id: "clipboard",
      name: "Clipboard",
      version: 1,
      totalFrames,
      notes,
      chords,
      cutPositionsWithCoords: cutPositionsWithCoords.length
        ? cutPositionsWithCoords
        : buildDefaultCutRegions(totalFrames),
      optimalsByTime: {},
    },
    "clipboard",
    Math.max(0.1, toNumber(lane.secondsPerBar, DEFAULT_SECONDS_PER_BAR)),
    0
  );
};

const insertBarsIntoLane = (
  lane: EditorSnapshot,
  insertIndex: number,
  clipboard: EditorSnapshot
): EditorSnapshot | null => {
  const totalBars = getLaneBarCount(lane);
  const safeInsertIndex = Math.max(0, Math.min(totalBars, Math.round(toNumber(insertIndex, 0))));
  const clipLength = Math.max(
    FIXED_FRAMES_PER_BAR,
    Math.round(toNumber(clipboard.totalFrames, FIXED_FRAMES_PER_BAR))
  );
  const insertFrame = safeInsertIndex * FIXED_FRAMES_PER_BAR;

  let nextNoteId = lane.notes.reduce((max, note) => Math.max(max, Math.round(toNumber(note.id, 0))), 0) + 1;
  let nextChordId =
    lane.chords.reduce((max, chord) => Math.max(max, Math.round(toNumber(chord.id, 0))), 0) + 1;

  const shiftedCuts: EditorSnapshot["cutPositionsWithCoords"] = [];
  lane.cutPositionsWithCoords.forEach((cutRegion) => {
    const start = Math.round(toNumber(cutRegion[0]?.[0], 0));
    const end = Math.round(toNumber(cutRegion[0]?.[1], start));
    const coord = [
      Math.round(toNumber(cutRegion[1]?.[0], 2)),
      Math.round(toNumber(cutRegion[1]?.[1], 0)),
    ] as [number, number];
    if (start < insertFrame && end > insertFrame) {
      shiftedCuts.push([[start, insertFrame], [...coord] as [number, number]]);
      shiftedCuts.push([[insertFrame + clipLength, end + clipLength], [...coord] as [number, number]]);
      return;
    }
    if (start >= insertFrame) {
      shiftedCuts.push([[start + clipLength, end + clipLength], coord]);
      return;
    }
    shiftedCuts.push([[start, end], coord]);
  });

  clipboard.cutPositionsWithCoords.forEach((cutRegion) => {
    const cloned = cloneCutRegion(cutRegion);
    shiftedCuts.push([
      [cloned[0][0] + insertFrame, cloned[0][1] + insertFrame],
      [cloned[1][0], cloned[1][1]],
    ]);
  });

  const nextNotes = [
    ...lane.notes.map((note) => {
      const noteStart = Math.round(toNumber(note.startTime, 0));
      if (noteStart < insertFrame) return note;
      return { ...note, startTime: noteStart + clipLength };
    }),
    ...clipboard.notes.map((note) => ({
      ...note,
      id: nextNoteId++,
      startTime: Math.round(toNumber(note.startTime, 0)) + insertFrame,
      length: Math.max(1, Math.round(toNumber(note.length, 1))),
      tab: [note.tab[0], note.tab[1]] as [number, number],
      optimals: Array.isArray(note.optimals)
        ? note.optimals.map((tab) => [tab[0], tab[1]] as [number, number])
        : [],
    })),
  ].sort((left, right) => left.startTime - right.startTime || left.id - right.id);

  const nextChords = [
    ...lane.chords.map((chord) => {
      const chordStart = Math.round(toNumber(chord.startTime, 0));
      if (chordStart < insertFrame) return chord;
      return { ...chord, startTime: chordStart + clipLength };
    }),
    ...clipboard.chords.map((chord) => ({
      ...chord,
      id: nextChordId++,
      startTime: Math.round(toNumber(chord.startTime, 0)) + insertFrame,
      length: Math.max(1, Math.round(toNumber(chord.length, 1))),
      originalMidi: Array.isArray(chord.originalMidi) ? [...chord.originalMidi] : [],
      currentTabs: Array.isArray(chord.currentTabs)
        ? chord.currentTabs.map((tab) => [tab[0], tab[1]] as [number, number])
        : [],
      ogTabs: Array.isArray(chord.ogTabs)
        ? chord.ogTabs.map((tab) => [tab[0], tab[1]] as [number, number])
        : [],
    })),
  ].sort((left, right) => left.startTime - right.startTime || left.id - right.id);

  const nextTotalFrames =
    Math.max(FIXED_FRAMES_PER_BAR, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR))) + clipLength;

  return normalizeLane(
    {
      ...lane,
      totalFrames: nextTotalFrames,
      notes: nextNotes,
      chords: nextChords,
      cutPositionsWithCoords: shiftedCuts.length ? shiftedCuts : buildDefaultCutRegions(nextTotalFrames),
    },
    lane.id,
    Math.max(0.1, toNumber(lane.secondsPerBar, DEFAULT_SECONDS_PER_BAR)),
    0
  );
};

const removeSingleBarFromLane = (lane: EditorSnapshot, index: number): EditorSnapshot | null => {
  const totalBars = getLaneBarCount(lane);
  if (totalBars <= 1) return null;

  const safeIndex = Math.max(0, Math.min(totalBars - 1, Math.round(toNumber(index, 0))));
  const removeStart = safeIndex * FIXED_FRAMES_PER_BAR;
  const removeEnd = removeStart + FIXED_FRAMES_PER_BAR;

  const nextNotes = lane.notes
    .filter((note) => {
      const start = Math.round(toNumber(note.startTime, 0));
      const end = start + Math.max(1, Math.round(toNumber(note.length, 1)));
      return end <= removeStart || start >= removeEnd;
    })
    .map((note) => {
      const start = Math.round(toNumber(note.startTime, 0));
      if (start < removeEnd) return note;
      return { ...note, startTime: start - FIXED_FRAMES_PER_BAR };
    });

  const nextChords = lane.chords
    .filter((chord) => {
      const start = Math.round(toNumber(chord.startTime, 0));
      const end = start + Math.max(1, Math.round(toNumber(chord.length, 1)));
      return end <= removeStart || start >= removeEnd;
    })
    .map((chord) => {
      const start = Math.round(toNumber(chord.startTime, 0));
      if (start < removeEnd) return chord;
      return { ...chord, startTime: start - FIXED_FRAMES_PER_BAR };
    });

  const nextCuts: EditorSnapshot["cutPositionsWithCoords"] = [];
  lane.cutPositionsWithCoords.forEach((cutRegion) => {
    const start = Math.round(toNumber(cutRegion[0]?.[0], 0));
    const end = Math.round(toNumber(cutRegion[0]?.[1], start));
    const coord = [
      Math.round(toNumber(cutRegion[1]?.[0], 2)),
      Math.round(toNumber(cutRegion[1]?.[1], 0)),
    ] as [number, number];
    if (end <= removeStart) {
      nextCuts.push([[start, end], coord]);
      return;
    }
    if (start >= removeEnd) {
      nextCuts.push([[start - FIXED_FRAMES_PER_BAR, end - FIXED_FRAMES_PER_BAR], coord]);
      return;
    }
    if (start < removeStart) {
      nextCuts.push([[start, removeStart], [...coord] as [number, number]]);
    }
    if (end > removeEnd) {
      nextCuts.push([[removeStart, end - FIXED_FRAMES_PER_BAR], [...coord] as [number, number]]);
    }
  });

  const nextTotalFrames = Math.max(
    FIXED_FRAMES_PER_BAR,
    Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR)) - FIXED_FRAMES_PER_BAR
  );

  return normalizeLane(
    {
      ...lane,
      totalFrames: nextTotalFrames,
      notes: nextNotes,
      chords: nextChords,
      cutPositionsWithCoords: nextCuts.length ? nextCuts : buildDefaultCutRegions(nextTotalFrames),
    },
    lane.id,
    Math.max(0.1, toNumber(lane.secondsPerBar, DEFAULT_SECONDS_PER_BAR)),
    0
  );
};

const deleteBarsFromLane = (lane: EditorSnapshot, barIndices: number[]): EditorSnapshot | null => {
  const normalized = normalizeBarIndices(lane, barIndices).sort((left, right) => right - left);
  if (!normalized.length || normalized.length >= getLaneBarCount(lane)) return null;
  let nextLane: EditorSnapshot = lane;
  for (const barIndex of normalized) {
    const updated = removeSingleBarFromLane(nextLane, barIndex);
    if (!updated) return null;
    nextLane = updated;
  }
  return nextLane;
};

const insertBarsIntoCanvas = (
  canvas: CanvasSnapshot,
  laneId: string,
  insertIndex: number,
  clipboard: EditorSnapshot
): CanvasSnapshot | null => {
  const laneIndex = canvas.editors.findIndex((lane) => lane.id === laneId);
  if (laneIndex < 0) return null;
  const nextLane = insertBarsIntoLane(canvas.editors[laneIndex], insertIndex, clipboard);
  if (!nextLane) return null;
  const nextEditors = [...canvas.editors];
  nextEditors[laneIndex] = nextLane;
  return normalizeCanvas(
    {
      ...canvas,
      editors: nextEditors,
      updatedAt: new Date().toISOString(),
    },
    canvas.id
  );
};

const deleteBarsFromCanvas = (
  canvas: CanvasSnapshot,
  laneId: string,
  barIndices: number[]
): CanvasSnapshot | null => {
  const laneIndex = canvas.editors.findIndex((lane) => lane.id === laneId);
  if (laneIndex < 0) return null;
  const lane = canvas.editors[laneIndex];
  const normalized = normalizeBarIndices(lane, barIndices);
  if (!normalized.length) return null;
  if (normalized.length >= getLaneBarCount(lane)) {
    if (canvas.editors.length <= 1) return null;
    const nextEditors = canvas.editors.filter((item) => item.id !== laneId);
    return normalizeCanvas(
      {
        ...canvas,
        editors: nextEditors,
        updatedAt: new Date().toISOString(),
      },
      canvas.id
    );
  }
  const nextLane = deleteBarsFromLane(lane, normalized);
  if (!nextLane) return null;
  const nextEditors = [...canvas.editors];
  nextEditors[laneIndex] = nextLane;
  return normalizeCanvas(
    {
      ...canvas,
      editors: nextEditors,
      updatedAt: new Date().toISOString(),
    },
    canvas.id
  );
};

const moveBarsInCanvas = (
  canvas: CanvasSnapshot,
  sourceLaneId: string,
  targetLaneId: string,
  barIndices: number[],
  insertIndex: number
): CanvasSnapshot | null => {
  const sourceIndex = canvas.editors.findIndex((lane) => lane.id === sourceLaneId);
  const targetIndex = canvas.editors.findIndex((lane) => lane.id === targetLaneId);
  if (sourceIndex < 0 || targetIndex < 0) return null;

  const sourceLane = canvas.editors[sourceIndex];
  const normalized = normalizeBarIndices(sourceLane, barIndices);
  if (!normalized.length) return null;

  const clipboard = selectBarsFromLane(sourceLane, normalized);
  if (!clipboard) return null;

  const sourceBarCount = getLaneBarCount(sourceLane);
  const nextEditors = [...canvas.editors];
  if (sourceIndex === targetIndex) {
    if (normalized.length >= sourceBarCount) return null;
    const barsBeforeInsert = normalized.filter((barIndex) => barIndex < insertIndex).length;
    const adjustedInsert = Math.max(
      0,
      Math.min(
        Math.round(toNumber(insertIndex, 0)) - barsBeforeInsert,
        sourceBarCount - normalized.length
      )
    );
    const afterDelete = deleteBarsFromLane(sourceLane, normalized);
    if (!afterDelete) return null;
    const afterInsert = insertBarsIntoLane(afterDelete, adjustedInsert, clipboard);
    if (!afterInsert) return null;
    nextEditors[sourceIndex] = afterInsert;
  } else {
    if (normalized.length >= sourceBarCount) {
      const nextTarget = insertBarsIntoLane(canvas.editors[targetIndex], insertIndex, clipboard);
      if (!nextTarget) return null;
      const nextEditorsWithoutSource = canvas.editors
        .filter((lane) => lane.id !== sourceLaneId)
        .map((lane) => (lane.id === targetLaneId ? nextTarget : lane));
      return normalizeCanvas(
        {
          ...canvas,
          editors: nextEditorsWithoutSource,
          updatedAt: new Date().toISOString(),
        },
        canvas.id
      );
    }
    const nextTarget = insertBarsIntoLane(canvas.editors[targetIndex], insertIndex, clipboard);
    if (!nextTarget) return null;
    const nextSource = deleteBarsFromLane(sourceLane, normalized);
    if (!nextSource) return null;
    nextEditors[sourceIndex] = nextSource;
    nextEditors[targetIndex] = nextTarget;
  }

  return normalizeCanvas(
    {
      ...canvas,
      editors: nextEditors,
      updatedAt: new Date().toISOString(),
    },
    canvas.id
  );
};

export default function GteEditorPage({ editorId, isGuestMode }: Props) {
  const { data: session } = useSession();
  const [canvas, setCanvas] = useState<CanvasSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameEditing, setNameEditing] = useState(false);
  const [bpmDraft, setBpmDraft] = useState(formatBpm(secondsPerBarToBpm(DEFAULT_SECONDS_PER_BAR, 8)));
  const [bpmSaving, setBpmSaving] = useState(false);
  const [bpmError, setBpmError] = useState<string | null>(null);
  const [timeSignatureDraft, setTimeSignatureDraft] = useState("8");
  const [timeSignatureSaving, setTimeSignatureSaving] = useState(false);
  const [timeSignatureError, setTimeSignatureError] = useState<string | null>(null);
  const [activeLaneId, setActiveLaneId] = useState<string | null>(null);
  const [mobileEditLaneId, setMobileEditLaneId] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [savingCanvas, setSavingCanvas] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasPendingCommit, setHasPendingCommit] = useState(false);
  const [lastCommittedAt, setLastCommittedAt] = useState<string | null>(null);
  const [addingLane, setAddingLane] = useState(false);
  const [deletingLaneId, setDeletingLaneId] = useState<string | null>(null);
  const [confirmDeleteTrackId, setConfirmDeleteTrackId] = useState<string | null>(null);
  const [openTrackMenuId, setOpenTrackMenuId] = useState<string | null>(null);
  const [openMobileBarMenuLaneId, setOpenMobileBarMenuLaneId] = useState<string | null>(null);
  const [globalSnapToGridEnabled, setGlobalSnapToGridEnabled] = useState(true);
  const [timelineZoomPercent, setTimelineZoomPercent] = useState(TIMELINE_ZOOM_DEFAULT);
  const [sharedTimelineScrollRatio, setSharedTimelineScrollRatio] = useState(0);
  const [globalPlaybackFrame, setGlobalPlaybackFrame] = useState(0);
  const [globalPlaybackIsPlaying, setGlobalPlaybackIsPlaying] = useState(false);
  const [globalPlaybackVolume, setGlobalPlaybackVolume] = useState(0.6);
  const [practiceLoopEnabled, setPracticeLoopEnabled] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [countInEnabled, setCountInEnabled] = useState(false);
  const [speedTrainerEnabled, setSpeedTrainerEnabled] = useState(false);
  const [speedTrainerTarget, setSpeedTrainerTarget] = useState(1.5);
  const [speedTrainerStep, setSpeedTrainerStep] = useState(0.05);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [trackMuteById, setTrackMuteById] = useState<Record<string, boolean>>({});
  const [trackVolumeById, setTrackVolumeById] = useState<Record<string, number>>({});
  const [trackPanById, setTrackPanById] = useState<Record<string, number>>({});
  const [isolatedTrackId, setIsolatedTrackId] = useState<string | null>(null);
  const [laneSelectionById, setLaneSelectionById] = useState<
    Record<string, { noteCount: number; chordCount: number; noteIds: number[]; chordIds: number[] }>
  >({});
  const [selectionClearEpoch, setSelectionClearEpoch] = useState(0);
  const [selectionClearExemptEditorId, setSelectionClearExemptEditorId] = useState<string | null>(
    null
  );
  const [barSelectionClearEpoch, setBarSelectionClearEpoch] = useState(0);
  const [barSelectionClearExemptEditorId, setBarSelectionClearExemptEditorId] = useState<
    string | null
  >(null);
  const [barSelection, setBarSelection] = useState<BarSelectionState | null>(null);
  const [barClipboard, setBarClipboard] = useState<EditorSnapshot | null>(null);
  const [barDragState, setBarDragState] = useState<BarDragState | null>(null);
  const [pendingTrackReorder, setPendingTrackReorder] = useState<{
    laneId: string;
    startY: number;
  } | null>(null);
  const [trackDragLaneId, setTrackDragLaneId] = useState<string | null>(null);
  const [trackDropIndex, setTrackDropIndex] = useState<number | null>(null);
  const [trackInstrumentOptions, setTrackInstrumentOptions] = useState<TrackInstrumentOption[]>(
    getBuiltinTrackInstrumentOptions()
  );
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const globalPlaybackFrameRef = useRef(0);
  const bpmCommitTimerRef = useRef<number | null>(null);
  const queuedBpmValueRef = useRef<string | number | null>(null);
  const timeSignatureCommitTimerRef = useRef<number | null>(null);
  const queuedTimeSignatureValueRef = useRef<string | number | null>(null);
  const [canvasUndoCount, setCanvasUndoCount] = useState(0);
  const [canvasRedoCount, setCanvasRedoCount] = useState(0);
  const telemetrySessionRef = useRef<string | null>(null);
  const telemetryStartedAtRef = useRef<number | null>(null);
  const telemetryClosedRef = useRef(false);
  const globalTimelineScrollbarRef = useRef<HTMLDivElement | null>(null);
  const applyingGlobalTimelineScrollbarRef = useRef(false);
  const globalPlaybackAudioRef = useRef<AudioContext | null>(null);
  const globalPlaybackMasterGainRef = useRef<GainNode | null>(null);
  const globalPlaybackRafRef = useRef<number | null>(null);
  const globalPlaybackStartRequestRef = useRef(0);
  const globalPlaybackStartPendingRef = useRef(false);
  const globalPlaybackStartTimeRef = useRef<number | null>(null);
  const globalPlaybackStartFrameRef = useRef(0);
  const globalPlaybackEndFrameRef = useRef<number | null>(null);
  const globalPlaybackAudioStartRef = useRef<number | null>(null);
  const previousTrackPlaybackStateSignatureRef = useRef<string | null>(null);
  const previousTrackInstrumentSignatureRef = useRef<string | null>(null);
  const canvasUndoRef = useRef<CanvasSnapshot[]>([]);
  const canvasRedoRef = useRef<CanvasSnapshot[]>([]);
  const trackSectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const router = useRouter();
  const saveToAccountPath = "/gte?importGuest=1";
  const loginSaveHref = `/auth/login?next=${encodeURIComponent(saveToAccountPath)}`;
  const signupSaveHref = `/auth/signup?next=${encodeURIComponent(saveToAccountPath)}`;
  const transcriberHref = isGuestMode
    ? "/#hero"
    : `/?appendEditorId=${encodeURIComponent(editorId)}#hero`;

  const cloneCanvas = useCallback((value: CanvasSnapshot) => {
    return JSON.parse(JSON.stringify(value)) as CanvasSnapshot;
  }, []);

  const canvasSnapshotsEqual = useCallback((left: CanvasSnapshot, right: CanvasSnapshot) => {
    return JSON.stringify(left) === JSON.stringify(right);
  }, []);

  const resetCanvasHistory = useCallback(() => {
    canvasUndoRef.current = [];
    canvasRedoRef.current = [];
    setCanvasUndoCount(0);
    setCanvasRedoCount(0);
  }, []);

  const recordCanvasHistory = useCallback(
    (previous: CanvasSnapshot, next: CanvasSnapshot) => {
      if (canvasSnapshotsEqual(previous, next)) return;
      const nextUndo = [...canvasUndoRef.current, cloneCanvas(previous)];
      if (nextUndo.length > MAX_CANVAS_HISTORY) {
        nextUndo.splice(0, nextUndo.length - MAX_CANVAS_HISTORY);
      }
      canvasUndoRef.current = nextUndo;
      canvasRedoRef.current = [];
      setCanvasUndoCount(nextUndo.length);
      setCanvasRedoCount(0);
    },
    [canvasSnapshotsEqual, cloneCanvas]
  );

  const loadEditor = async () => {
    if (isGuestMode) return;
    setLoading(true);
    setError(null);
    try {
      const data = await gteApi.getEditor(editorId);
      const normalized = normalizeCanvas(data, editorId);
      setCanvas(normalized);
      resetCanvasHistory();
      setActiveLaneId((prev) =>
        prev && normalized.editors.some((lane) => lane.id === prev) ? prev : normalized.editors[0]?.id || null
      );
      setLastCommittedAt(normalized.updatedAt || null);
      setHasPendingCommit(false);
    } catch (err: any) {
      setError(err?.message || "Could not load editor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!editorId) return;
    setSharedTimelineScrollRatio(0);
    if (isGuestMode) {
      const loadGuestEditor = async () => {
        setLoading(true);
        setError(null);
        try {
          const data = await gteApi.getEditor(editorId);
          let normalized = normalizeCanvas(data, editorId);
          const canvasDraft = readGuestCanvasDraft();
          const legacy = readGuestDraft();
          const hasSessionContent =
            (normalized.name || "Untitled") !== "Untitled" ||
            normalized.editors.some(
              (lane) =>
                lane.notes.length > 0 ||
                lane.chords.length > 0 ||
                lane.cutPositionsWithCoords.length > 1
            );
          if (!hasSessionContent) {
            if (canvasDraft) {
              normalized = normalizeCanvas(canvasDraft, editorId);
              await gteApi.applySnapshot(editorId, normalized);
            } else if (legacy) {
              normalized = normalizeCanvas(
                {
                  id: editorId,
                  name: legacy.name || "Untitled",
                  secondsPerBar: legacy.secondsPerBar,
                  editors: [{ ...legacy, id: "ed-1", name: legacy.name || "Editor 1" }],
                },
                editorId
              );
              await gteApi.applySnapshot(editorId, normalized);
            }
          }
          setCanvas(normalized);
          resetCanvasHistory();
          setActiveLaneId((prev) =>
            prev && normalized.editors.some((lane) => lane.id === prev) ? prev : normalized.editors[0]?.id || null
          );
          setLastCommittedAt(normalized.updatedAt || null);
          setHasPendingCommit(false);
        } catch (err: any) {
          setError(err?.message || "Could not load guest editor.");
        } finally {
          setLoading(false);
        }
      };
      void loadGuestEditor();
      return;
    }
    void loadEditor();
  }, [editorId, isGuestMode, resetCanvasHistory]);

  useEffect(() => {
    if (!isGuestMode || !canvas) return;
    writeGuestCanvasDraft(canvas);
  }, [canvas, isGuestMode]);

  useEffect(() => {
    if (!editorId || isGuestMode) return;

    const createSessionId = () => {
      if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
      return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    };

    const sessionId = createSessionId();
    telemetrySessionRef.current = sessionId;
    telemetryStartedAtRef.current = Date.now();
    telemetryClosedRef.current = false;

    const sendTelemetry = (
      event: "gte_editor_visit" | "gte_editor_session_start" | "gte_editor_session_end",
      durationSec?: number
    ) => {
      const payload = {
        event,
        editorId,
        sessionId,
        path: window.location.pathname,
        ...(durationSec !== undefined ? { durationSec } : {}),
      };
      return fetch("/api/gte/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    };

    void sendTelemetry("gte_editor_visit").catch(() => {});
    void sendTelemetry("gte_editor_session_start").catch(() => {});

    const flushSessionEnd = () => {
      if (telemetryClosedRef.current) return;
      telemetryClosedRef.current = true;
      const startedAt = telemetryStartedAtRef.current ?? Date.now();
      const durationSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      const payload = JSON.stringify({
        event: "gte_editor_session_end",
        editorId,
        sessionId,
        durationSec,
        path: window.location.pathname,
      });

      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/gte/telemetry", blob);
        return;
      }

      void fetch("/api/gte/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    };

    const handlePageHide = () => flushSessionEnd();
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      flushSessionEnd();
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [editorId, isGuestMode]);

  useEffect(() => {
    if (!canvas) return;
    if (!nameEditing) {
      setNameDraft(canvas.name || "Untitled");
    }
    const beatsPerBar = normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8;
    if (queuedBpmValueRef.current === null) {
      setBpmDraft(formatBpm(secondsPerBarToBpm(canvas.secondsPerBar, beatsPerBar)));
    }
    if (queuedTimeSignatureValueRef.current === null) {
      setTimeSignatureDraft(String(beatsPerBar));
    }
    if (activeLaneId && !canvas.editors.some((lane) => lane.id === activeLaneId)) {
      setActiveLaneId(canvas.editors[0]?.id || null);
    }
    if (mobileEditLaneId && !canvas.editors.some((lane) => lane.id === mobileEditLaneId)) {
      setMobileEditLaneId(null);
    }
  }, [canvas?.name, canvas?.secondsPerBar, canvas?.editors, activeLaneId, mobileEditLaneId, nameEditing]);

  useEffect(() => {
    if (!nameEditing || !nameInputRef.current) return;
    nameInputRef.current.focus();
    nameInputRef.current.select();
  }, [nameEditing]);

  useEffect(() => {
    return () => {
      if (bpmCommitTimerRef.current !== null) {
        window.clearTimeout(bpmCommitTimerRef.current);
      }
      if (timeSignatureCommitTimerRef.current !== null) {
        window.clearTimeout(timeSignatureCommitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_EDITOR_BREAKPOINT_PX - 1}px)`);
    const applyViewport = (matches: boolean) => {
      setIsMobileViewport(matches);
      setMobileControlsOpen((prev) => (matches ? prev : false));
      setMobileNavOpen((prev) => (matches ? prev : false));
      if (!matches) {
        setMobileEditLaneId(null);
      }
    };
    applyViewport(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      applyViewport(event.matches);
    };
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadTrackInstrumentOptions().then((options) => {
      if (cancelled) return;
      setTrackInstrumentOptions(options);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canvas) return;
    const instrumentIds = Array.from(
      new Set(canvas.editors.map((lane) => normalizeTrackInstrumentId(lane.instrumentId)))
    );
    if (!instrumentIds.length) return;

    let cancelled = false;
    const warmInstruments = () => {
      if (cancelled) return;
      instrumentIds.forEach((instrumentId) => {
        void warmTrackInstrument(instrumentId);
      });
    };

    const requestIdleCallback = (window as any).requestIdleCallback as
      | ((callback: () => void, options?: { timeout?: number }) => number)
      | undefined;
    const cancelIdleCallback = (window as any).cancelIdleCallback as ((id: number) => void) | undefined;
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(warmInstruments, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(warmInstruments, 350);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [canvas?.editors]);

  const handleMainMouseDownCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (isMobileViewport && mobileEditLaneId) return;
    if (target.closest("[data-gte-track='true']")) return;
    if (target.closest("button, a, input, textarea, select, label, [role='button']")) return;
    setActiveLaneId(null);
  }, [isMobileViewport, mobileEditLaneId]);

  const activateLaneForEditing = useCallback((laneId: string) => {
    setActiveLaneId(laneId);
    setOpenMobileBarMenuLaneId(null);
    setMobileEditLaneId((prev) => (isMobileViewport ? laneId : prev));
  }, [isMobileViewport]);

  const commitCanvasToBackend = useCallback(
    async (options?: { force?: boolean; keepalive?: boolean }) => {
      if (!canvas) return;
      if (isGuestMode) {
        if (!options?.force && !hasPendingCommit) return;
        setSavingCanvas(true);
        setSaveError(null);
        try {
          const res = await gteApi.applySnapshot(editorId, cloneCanvas(canvas));
          const normalized = normalizeCanvas((res as any).canvas ?? res.snapshot ?? canvas, editorId);
          setCanvas(normalized);
          setLastCommittedAt(normalized.updatedAt || new Date().toISOString());
          setHasPendingCommit(false);
        } catch (err: any) {
          setSaveError(err?.message || "Could not save guest session.");
        } finally {
          setSavingCanvas(false);
        }
        return;
      }
      if (!options?.force && !hasPendingCommit) return;
      setSavingCanvas(true);
      setSaveError(null);
      try {
        const res = await gteApi.commitEditor(editorId, { keepalive: options?.keepalive });
        const normalized = normalizeCanvas(res.snapshot, editorId);
        setCanvas(normalized);
        setLastCommittedAt(normalized.updatedAt || new Date().toISOString());
        setHasPendingCommit(false);
      } catch (err: any) {
        setSaveError(err?.message || "Could not save editor.");
      } finally {
        setSavingCanvas(false);
      }
    },
    [canvas, cloneCanvas, editorId, hasPendingCommit, isGuestMode]
  );

  const syncCanvasDraftToBackend = useCallback(
    async (nextCanvas: CanvasSnapshot, options?: { silent?: boolean }) => {
      try {
        await gteApi.applySnapshot(editorId, cloneCanvas(nextCanvas));
      } catch (err: any) {
        if (!options?.silent) {
          setSaveError(err?.message || "Could not sync canvas draft.");
        }
      }
    },
    [cloneCanvas, editorId]
  );

  useEffect(() => {
    if (!hasPendingCommit) return;
    const timer = isGuestMode
      ? setTimeout(() => {
          void commitCanvasToBackend();
        }, 1000)
      : setInterval(() => {
          void commitCanvasToBackend();
        }, CANVAS_AUTOSAVE_MS);
    return () => {
      if (isGuestMode) {
        clearTimeout(timer);
        return;
      }
      clearInterval(timer);
    };
  }, [hasPendingCommit, commitCanvasToBackend, isGuestMode]);

  useEffect(() => {
    const flush = () => {
      if (!hasPendingCommit) return;
      void commitCanvasToBackend({ force: true, keepalive: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [hasPendingCommit, commitCanvasToBackend]);

  const applyCanvasUpdate = useCallback(
    (next: CanvasSnapshot, options?: { markDirty?: boolean; recordHistory?: boolean }) => {
      setCanvas((prev) => {
        if (prev && options?.recordHistory !== false) {
          recordCanvasHistory(prev, next);
        }
        return next;
      });
      if (options?.markDirty !== false) {
        setHasPendingCommit(true);
      }
    },
    [recordCanvasHistory]
  );

  const commitName = async (rawValue: string = nameDraft, options?: { exitEdit?: boolean }) => {
    if (!canvas) return;
    const trimmed = rawValue.trim();
    const normalizedName = trimmed || "Untitled";
    setNameDraft(normalizedName);
    if (normalizedName === (canvas.name || "Untitled")) {
      if (options?.exitEdit) {
        setNameEditing(false);
      }
      return;
    }
    setNameSaving(true);
    setNameError(null);
    try {
      const res = await gteApi.setEditorName(editorId, normalizedName);
      let nextCanvas = normalizeCanvas(
        (res as any).canvas ? (res as any).canvas : (res as any).snapshot,
        editorId
      );
      if (!isGuestMode) {
        const committed = await gteApi.commitEditor(editorId);
        nextCanvas = normalizeCanvas(committed.snapshot, editorId);
      }
      applyCanvasUpdate(nextCanvas, { markDirty: !isGuestMode });
      setNameDraft(nextCanvas.name || normalizedName);
      if (options?.exitEdit) {
        setNameEditing(false);
      }
    } catch (err: any) {
      setNameError(err?.message || "Could not update name.");
    } finally {
      setNameSaving(false);
    }
  };

  const commitBpm = async (rawValue: string | number = bpmDraft) => {
    if (!canvas) return;
    queuedBpmValueRef.current = null;
    if (bpmCommitTimerRef.current !== null) {
      window.clearTimeout(bpmCommitTimerRef.current);
      bpmCommitTimerRef.current = null;
    }
    const nextBpm = normalizeBpm(rawValue);
    const beatsPerBar = normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8;
    if (!nextBpm) {
      setBpmError("BPM must be greater than 0.");
      setBpmDraft(formatBpm(secondsPerBarToBpm(canvas.secondsPerBar, beatsPerBar)));
      return;
    }
    const normalized = bpmToSecondsPerBar(nextBpm, beatsPerBar);
    if (!normalized) return;
    setBpmDraft(formatBpm(nextBpm));
    if (Math.abs(normalized - (canvas.secondsPerBar || DEFAULT_SECONDS_PER_BAR)) < 0.0001) return;
    setBpmSaving(true);
    setBpmError(null);
    try {
      const res = await gteApi.setSecondsPerBar(editorId, normalized);
      const fallbackCanvas = {
        ...canvas,
        secondsPerBar: normalized,
        editors: canvas.editors.map((lane) => ({
          ...lane,
          secondsPerBar: normalized,
        })),
      };
      const nextCanvas = normalizeCanvas((res as any).canvas ?? fallbackCanvas, editorId);
      applyCanvasUpdate(nextCanvas, { markDirty: !isGuestMode });
    } catch (err: any) {
      setBpmError(err?.message || "Could not update BPM.");
    } finally {
      setBpmSaving(false);
    }
  };

  const scheduleBpmCommit = (rawValue: string | number) => {
    queuedBpmValueRef.current = rawValue;
    if (bpmCommitTimerRef.current !== null) {
      window.clearTimeout(bpmCommitTimerRef.current);
    }
    bpmCommitTimerRef.current = window.setTimeout(() => {
      bpmCommitTimerRef.current = null;
      void commitBpm(rawValue);
    }, CONTROL_COMMIT_DEBOUNCE_MS);
  };

  const commitTimeSignature = async (rawValue: string | number = timeSignatureDraft) => {
    if (!canvas) return;
    queuedTimeSignatureValueRef.current = null;
    if (timeSignatureCommitTimerRef.current !== null) {
      window.clearTimeout(timeSignatureCommitTimerRef.current);
      timeSignatureCommitTimerRef.current = null;
    }
    const normalized = normalizeTimeSignature(rawValue);
    if (!normalized) {
      setTimeSignatureDraft(String(normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8));
      return;
    }
    setTimeSignatureDraft(String(normalized));
    const current = normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8;
    const allTracksMatch = canvas.editors.every((lane) => (normalizeTimeSignature(lane.timeSignature) ?? 8) === normalized);
    const currentBpm = normalizeBpm(bpmDraft) ?? secondsPerBarToBpm(canvas.secondsPerBar, current);
    const secondsPerBar = bpmToSecondsPerBar(currentBpm, normalized);
    if (!secondsPerBar) return;
    setBpmDraft(formatBpm(currentBpm));
    const secondsAlreadyMatch = Math.abs(secondsPerBar - (canvas.secondsPerBar || DEFAULT_SECONDS_PER_BAR)) < 0.0001;
    if (normalized === current && allTracksMatch && secondsAlreadyMatch) return;

    setTimeSignatureSaving(true);
    setTimeSignatureError(null);
    try {
      const nextCanvas = normalizeCanvas(
        {
          ...canvas,
          updatedAt: new Date().toISOString(),
          secondsPerBar,
          editors: canvas.editors.map((lane, index) =>
            normalizeLane(
              {
                ...lane,
                secondsPerBar,
                timeSignature: normalized,
              },
              lane.id || `ed-${index + 1}`,
              secondsPerBar,
              index
            )
          ),
        },
        editorId
      );
      const res = await gteApi.applySnapshot(editorId, nextCanvas);
      applyCanvasUpdate(normalizeCanvas((res as any).canvas ?? (res as any).snapshot ?? nextCanvas, editorId), {
        markDirty: !isGuestMode,
      });
    } catch (err: any) {
      setTimeSignatureError(err?.message || "Could not update beats per bar.");
    } finally {
      setTimeSignatureSaving(false);
    }
  };

  const scheduleTimeSignatureCommit = (rawValue: string | number) => {
    queuedTimeSignatureValueRef.current = rawValue;
    if (timeSignatureCommitTimerRef.current !== null) {
      window.clearTimeout(timeSignatureCommitTimerRef.current);
    }
    timeSignatureCommitTimerRef.current = window.setTimeout(() => {
      timeSignatureCommitTimerRef.current = null;
      void commitTimeSignature(rawValue);
    }, CONTROL_COMMIT_DEBOUNCE_MS);
  };

  const handleAddLane = async () => {
    if (!canvas || addingLane) return;
    setAddingLane(true);
    setError(null);
    try {
      const res = await gteApi.addCanvasEditor(editorId);
      const currentTimeSignature = normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8;
      const currentSecondsPerBar = Math.max(0.1, toNumber(canvas.secondsPerBar, DEFAULT_SECONDS_PER_BAR));
      const nextCanvas = normalizeCanvas(
        {
          ...res.canvas,
          secondsPerBar: currentSecondsPerBar,
          editors: res.canvas.editors.map((lane) => ({
            ...lane,
            secondsPerBar: currentSecondsPerBar,
            timeSignature: currentTimeSignature,
          })),
        },
        editorId
      );
      await gteApi.applySnapshot(editorId, nextCanvas);
      applyCanvasUpdate(nextCanvas, { markDirty: !isGuestMode });
      setActiveLaneId(res.editor?.id || nextCanvas.editors[nextCanvas.editors.length - 1]?.id || null);
    } catch (err: any) {
      setError(err?.message || "Could not add track.");
    } finally {
      setAddingLane(false);
    }
  };

  const requestDeleteTrack = useCallback(
    (laneId: string) => {
      if (!canvas || deletingLaneId) return;
      if (canvas.editors.length <= 1) {
        setError("Cannot remove the final track.");
        return;
      }
      setConfirmDeleteTrackId(laneId);
    },
    [canvas, deletingLaneId]
  );

  const handleDeleteLane = async (laneId: string) => {
    if (!canvas || deletingLaneId) return;
    if (canvas.editors.length <= 1) {
      setError("Cannot remove the final track.");
      return;
    }
    setConfirmDeleteTrackId(null);

    setDeletingLaneId(laneId);
    setError(null);
    try {
      const res = await gteApi.deleteCanvasEditor(editorId, laneId);
      const nextCanvas = normalizeCanvas(res.canvas, editorId);
      applyCanvasUpdate(nextCanvas, { markDirty: !isGuestMode });
      if (activeLaneId === laneId) {
        setActiveLaneId(nextCanvas.editors[0]?.id || null);
      }
    } catch (err: any) {
      setError(err?.message || "Could not remove track.");
    } finally {
      setDeletingLaneId(null);
    }
  };

  const handleReorderTrack = useCallback(
    async (laneId: string, insertionIndex: number) => {
      if (!canvas) return;
      const currentIndex = canvas.editors.findIndex((lane) => lane.id === laneId);
      if (currentIndex < 0) return;

      const clampedInsertion = Math.max(0, Math.min(canvas.editors.length, Math.round(toNumber(insertionIndex, currentIndex))));
      let nextIndex = clampedInsertion > currentIndex ? clampedInsertion - 1 : clampedInsertion;
      nextIndex = Math.max(0, Math.min(canvas.editors.length - 1, nextIndex));
      if (nextIndex === currentIndex) return;

      setError(null);
      try {
        const res = await gteApi.reorderCanvasEditor(editorId, laneId, nextIndex);
        applyCanvasUpdate(normalizeCanvas(res.canvas, editorId), { markDirty: !isGuestMode });
        setActiveLaneId(laneId);
      } catch (err: any) {
        setError(err?.message || "Could not reorder tracks.");
      }
    },
    [applyCanvasUpdate, canvas, editorId, isGuestMode]
  );

  const handleLaneSnapshotChange = (
    laneId: string,
    nextLaneSnapshot: EditorSnapshot,
    options?: { recordHistory?: boolean }
  ) => {
    setCanvas((prev) => {
      if (!prev) return prev;
      const secondsPerBar = Math.max(
        0.1,
        toNumber(prev.secondsPerBar, toNumber(nextLaneSnapshot.secondsPerBar, DEFAULT_SECONDS_PER_BAR))
      );
      const sharedTimeSignature = normalizeTimeSignature(prev.editors[0]?.timeSignature) ?? 8;
      const nextEditors = prev.editors.map((lane, index) =>
        lane.id === laneId
          ? normalizeLane(
              {
                ...nextLaneSnapshot,
                secondsPerBar,
                timeSignature: sharedTimeSignature,
                instrumentId:
                  normalizeTrackInstrumentId(nextLaneSnapshot.instrumentId) !== DEFAULT_TRACK_INSTRUMENT_ID ||
                  normalizeTrackInstrumentId(lane.instrumentId) === DEFAULT_TRACK_INSTRUMENT_ID
                    ? nextLaneSnapshot.instrumentId
                    : lane.instrumentId,
              },
              laneId,
              secondsPerBar,
              index
            )
          : normalizeLane(
              { ...lane, secondsPerBar, timeSignature: sharedTimeSignature },
              lane.id || `ed-${index + 1}`,
              secondsPerBar,
              index
            )
      );
      const nextCanvas = {
        ...prev,
        updatedAt: new Date().toISOString(),
        secondsPerBar,
        editors: nextEditors,
      };
      if (options?.recordHistory !== false) {
        recordCanvasHistory(prev, nextCanvas);
      }
      return nextCanvas;
    });
    if (options?.recordHistory !== false) {
      setHasPendingCommit(true);
    }
  };

  const handleLaneInstrumentChange = useCallback(
    (laneId: string, instrumentId: string) => {
      const normalizedInstrumentId = normalizeTrackInstrumentId(instrumentId);
      let didChange = false;
      setCanvas((prev) => {
        if (!prev) return prev;
        const secondsPerBar = Math.max(0.1, toNumber(prev.secondsPerBar, DEFAULT_SECONDS_PER_BAR));
        const nextEditors = prev.editors.map((lane, index) => {
          const normalizedLane = normalizeLane(
            lane,
            lane.id || `ed-${index + 1}`,
            secondsPerBar,
            index
          );
          if (normalizedLane.id !== laneId) return normalizedLane;
          if (normalizedLane.instrumentId === normalizedInstrumentId) return normalizedLane;
          didChange = true;
          return normalizeLane(
            { ...normalizedLane, instrumentId: normalizedInstrumentId },
            laneId,
            secondsPerBar,
            index
          );
        });
        if (!didChange) return prev;
        const nextCanvas = {
          ...prev,
          updatedAt: new Date().toISOString(),
          editors: nextEditors,
        };
        recordCanvasHistory(prev, nextCanvas);
        return nextCanvas;
      });
      if (!didChange) return;
      setHasPendingCommit(true);
      setActiveLaneId(laneId);
      void warmTrackInstrument(normalizedInstrumentId);
      if (!isGuestMode) {
        void gteApi.setTrackInstrument(editorId, laneId, normalizedInstrumentId).catch((err: any) => {
          setSaveError(err?.message || "Could not save track sound.");
        });
      }
    },
    [editorId, isGuestMode, recordCanvasHistory]
  );

  const handleLaneTuningChange = useCallback(
    (laneId: string, presetId: string, capoValue: number) => {
      if (!canvas) return;
      const secondsPerBar = Math.max(0.1, toNumber(canvas.secondsPerBar, DEFAULT_SECONDS_PER_BAR));
      let didChange = false;
      const nextEditors = canvas.editors.map((lane, index) => {
        const normalizedLane = normalizeLane(lane, lane.id || `ed-${index + 1}`, secondsPerBar, index);
        if (normalizedLane.id !== laneId) return normalizedLane;
        const currentTuning = getSnapshotTuning(normalizedLane);
        const capo = normalizeCapo(capoValue);
        if (currentTuning.presetId === presetId && currentTuning.capo === capo) return normalizedLane;
        didChange = true;
        return normalizeLane(applyTuningToSnapshot(normalizedLane, presetId, capo), laneId, secondsPerBar, index);
      });
      if (!didChange) return;
      const nextCanvas = {
        ...canvas,
        updatedAt: new Date().toISOString(),
        editors: nextEditors,
      };
      recordCanvasHistory(canvas, nextCanvas);
      setCanvas(nextCanvas);
      setHasPendingCommit(true);
      setActiveLaneId(laneId);
      void gteApi.applySnapshot(editorId, nextCanvas).catch((err: any) => {
        setSaveError(err?.message || "Could not save track tuning.");
      });
    },
    [canvas, editorId, recordCanvasHistory]
  );

  const clearBarSelectionState = useCallback((exemptEditorRef: string | null = null) => {
    setBarSelection(null);
    setBarDragState(null);
    setOpenMobileBarMenuLaneId(null);
    setBarSelectionClearExemptEditorId(exemptEditorRef);
    setBarSelectionClearEpoch((prev) => prev + 1);
  }, []);

  const exitMobileEditMode = useCallback(() => {
    setMobileEditLaneId(null);
    setActiveLaneId(null);
    setOpenTrackMenuId(null);
    setMobileNavOpen(false);
    setMobileControlsOpen(false);
    clearBarSelectionState();
  }, [clearBarSelectionState]);

  const applyCanvasBarUpdate = useCallback(
    (nextCanvas: CanvasSnapshot) => {
      const normalized = normalizeCanvas(nextCanvas, editorId);
      const cleaned = cleanCanvasCutSegments(normalized);
      applyCanvasUpdate(cleaned, { markDirty: true });
    },
    [applyCanvasUpdate, editorId]
  );

  const handleBarSelectionStateChange = useCallback(
    (laneId: string, barIndices: number[]) => {
      if (barIndices.length && barSelection?.laneId && barSelection.laneId !== laneId) {
        setBarSelectionClearExemptEditorId(buildLaneEditorRef(editorId, laneId));
        setBarSelectionClearEpoch((prev) => prev + 1);
        setOpenMobileBarMenuLaneId(null);
      }
      if (!barIndices.length && openMobileBarMenuLaneId === laneId) {
        setOpenMobileBarMenuLaneId(null);
      }
      setBarSelection((prev) => {
        if (!barIndices.length) {
          return prev?.laneId === laneId ? null : prev;
        }
        if (
          prev?.laneId === laneId &&
          prev.barIndices.length === barIndices.length &&
          prev.barIndices.every((value, index) => value === barIndices[index])
        ) {
          return prev;
        }
        return {
          laneId,
          barIndices: [...barIndices],
        };
      });
    },
    [barSelection?.laneId, editorId, openMobileBarMenuLaneId]
  );

  const handleCopySelectedBars = useCallback(
    async (laneId: string, barIndices: number[]) => {
      if (!canvas || !barIndices.length) return;
      setError(null);
      try {
        if (isGuestMode) {
          const lane = canvas.editors.find((item) => item.id === laneId);
          if (!lane) {
            throw new Error("Track not found.");
          }
          const clipboard = selectBarsFromLane(lane, barIndices);
          if (!clipboard) {
            throw new Error("Unable to copy bars.");
          }
          setBarClipboard(clipboard);
          return;
        }
        const res = await gteApi.selectCanvasBars(editorId, laneId, barIndices);
        setBarClipboard(
          normalizeLane(
            res.clipboard,
            res.clipboard.id || "clipboard",
            Math.max(0.1, toNumber(canvas.secondsPerBar, DEFAULT_SECONDS_PER_BAR)),
            0
          )
        );
      } catch (err: any) {
        setError(err?.message || "Could not copy bars.");
      }
    },
    [canvas, editorId, isGuestMode]
  );

  const handlePasteBars = useCallback(
    async (laneId: string, insertIndex: number) => {
      if (!canvas || !barClipboard) return;
      setError(null);
      try {
        if (isGuestMode) {
          const nextCanvas = insertBarsIntoCanvas(canvas, laneId, insertIndex, barClipboard);
          if (!nextCanvas) {
            throw new Error("Unable to insert bars.");
          }
          applyCanvasBarUpdate(nextCanvas);
        } else {
          const res = await gteApi.insertCanvasBars(editorId, laneId, insertIndex, barClipboard);
          applyCanvasBarUpdate(res.canvas);
        }
        setActiveLaneId(laneId);
      } catch (err: any) {
        setError(err?.message || "Could not paste bars.");
      }
    },
    [applyCanvasBarUpdate, barClipboard, canvas, editorId, isGuestMode]
  );

  const handleDeleteSelectedBars = useCallback(
    async (laneId: string, barIndices: number[]) => {
      if (!canvas || !barIndices.length) return;
      setError(null);
      try {
        if (isGuestMode) {
          const nextCanvas = deleteBarsFromCanvas(canvas, laneId, barIndices);
          if (!nextCanvas) {
            throw new Error("Unable to delete bars.");
          }
          applyCanvasBarUpdate(nextCanvas);
        } else {
          const res = await gteApi.deleteCanvasBars(editorId, laneId, barIndices);
          applyCanvasBarUpdate(res.canvas);
        }
        clearBarSelectionState();
      } catch (err: any) {
        setError(err?.message || "Could not delete bars.");
      }
    },
    [applyCanvasBarUpdate, canvas, clearBarSelectionState, editorId, isGuestMode]
  );

  const handleMoveSelectedBars = useCallback(
    async (
      sourceLaneId: string,
      barIndices: number[],
      targetLaneId: string,
      insertIndex: number
    ) => {
      if (!canvas || !barIndices.length) return;
      setError(null);
      try {
        if (isGuestMode) {
          const nextCanvas = moveBarsInCanvas(
            canvas,
            sourceLaneId,
            targetLaneId,
            barIndices,
            insertIndex
          );
          if (!nextCanvas) {
            throw new Error("Unable to move bars.");
          }
          applyCanvasBarUpdate(nextCanvas);
        } else {
          const res = await gteApi.moveCanvasBars(editorId, {
            sourceLaneId,
            targetLaneId,
            barIndices,
            insertIndex,
          });
          applyCanvasBarUpdate(res.canvas);
        }
        setActiveLaneId(targetLaneId);
        setBarDragState(null);
        clearBarSelectionState();
      } catch (err: any) {
        setError(err?.message || "Could not move bars.");
      }
    },
    [applyCanvasBarUpdate, canvas, clearBarSelectionState, editorId, isGuestMode]
  );

  useEffect(() => {
    if (!openMobileBarMenuLaneId) return;
    if (!barSelection || barSelection.laneId !== openMobileBarMenuLaneId || barSelection.barIndices.length === 0) {
      setOpenMobileBarMenuLaneId(null);
    }
  }, [barSelection, openMobileBarMenuLaneId]);

  const handleCanvasUndo = useCallback(() => {
    if (!canvas) return;
    if (deletingLaneId || addingLane || savingCanvas) return;
    const undoList = canvasUndoRef.current;
    if (!undoList.length) return;
    let nextCanvasSnapshot: CanvasSnapshot | null = null;
    setCanvas((current) => {
      if (!current) return current;
      const previous = undoList[undoList.length - 1];
      const nextUndo = undoList.slice(0, -1);
      const nextRedo = [...canvasRedoRef.current, cloneCanvas(current)];
      if (nextRedo.length > MAX_CANVAS_HISTORY) {
        nextRedo.splice(0, nextRedo.length - MAX_CANVAS_HISTORY);
      }
      canvasUndoRef.current = nextUndo;
      canvasRedoRef.current = nextRedo;
      setCanvasUndoCount(nextUndo.length);
      setCanvasRedoCount(nextRedo.length);
      nextCanvasSnapshot = cloneCanvas(previous);
      return nextCanvasSnapshot;
    });
    setHasPendingCommit(true);
    if (nextCanvasSnapshot) {
      void syncCanvasDraftToBackend(nextCanvasSnapshot, { silent: true });
    }
  }, [addingLane, canvas, cloneCanvas, deletingLaneId, savingCanvas, syncCanvasDraftToBackend]);

  const handleCanvasRedo = useCallback(() => {
    if (!canvas) return;
    if (deletingLaneId || addingLane || savingCanvas) return;
    const redoList = canvasRedoRef.current;
    if (!redoList.length) return;
    let nextCanvasSnapshot: CanvasSnapshot | null = null;
    setCanvas((current) => {
      if (!current) return current;
      const next = redoList[redoList.length - 1];
      const nextRedo = redoList.slice(0, -1);
      const nextUndo = [...canvasUndoRef.current, cloneCanvas(current)];
      if (nextUndo.length > MAX_CANVAS_HISTORY) {
        nextUndo.splice(0, nextUndo.length - MAX_CANVAS_HISTORY);
      }
      canvasUndoRef.current = nextUndo;
      canvasRedoRef.current = nextRedo;
      setCanvasUndoCount(nextUndo.length);
      setCanvasRedoCount(nextRedo.length);
      nextCanvasSnapshot = cloneCanvas(next);
      return nextCanvasSnapshot;
    });
    setHasPendingCommit(true);
    if (nextCanvasSnapshot) {
      void syncCanvasDraftToBackend(nextCanvasSnapshot, { silent: true });
    }
  }, [addingLane, canvas, cloneCanvas, deletingLaneId, savingCanvas, syncCanvasDraftToBackend]);

  useEffect(() => {
    if (activeLaneId !== null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = isShortcutTextEntryTarget(target);
      if (!isTyping) {
        blurFocusedShortcutControl(target);
      }
      if (isTyping) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) {
          handleCanvasRedo();
        } else {
          handleCanvasUndo();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        handleCanvasRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeLaneId, handleCanvasRedo, handleCanvasUndo]);

  const saveStatus = useMemo(() => {
    if (isGuestMode) {
      if (savingCanvas) return "Saving in this browser...";
      if (hasPendingCommit) return "Unsaved changes in this browser";
      return "Saved in this browser only";
    }
    if (savingCanvas) return "Saving...";
    if (hasPendingCommit) return "Unsaved canvas changes";
    if (lastCommittedAt) {
      return `Saved ${new Date(lastCommittedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    return "Saved";
  }, [hasPendingCommit, isGuestMode, lastCommittedAt, savingCanvas]);

  const sharedViewportBarCount = useMemo(() => {
    if (!canvas) return 1;
    let maxBars = 1;
    for (const lane of canvas.editors) {
      const totalFrames = Math.max(1, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR)));
      const bars = Math.max(1, Math.ceil(totalFrames / FIXED_FRAMES_PER_BAR));
      if (bars > maxBars) maxBars = bars;
    }
    return maxBars;
  }, [canvas]);

  const handleSharedTimelineScrollRatioChange = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    setSharedTimelineScrollRatio((prev) => (Math.abs(prev - clamped) < 0.001 ? prev : clamped));
  }, []);

  const globalTimelineTrackWidth = useMemo(
    () => Math.max(4000, sharedViewportBarCount * FIXED_FRAMES_PER_BAR * 3),
    [sharedViewportBarCount]
  );

  const mobileControlsSummary = `${nameDraft || "Untitled"} - ${bpmDraft} BPM - ${timeSignatureDraft}/bar`;
  const isMobileCanvasMode = isMobileViewport && mobileEditLaneId === null;
  const isMobileEditMode = isMobileViewport && mobileEditLaneId !== null;

  useEffect(() => {
    const scrollbar = globalTimelineScrollbarRef.current;
    if (!scrollbar) return;
    const ratio = Math.max(0, Math.min(1, sharedTimelineScrollRatio));
    const maxScroll = Math.max(0, scrollbar.scrollWidth - scrollbar.clientWidth);
    const targetScroll = Math.round(maxScroll * ratio);
    if (Math.abs(scrollbar.scrollLeft - targetScroll) < 1) return;
    applyingGlobalTimelineScrollbarRef.current = true;
    scrollbar.scrollLeft = targetScroll;
    window.requestAnimationFrame(() => {
      applyingGlobalTimelineScrollbarRef.current = false;
    });
  }, [sharedTimelineScrollRatio, globalTimelineTrackWidth]);

  const handleGlobalTimelineScrollbarScroll = useCallback(
    (event: ReactUiEvent<HTMLDivElement>) => {
      if (applyingGlobalTimelineScrollbarRef.current) return;
      const maxScroll = Math.max(
        0,
        event.currentTarget.scrollWidth - event.currentTarget.clientWidth
      );
      if (maxScroll <= 0) return;
      handleSharedTimelineScrollRatioChange(event.currentTarget.scrollLeft / maxScroll);
    },
    [handleSharedTimelineScrollRatioChange]
  );

  const canvasTimelineEnd = useMemo(() => {
    if (!canvas) return FIXED_FRAMES_PER_BAR;
    let maxFrames = FIXED_FRAMES_PER_BAR;
    canvas.editors.forEach((lane) => {
      maxFrames = Math.max(maxFrames, Math.max(1, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR))));
    });
    return maxFrames;
  }, [canvas]);

  const globalPlaybackFps = useMemo(
    () => fpsFromSecondsPerBar(Math.max(0.1, toNumber(canvas?.secondsPerBar, DEFAULT_SECONDS_PER_BAR))),
    [canvas?.secondsPerBar]
  );
  const globalPracticeLoopRange = useMemo(
    () =>
      resolvePracticeLoopRange(barSelection?.barIndices, FIXED_FRAMES_PER_BAR, canvasTimelineEnd) ||
      (canvasTimelineEnd > 0 ? { startFrame: 0, endFrame: canvasTimelineEnd } : null),
    [barSelection?.barIndices, canvasTimelineEnd]
  );
  const normalizedPlaybackSpeed = normalizePlaybackSpeed(playbackSpeed);
  const globalMetronomeBeatsPerBar = normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8;

  useEffect(() => {
    if (globalPracticeLoopRange) return;
    if (practiceLoopEnabled) setPracticeLoopEnabled(false);
  }, [globalPracticeLoopRange, practiceLoopEnabled]);
  useEffect(() => {
    if (practiceLoopEnabled) return;
    if (speedTrainerEnabled) setSpeedTrainerEnabled(false);
  }, [practiceLoopEnabled, speedTrainerEnabled]);

  useEffect(() => {
    setGlobalPlaybackFrame((prev) => Math.max(0, Math.min(canvasTimelineEnd, Math.round(prev))));
  }, [canvasTimelineEnd]);

  useEffect(() => {
    globalPlaybackFrameRef.current = globalPlaybackFrame;
  }, [globalPlaybackFrame]);

  useEffect(() => {
    if (!canvas) return;
    setTrackMuteById((prev) => {
      const next: Record<string, boolean> = {};
      canvas.editors.forEach((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        next[laneId] = Boolean(prev[laneId]);
      });
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }
      for (const key of nextKeys) {
        if (prev[key] !== next[key]) {
          return next;
        }
      }
      return prev;
    });
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;
    setTrackVolumeById((prev) => {
      const next: Record<string, number> = {};
      canvas.editors.forEach((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        next[laneId] = normalizeTrackVolume(prev[laneId] ?? 1);
      });
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }
      for (const key of nextKeys) {
        if (Math.abs((prev[key] ?? 1) - next[key]) > 0.0001) {
          return next;
        }
      }
      return prev;
    });
    setIsolatedTrackId((prev) => {
      if (!prev) return prev;
      return canvas.editors.some((lane, index) => (lane.id || `ed-${index + 1}`) === prev) ? prev : null;
    });
  }, [canvas]);

  useEffect(() => {
    if (!canvas) {
      setLaneSelectionById({});
      return;
    }
    setLaneSelectionById((prev) => {
      const next: Record<string, { noteCount: number; chordCount: number; noteIds: number[]; chordIds: number[] }> = {};
      canvas.editors.forEach((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        const existing = prev[laneId];
        next[laneId] = existing
          ? existing
          : { noteCount: 0, chordCount: 0, noteIds: [], chordIds: [] };
      });
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;
      for (const key of nextKeys) {
        const left = prev[key];
        const right = next[key];
        if (
          !left ||
          left.noteCount !== right.noteCount ||
          left.chordCount !== right.chordCount ||
          left.noteIds.length !== right.noteIds.length ||
          left.chordIds.length !== right.chordIds.length
        ) {
          return next;
        }
      }
      return prev;
    });
  }, [canvas]);

  useEffect(() => {
    if (!canvas) {
      setBarSelection(null);
      setBarDragState(null);
      setPendingTrackReorder(null);
      setTrackDragLaneId(null);
      setTrackDropIndex(null);
      return;
    }
    setBarSelection((prev) => {
      if (!prev) return prev;
      const lane = canvas.editors.find((item) => item.id === prev.laneId);
      if (!lane) return null;
      const nextBarIndices = normalizeBarIndices(lane, prev.barIndices);
      if (!nextBarIndices.length) return null;
      if (
        nextBarIndices.length === prev.barIndices.length &&
        nextBarIndices.every((value, index) => value === prev.barIndices[index])
      ) {
        return prev;
      }
      return { laneId: prev.laneId, barIndices: nextBarIndices };
    });
    setBarDragState((prev) => {
      if (!prev) return prev;
      const lane = canvas.editors.find((item) => item.id === prev.sourceLaneId);
      if (!lane) return null;
      const nextBarIndices = normalizeBarIndices(lane, prev.barIndices);
      if (!nextBarIndices.length) return null;
      if (
        nextBarIndices.length === prev.barIndices.length &&
        nextBarIndices.every((value, index) => value === prev.barIndices[index])
      ) {
        return prev;
      }
      return { sourceLaneId: prev.sourceLaneId, barIndices: nextBarIndices };
    });
  }, [canvas]);

  const computeTrackDropIndex = useCallback(
    (pointerY: number) => {
      if (!canvas || !canvas.editors.length) return null;
      for (let index = 0; index < canvas.editors.length; index += 1) {
        const laneId = canvas.editors[index].id || `ed-${index + 1}`;
        const node = trackSectionRefs.current[laneId];
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (pointerY < mid) {
          return index;
        }
      }
      return canvas.editors.length;
    },
    [canvas]
  );

  useEffect(() => {
    if (!pendingTrackReorder && !trackDragLaneId) return;

    const previousBodyUserSelect = document.body.style.userSelect;
    const previousBodyWebkitUserSelect = (document.body.style as CSSStyleDeclaration & {
      webkitUserSelect?: string;
    }).webkitUserSelect;
    document.body.style.userSelect = "none";
    (document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect =
      "none";

    const handleMouseMove = (event: MouseEvent) => {
      const activeLane = trackDragLaneId || pendingTrackReorder?.laneId || null;
      if (!activeLane) return;

      if (!trackDragLaneId && pendingTrackReorder) {
        if (Math.abs(event.clientY - pendingTrackReorder.startY) < 8) return;
        setTrackDragLaneId(pendingTrackReorder.laneId);
      }

      event.preventDefault();
      const nextDropIndex = computeTrackDropIndex(event.clientY);
      setTrackDropIndex(nextDropIndex);
    };

    const handleMouseUp = () => {
      const draggingLaneId = trackDragLaneId;
      const dropIndex = trackDropIndex;
      setPendingTrackReorder(null);
      setTrackDragLaneId(null);
      setTrackDropIndex(null);
      if (!draggingLaneId || dropIndex === null) return;
      void handleReorderTrack(draggingLaneId, dropIndex);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.userSelect = previousBodyUserSelect;
      (
        document.body.style as CSSStyleDeclaration & {
          webkitUserSelect?: string;
        }
      ).webkitUserSelect = previousBodyWebkitUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    computeTrackDropIndex,
    handleReorderTrack,
    pendingTrackReorder,
    trackDragLaneId,
    trackDropIndex,
  ]);

  const handleLaneSelectionStateChange = useCallback(
    (
      laneId: string,
      selection: { noteCount: number; chordCount: number; noteIds: number[]; chordIds: number[] }
    ) => {
      setLaneSelectionById((prev) => {
        const current = prev[laneId] || { noteCount: 0, chordCount: 0, noteIds: [], chordIds: [] };
        const sameNoteIds =
          current.noteIds.length === selection.noteIds.length &&
          current.noteIds.every((id, idx) => id === selection.noteIds[idx]);
        const sameChordIds =
          current.chordIds.length === selection.chordIds.length &&
          current.chordIds.every((id, idx) => id === selection.chordIds[idx]);
        if (
          current.noteCount === selection.noteCount &&
          current.chordCount === selection.chordCount &&
          sameNoteIds &&
          sameChordIds
        ) {
          return prev;
        }
        return {
          ...prev,
          [laneId]: {
            noteCount: selection.noteCount,
            chordCount: selection.chordCount,
            noteIds: [...selection.noteIds],
            chordIds: [...selection.chordIds],
          },
        };
      });
    },
    []
  );

  const multiTrackSelectionActive = useMemo(() => {
    let selectedTrackCount = 0;
    Object.values(laneSelectionById).forEach((selection) => {
      if (selection.noteCount + selection.chordCount > 0) {
        selectedTrackCount += 1;
      }
    });
    return selectedTrackCount > 1;
  }, [laneSelectionById]);

  const handleGlobalSelectedShift = useCallback(
    (_originLaneId: string, deltaFrames: number) => {
      if (!canvas) return false;
      const delta = Math.round(deltaFrames);
      if (delta === 0) return false;

      let selectedTrackCount = 0;
      Object.values(laneSelectionById).forEach((selection) => {
        if (selection.noteCount + selection.chordCount > 0) {
          selectedTrackCount += 1;
        }
      });
      if (selectedTrackCount <= 1) return false;

      let didChange = false;
      setCanvas((prev) => {
        if (!prev) return prev;
        const nextEditors = prev.editors.map((lane, index) => {
          const laneId = lane.id || `ed-${index + 1}`;
          const selection = laneSelectionById[laneId];
          if (!selection || selection.noteCount + selection.chordCount === 0) {
            return lane;
          }
          const noteIdSet = new Set(selection.noteIds);
          const chordIdSet = new Set(selection.chordIds);
          const laneFrames = Math.max(
            FIXED_FRAMES_PER_BAR,
            Math.ceil(Math.max(1, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR))) / FIXED_FRAMES_PER_BAR) *
              FIXED_FRAMES_PER_BAR
          );

          let laneChanged = false;
          const nextNotes = lane.notes.map((note) => {
            if (!noteIdSet.has(note.id)) return note;
            const noteLength = Math.max(1, Math.round(toNumber(note.length, 1)));
            const maxStart = Math.max(0, laneFrames - noteLength);
            const nextStart = Math.max(
              0,
              Math.min(maxStart, Math.round(toNumber(note.startTime, 0)) + delta)
            );
            if (nextStart === note.startTime) return note;
            laneChanged = true;
            return { ...note, startTime: nextStart };
          });

          const nextChords = lane.chords.map((chord) => {
            if (!chordIdSet.has(chord.id)) return chord;
            const chordLength = Math.max(1, Math.round(toNumber(chord.length, 1)));
            const maxStart = Math.max(0, laneFrames - chordLength);
            const nextStart = Math.max(
              0,
              Math.min(maxStart, Math.round(toNumber(chord.startTime, 0)) + delta)
            );
            if (nextStart === chord.startTime) return chord;
            laneChanged = true;
            return { ...chord, startTime: nextStart };
          });

          if (!laneChanged) return lane;
          didChange = true;
          return {
            ...lane,
            notes: nextNotes,
            chords: nextChords,
            updatedAt: new Date().toISOString(),
          };
        });

        if (!didChange) return prev;
        const nextCanvas: CanvasSnapshot = {
          ...prev,
          editors: nextEditors,
          updatedAt: new Date().toISOString(),
        };
        recordCanvasHistory(prev, nextCanvas);
        return nextCanvas;
      });

      if (didChange) {
        setHasPendingCommit(true);
      }
      return didChange;
    },
    [canvas, laneSelectionById, recordCanvasHistory]
  );

  const stopGlobalPlaybackAudio = useCallback(() => {
    if (globalPlaybackAudioRef.current) {
      void globalPlaybackAudioRef.current.close();
      globalPlaybackAudioRef.current = null;
    }
    globalPlaybackMasterGainRef.current = null;
  }, []);

  const scheduleMetronomeClick = useCallback(
    (ctx: AudioContext, destination: AudioNode, startTime: number, accent: boolean) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(accent ? 1320 : 880, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(accent ? 0.18 : 0.11, startTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.055);
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.06);
    },
    []
  );

  const stopGlobalPlayback = useCallback(() => {
    globalPlaybackStartRequestRef.current += 1;
    globalPlaybackStartPendingRef.current = false;
    if (globalPlaybackRafRef.current !== null) {
      window.cancelAnimationFrame(globalPlaybackRafRef.current);
      globalPlaybackRafRef.current = null;
    }
    globalPlaybackStartTimeRef.current = null;
    globalPlaybackEndFrameRef.current = null;
    globalPlaybackAudioStartRef.current = null;
    stopGlobalPlaybackAudio();
    setGlobalPlaybackIsPlaying(false);
  }, [stopGlobalPlaybackAudio]);

  useEffect(() => {
    stopGlobalPlayback();
    setGlobalPlaybackFrame(0);
  }, [editorId, stopGlobalPlayback]);

  const scheduleGlobalPlayback = useCallback(
    async (startFrame: number, speedOverride?: number) => {
      if (!canvas) return null;
      const runPlaybackSpeed = normalizePlaybackSpeed(speedOverride ?? normalizedPlaybackSpeed);
      const playbackStartFrame =
        practiceLoopEnabled && globalPracticeLoopRange ? globalPracticeLoopRange.startFrame : startFrame;
      const playbackEndFrame =
        practiceLoopEnabled && globalPracticeLoopRange ? globalPracticeLoopRange.endFrame : canvasTimelineEnd;

      const getMidiFromTab = (lane: EditorSnapshot, tab: [number, number], fallback?: number) => {
        const fromRef = lane.tabRef?.[tab[0]]?.[tab[1]];
        if (fromRef !== undefined && fromRef !== null && Number.isFinite(Number(fromRef))) {
          return Number(fromRef);
        }
        if (fallback !== undefined && fallback !== null && Number.isFinite(Number(fallback))) {
          return Number(fallback);
        }
        const base = STANDARD_TUNING_MIDI[tab[0]];
        if (base !== undefined && Number.isFinite(tab[1]) && tab[1] >= 0) {
          return base + tab[1];
        }
        return 0;
      };

      let endFrame = Math.max(playbackStartFrame, playbackEndFrame);
      const events: Array<{
        start: number;
        duration: number;
        midi: number;
        gain: number;
        instrumentId: string;
        pan: number;
      }> = [];

      const pushEvent = (
        eventStart: number,
        eventLength: number,
        midi: number,
        gain: number,
        instrumentId: string,
        pan: number
      ) => {
        const roundedStart = Math.round(eventStart);
        const roundedEnd = Math.round(eventStart + eventLength);
        if (roundedEnd <= playbackStartFrame || roundedStart >= playbackEndFrame) return;
        const trimmedStart = Math.max(roundedStart, playbackStartFrame);
        const trimmedEnd = Math.min(roundedEnd, playbackEndFrame);
        const durationFrames = trimmedEnd - trimmedStart;
        if (durationFrames <= 0) return;
        endFrame = Math.max(endFrame, trimmedEnd);
        events.push({
          start: frameDeltaToSeconds(trimmedStart - playbackStartFrame, globalPlaybackFps, runPlaybackSpeed),
          duration: frameDeltaToSeconds(durationFrames, globalPlaybackFps, runPlaybackSpeed),
          midi,
          gain,
          instrumentId,
          pan,
        });
      };

      canvas.editors.forEach((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        if (isolatedTrackId && laneId !== isolatedTrackId) return;
        if (trackMuteById[laneId]) return;
        const laneVolume = normalizeTrackVolume(trackVolumeById[laneId] ?? 1);
        const lanePan = normalizeTrackPan(trackPanById[laneId] ?? 0);
        if (laneVolume <= 0) return;
        const instrumentId = normalizeTrackInstrumentId(lane.instrumentId);

        lane.notes.forEach((note) => {
          const midi =
            Number.isFinite(note.midiNum) && note.midiNum > 0 ? note.midiNum : getMidiFromTab(lane, note.tab);
          pushEvent(note.startTime, note.length, midi, 0.55 * laneVolume, instrumentId, lanePan);
        });

        lane.chords.forEach((chord) => {
          chord.currentTabs.forEach((tab, tabIndex) => {
            const midi = getMidiFromTab(lane, tab, chord.originalMidi?.[tabIndex]);
            pushEvent(chord.startTime, chord.length, midi, 0.48 * laneVolume, instrumentId, lanePan);
          });
        });
      });

      const preparedEntries = await Promise.all(
        [...new Set(events.map((event) => event.instrumentId))].map(async (instrumentId) => {
          const instrument = await prepareTrackInstrument(instrumentId);
          return [instrumentId, instrument] as const;
        })
      );
      const preparedByInstrumentId = new Map<string, Awaited<ReturnType<typeof prepareTrackInstrument>>>(
        preparedEntries
      );

      const ctx = new AudioContext();
      void ctx.resume();
      const latencySec =
        (Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0) +
        (Number.isFinite((ctx as AudioContext).outputLatency)
          ? (ctx as AudioContext).outputLatency
          : 0);
      const base = ctx.currentTime + latencySec;

      const master = ctx.createGain();
      master.gain.value = globalPlaybackVolume;
      master.connect(ctx.destination);
      globalPlaybackMasterGainRef.current = master;
      const countInSec = countInEnabled
        ? frameDeltaToSeconds(FIXED_FRAMES_PER_BAR, globalPlaybackFps, runPlaybackSpeed)
        : 0;
      const playBase = base + countInSec;

      if (metronomeEnabled || countInEnabled) {
        buildMetronomeClicks({
          startFrame: playbackStartFrame,
          endFrame,
          framesPerBar: FIXED_FRAMES_PER_BAR,
          beatsPerBar: globalMetronomeBeatsPerBar,
          fps: globalPlaybackFps,
          playbackSpeed: runPlaybackSpeed,
          countInBars: countInEnabled ? 1 : 0,
        }).forEach((click) => {
          if (!metronomeEnabled && click.timeSec >= 0) return;
          scheduleMetronomeClick(ctx, master, playBase + click.timeSec, click.accent);
        });
      }

      events.forEach((evt) => {
        if (!Number.isFinite(evt.midi) || evt.midi <= 0) return;
        const instrument = preparedByInstrumentId.get(evt.instrumentId);
        if (!instrument) return;
        const destination = (() => {
          if (typeof ctx.createStereoPanner === "function") {
            const panner = ctx.createStereoPanner();
            panner.pan.value = normalizeTrackPan(evt.pan);
            panner.connect(master);
            return panner;
          }
          const merger = ctx.createChannelMerger(2);
          const left = ctx.createGain();
          const right = ctx.createGain();
          const gains = equalPowerPanGains(evt.pan);
          left.gain.value = gains.leftGain;
          right.gain.value = gains.rightGain;
          left.connect(merger, 0, 0);
          right.connect(merger, 0, 1);
          merger.connect(master);
          const splitter = ctx.createGain();
          splitter.connect(left);
          splitter.connect(right);
          return splitter;
        })();
        schedulePreparedTrackNote({
          ctx,
          destination,
          instrument,
          midi: evt.midi,
          gain: evt.gain,
          startTime: playBase + evt.start,
          duration: Math.max(0.05, evt.duration),
        });
      });

      return { ctx, endFrame, startFrame: playbackStartFrame, startTimeSec: playBase };
    },
    [
      canvas,
      canvasTimelineEnd,
      countInEnabled,
      globalMetronomeBeatsPerBar,
      globalPlaybackFps,
      globalPlaybackVolume,
      globalPracticeLoopRange,
      isolatedTrackId,
      metronomeEnabled,
      normalizedPlaybackSpeed,
      practiceLoopEnabled,
      scheduleMetronomeClick,
      trackMuteById,
      trackPanById,
      trackVolumeById,
    ]
  );

  const startGlobalPlayback = useCallback(async (startFrameOverride?: number, speedOverride?: number) => {
    if (!canvas) return;
    if (globalPlaybackRafRef.current !== null || globalPlaybackStartPendingRef.current) return;
    globalPlaybackStartPendingRef.current = true;
    const requestId = globalPlaybackStartRequestRef.current + 1;
    globalPlaybackStartRequestRef.current = requestId;
    const requestedStartFrame = Math.max(
      0,
      Math.min(
        canvasTimelineEnd,
        Math.round(startFrameOverride ?? globalPlaybackFrameRef.current)
      )
    );
    const startFrame =
      practiceLoopEnabled && globalPracticeLoopRange
        ? globalPracticeLoopRange.startFrame
        : requestedStartFrame;
    stopGlobalPlaybackAudio();
    const runPlaybackSpeed = normalizePlaybackSpeed(speedOverride ?? normalizedPlaybackSpeed);
    const scheduled = await scheduleGlobalPlayback(startFrame, runPlaybackSpeed);
    globalPlaybackStartPendingRef.current = false;
    if (globalPlaybackStartRequestRef.current !== requestId) {
      if (scheduled?.ctx) {
        void scheduled.ctx.close();
      }
      return;
    }
    if (!scheduled?.ctx) {
      setGlobalPlaybackIsPlaying(false);
      return;
    }

    globalPlaybackAudioRef.current = scheduled.ctx;
    globalPlaybackAudioStartRef.current = scheduled.startTimeSec ?? null;
    globalPlaybackEndFrameRef.current = Math.max(startFrame, Math.round(scheduled.endFrame ?? startFrame));
    globalPlaybackStartFrameRef.current = Math.round(scheduled.startFrame ?? startFrame);
    globalPlaybackStartTimeRef.current = performance.now();
    setGlobalPlaybackFrame(startFrame);
    setGlobalPlaybackIsPlaying(true);

    const tick = (now: number) => {
      if (globalPlaybackStartTimeRef.current === null) return;
      let elapsed = (now - globalPlaybackStartTimeRef.current) / 1000;
      if (globalPlaybackAudioRef.current && globalPlaybackAudioStartRef.current !== null) {
        elapsed = globalPlaybackAudioRef.current.currentTime - globalPlaybackAudioStartRef.current;
      }
      if (elapsed < 0) elapsed = 0;
      const nextFrame =
        globalPlaybackStartFrameRef.current + elapsed * globalPlaybackFps * runPlaybackSpeed;
      const endFrame = globalPlaybackEndFrameRef.current ?? canvasTimelineEnd;
      if (nextFrame >= endFrame) {
        if (practiceLoopEnabled && globalPracticeLoopRange) {
          const nextSpeed = speedTrainerEnabled
            ? nextSpeedTrainerValue(runPlaybackSpeed, speedTrainerStep, speedTrainerTarget)
            : runPlaybackSpeed;
          if (speedTrainerEnabled) {
            setPlaybackSpeed(nextSpeed);
          }
          setGlobalPlaybackFrame(globalPracticeLoopRange.startFrame);
          stopGlobalPlayback();
          window.setTimeout(() => {
            void startGlobalPlayback(globalPracticeLoopRange.startFrame, nextSpeed);
          }, 0);
          return;
        }
        setGlobalPlaybackFrame(endFrame);
        stopGlobalPlayback();
        return;
      }
      setGlobalPlaybackFrame(nextFrame);
      globalPlaybackRafRef.current = window.requestAnimationFrame(tick);
    };

    globalPlaybackRafRef.current = window.requestAnimationFrame(tick);
  }, [
    canvas,
    canvasTimelineEnd,
    globalPracticeLoopRange,
    globalPlaybackFps,
    normalizedPlaybackSpeed,
    practiceLoopEnabled,
    scheduleGlobalPlayback,
    speedTrainerStep,
    speedTrainerTarget,
    speedTrainerEnabled,
    stopGlobalPlayback,
    stopGlobalPlaybackAudio,
  ]);

  const toggleGlobalPlayback = useCallback(() => {
    if (globalPlaybackIsPlaying) {
      stopGlobalPlayback();
      return;
    }
    const atTimelineEnd = Math.round(globalPlaybackFrameRef.current) >= canvasTimelineEnd;
    void startGlobalPlayback(atTimelineEnd ? 0 : undefined);
  }, [canvasTimelineEnd, globalPlaybackIsPlaying, startGlobalPlayback, stopGlobalPlayback]);

  useEffect(() => {
    if (activeLaneId !== null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = isShortcutTextEntryTarget(target);
      if (!isTyping) {
        blurFocusedShortcutControl(target);
      }
      if (isTyping) return;
      if (
        event.code === "KeyG" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setGlobalSnapToGridEnabled((prev) => !prev);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        toggleGlobalPlayback();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeLaneId, toggleGlobalPlayback]);

  const seekGlobalPlayback = useCallback(
    (frame: number) => {
      const clamped = Math.max(0, Math.min(canvasTimelineEnd, Math.round(frame)));
      if (globalPlaybackIsPlaying) {
        stopGlobalPlayback();
      }
      setGlobalPlaybackFrame(clamped);
    },
    [canvasTimelineEnd, globalPlaybackIsPlaying, stopGlobalPlayback]
  );

  const skipGlobalPlaybackToStart = useCallback(() => {
    seekGlobalPlayback(0);
  }, [seekGlobalPlayback]);

  const skipGlobalPlaybackBackwardBar = useCallback(() => {
    const current = Math.max(0, Math.floor(globalPlaybackFrame));
    const prevIndex = Math.floor((current - 1) / FIXED_FRAMES_PER_BAR);
    const target = Math.max(0, prevIndex * FIXED_FRAMES_PER_BAR);
    seekGlobalPlayback(target);
  }, [globalPlaybackFrame, seekGlobalPlayback]);

  const skipGlobalPlaybackForwardBar = useCallback(() => {
    const current = Math.max(0, Math.floor(globalPlaybackFrame));
    const nextIndex = Math.floor(current / FIXED_FRAMES_PER_BAR) + 1;
    const target = Math.min(canvasTimelineEnd, nextIndex * FIXED_FRAMES_PER_BAR);
    seekGlobalPlayback(target);
  }, [canvasTimelineEnd, globalPlaybackFrame, seekGlobalPlayback]);

  const handleGlobalPlaybackVolumeChange = useCallback((nextVolume: number) => {
    setGlobalPlaybackVolume(Math.max(0, Math.min(1, nextVolume)));
  }, []);

  const toggleTrackMute = useCallback((trackId: string) => {
    setTrackMuteById((prev) => ({ ...prev, [trackId]: !prev[trackId] }));
  }, []);

  const handleTrackVolumeChange = useCallback((trackId: string, nextVolume: number) => {
    setTrackVolumeById((prev) => ({
      ...prev,
      [trackId]: normalizeTrackVolume(nextVolume),
    }));
  }, []);

  const handleTrackPanChange = useCallback((trackId: string, nextPan: number) => {
    setTrackPanById((prev) => ({
      ...prev,
      [trackId]: normalizeTrackPan(nextPan),
    }));
  }, []);

  const toggleTrackIsolation = useCallback((trackId: string) => {
    setIsolatedTrackId((prev) => (prev === trackId ? null : trackId));
  }, []);

  const trackPlaybackStateSignature = useMemo(() => {
    if (!canvas) return "";
    return [
      `iso:${isolatedTrackId ?? ""}`,
      `loop:${practiceLoopEnabled ? globalPracticeLoopRange?.startFrame ?? "-" : "-"}:${practiceLoopEnabled ? globalPracticeLoopRange?.endFrame ?? "-" : "-"}`,
      `met:${metronomeEnabled ? 1 : 0}`,
      `count:${countInEnabled ? 1 : 0}`,
      `train:${speedTrainerEnabled ? 1 : 0}`,
      `speed:${Math.round(normalizedPlaybackSpeed * 1000)}`,
      ...canvas.editors.map((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        return `${laneId}:${trackMuteById[laneId] ? 1 : 0}:${Math.round(
          normalizeTrackVolume(trackVolumeById[laneId] ?? 1) * 1000
        )}:${Math.round(normalizeTrackPan(trackPanById[laneId] ?? 0) * 1000)}`;
      }),
    ].join("|");
  }, [
    canvas,
    countInEnabled,
    globalPracticeLoopRange,
    isolatedTrackId,
    metronomeEnabled,
    normalizedPlaybackSpeed,
    practiceLoopEnabled,
    speedTrainerEnabled,
    trackMuteById,
    trackPanById,
    trackVolumeById,
  ]);

  useEffect(() => {
    const previousTrackPlaybackStateSignature = previousTrackPlaybackStateSignatureRef.current;
    previousTrackPlaybackStateSignatureRef.current = trackPlaybackStateSignature;
    if (
      !previousTrackPlaybackStateSignature ||
      previousTrackPlaybackStateSignature === trackPlaybackStateSignature
    ) {
      return;
    }
    if (!globalPlaybackIsPlaying) return;
    const resumeFrame = Math.max(0, Math.round(globalPlaybackFrameRef.current));
    stopGlobalPlayback();
    setGlobalPlaybackFrame(resumeFrame);
    const timer = window.setTimeout(() => {
      void startGlobalPlayback();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [globalPlaybackIsPlaying, startGlobalPlayback, stopGlobalPlayback, trackPlaybackStateSignature]);

  const trackInstrumentSignature = useMemo(() => {
    if (!canvas) return "";
    return canvas.editors
      .map((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        return `${laneId}:${normalizeTrackInstrumentId(lane.instrumentId)}`;
      })
      .join("|");
  }, [canvas]);

  useEffect(() => {
    const previousTrackInstrumentSignature = previousTrackInstrumentSignatureRef.current;
    previousTrackInstrumentSignatureRef.current = trackInstrumentSignature;
    if (!previousTrackInstrumentSignature || previousTrackInstrumentSignature === trackInstrumentSignature) {
      return;
    }
    if (!globalPlaybackIsPlaying) return;
    const resumeFrame = Math.max(0, Math.round(globalPlaybackFrameRef.current));
    stopGlobalPlayback();
    setGlobalPlaybackFrame(resumeFrame);
    const timer = window.setTimeout(() => {
      void startGlobalPlayback();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [globalPlaybackIsPlaying, startGlobalPlayback, stopGlobalPlayback, trackInstrumentSignature]);

  useEffect(() => {
    if (!globalPlaybackAudioRef.current || !globalPlaybackMasterGainRef.current) return;
    const now = globalPlaybackAudioRef.current.currentTime;
    globalPlaybackMasterGainRef.current.gain.setTargetAtTime(globalPlaybackVolume, now, 0.02);
  }, [globalPlaybackVolume]);

  useEffect(() => {
    if (!openTrackMenuId && !openMobileBarMenuLaneId) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-track-menu='true'], [data-mobile-bar-menu='true']")) return;
      setOpenTrackMenuId(null);
      setOpenMobileBarMenuLaneId(null);
    };
    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("touchstart", handlePointerDown, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("touchstart", handlePointerDown, true);
    };
  }, [openMobileBarMenuLaneId, openTrackMenuId]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-mobile-nav='true']")) return;
      setMobileNavOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown, true);
    return () => window.removeEventListener("mousedown", handlePointerDown, true);
  }, [mobileNavOpen]);

  useEffect(() => {
    return () => {
      stopGlobalPlayback();
    };
  }, [stopGlobalPlayback]);

  useEffect(() => {
    if (!globalPlaybackIsPlaying) return;
    const scrollbar = globalTimelineScrollbarRef.current;
    if (!scrollbar) return;
    const maxScroll = Math.max(0, scrollbar.scrollWidth - scrollbar.clientWidth);
    if (maxScroll <= 0) return;

    const progress = Math.max(0, Math.min(1, globalPlaybackFrame / Math.max(1, canvasTimelineEnd)));
    const playheadX = progress * maxScroll;
    const left = scrollbar.scrollLeft;
    const right = left + scrollbar.clientWidth;
    const padding = Math.min(180, scrollbar.clientWidth * 0.25);
    if (playheadX < left + padding || playheadX > right - padding) {
      const target = Math.max(
        0,
        Math.min(maxScroll, playheadX - scrollbar.clientWidth * 0.35)
      );
      handleSharedTimelineScrollRatioChange(target / maxScroll);
    }
  }, [
    canvasTimelineEnd,
    globalPlaybackFrame,
    globalPlaybackIsPlaying,
    handleSharedTimelineScrollRatioChange,
  ]);

  const mobileHistoryBusy = Boolean(deletingLaneId || addingLane || savingCanvas);
  const renderMobileHistoryControls = () => (
    <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={handleCanvasUndo}
        disabled={canvasUndoCount === 0 || mobileHistoryBusy}
        className="flex h-11 w-11 items-center justify-center text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        title="Undo"
        aria-label="Undo"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M7 7H3v4h2V9h7a5 5 0 1 1 0 10h-4v2h4a7 7 0 1 0 0-14H7z" />
        </svg>
      </button>
      <div className="h-6 w-px bg-slate-200" />
      <button
        type="button"
        onClick={handleCanvasRedo}
        disabled={canvasRedoCount === 0 || mobileHistoryBusy}
        className="flex h-11 w-11 items-center justify-center text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        title="Redo"
        aria-label="Redo"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M17 7h4v4h-2V9h-7a5 5 0 1 0 0 10h4v2h-4a7 7 0 1 1 0-14h5z" />
        </svg>
      </button>
    </div>
  );

  return (
    <>
      <NoIndexHead title="Guitar Tab Editor Workspace | Note2Tabs" canonicalPath={`/gte/${editorId}`} />
      <main
        className={`page page-tight ${
          isMobileEditMode ? "h-[100dvh] overflow-hidden overscroll-none py-3" : ""
        }`}
        onMouseDownCapture={handleMainMouseDownCapture}
      >
      <div
        className={`container gte-wide ${
          isMobileEditMode
            ? "flex h-full min-h-0 flex-col gap-3 overflow-hidden overscroll-none pb-0"
            : `stack ${isMobileCanvasMode ? "pb-24" : "pb-16"}`
        }`}
      >
        {isMobileCanvasMode && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="relative" data-mobile-nav="true">
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen((prev) => !prev)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"
                    aria-expanded={mobileNavOpen}
                    aria-label="Open menu"
                  >
                    <span className="flex flex-col gap-1">
                      <span className="block h-0.5 w-5 rounded-full bg-current" />
                      <span className="block h-0.5 w-5 rounded-full bg-current" />
                      <span className="block h-0.5 w-5 rounded-full bg-current" />
                    </span>
                  </button>
                  {mobileNavOpen && (
                    <div className="absolute left-0 top-12 z-40 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Menu
                      </div>
                      <div className="mt-3 space-y-2">
                        {isGuestMode ? (
                          <>
                            <Link href="/" className="block rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                              Home
                            </Link>
                            {session?.user?.id ? (
                              <button
                                type="button"
                                onClick={() => void router.push(saveToAccountPath)}
                                className="block w-full rounded-xl bg-slate-900 px-3 py-2 text-left text-sm font-semibold text-white"
                              >
                                Save draft to account
                              </button>
                            ) : (
                              <>
                                <Link
                                  href={loginSaveHref}
                                  className="block rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                                >
                                  Log in to save
                                </Link>
                                <Link
                                  href={signupSaveHref}
                                  className="block rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                                >
                                  Create account
                                </Link>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void router.push("/gte")}
                              className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700"
                            >
                              Back to editors
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => void commitCanvasToBackend({ force: true })}
                          className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                          disabled={savingCanvas || isGuestMode}
                        >
                          {savingCanvas ? "Saving..." : "Save now"}
                        </button>
                      </div>
                      <div className="mt-3 text-xs text-slate-500">{saveStatus}</div>
                      {isGuestMode && (
                        <div className="mt-2 text-xs text-slate-500">
                          This draft stays in this browser until you save it to your account.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {renderMobileHistoryControls()}
              </div>
              <button
                type="button"
                onClick={() => void router.push(transcriberHref)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm"
                title="Open the standalone transcriber"
              >
                Generate tabs
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <button
                type="button"
                onClick={() => setMobileControlsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={mobileControlsOpen}
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Project settings
                  </span>
                  <span className="block truncate text-sm text-slate-700">{mobileControlsSummary}</span>
                </span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600">
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 transition-transform ${mobileControlsOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
              {mobileControlsOpen && (
                <div className="mt-3 grid gap-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Name
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      onBlur={() => void commitName(nameDraft)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        void commitName(nameDraft);
                      }}
                      className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                      placeholder="Untitled"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      BPM
                      <span className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          step={1}
                          min={1}
                          value={bpmDraft}
                          onChange={(event) => {
                            if (bpmCommitTimerRef.current !== null) {
                              window.clearTimeout(bpmCommitTimerRef.current);
                              bpmCommitTimerRef.current = null;
                            }
                            queuedBpmValueRef.current = null;
                            setBpmDraft(event.target.value);
                          }}
                          onBlur={() => void commitBpm()}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            void commitBpm();
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                        />
                        <span className="inline-flex flex-col gap-1">
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              const current =
                                normalizeBpm(bpmDraft) ??
                                secondsPerBarToBpm(
                                  canvas?.secondsPerBar,
                                  normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8
                                );
                              const next = current + 1;
                              setBpmDraft(formatBpm(next));
                              scheduleBpmCommit(next);
                            }}
                            className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-600"
                            aria-label="Increase BPM"
                          >
                            &#9650;
                          </button>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              const current =
                                normalizeBpm(bpmDraft) ??
                                secondsPerBarToBpm(
                                  canvas?.secondsPerBar,
                                  normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8
                                );
                              const next = Math.max(1, current - 1);
                              setBpmDraft(formatBpm(next));
                              scheduleBpmCommit(next);
                            }}
                            className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-600"
                            aria-label="Decrease BPM"
                          >
                            &#9660;
                          </button>
                        </span>
                      </span>
                    </label>
                    <label className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Beats/bar
                      <span className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          step={1}
                          min={1}
                          max={64}
                          value={timeSignatureDraft}
                          onChange={(event) => {
                            if (timeSignatureCommitTimerRef.current !== null) {
                              window.clearTimeout(timeSignatureCommitTimerRef.current);
                              timeSignatureCommitTimerRef.current = null;
                            }
                            queuedTimeSignatureValueRef.current = null;
                            setTimeSignatureDraft(event.target.value);
                          }}
                          onBlur={() => void commitTimeSignature()}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            void commitTimeSignature();
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                        />
                        <span className="inline-flex flex-col gap-1">
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              const current =
                                normalizeTimeSignature(timeSignatureDraft) ??
                                normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ??
                                8;
                              const next = current + 1;
                              setTimeSignatureDraft(String(Math.min(64, next)));
                              scheduleTimeSignatureCommit(next);
                            }}
                            className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-600"
                            aria-label="Increase beats per bar"
                          >
                            &#9650;
                          </button>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              const current =
                                normalizeTimeSignature(timeSignatureDraft) ??
                                normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ??
                                8;
                              const next = Math.max(1, current - 1);
                              setTimeSignatureDraft(String(next));
                              scheduleTimeSignatureCommit(next);
                            }}
                            className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-600"
                            aria-label="Decrease beats per bar"
                          >
                            &#9660;
                          </button>
                        </span>
                      </span>
                    </label>
                  </div>
                  <div className="flex min-h-[1.25rem] flex-wrap items-center gap-3 text-xs">
                    <span className="muted">{saveStatus}</span>
                    {(nameSaving || bpmSaving) && !isGuestMode && <span className="muted">Saving draft...</span>}
                    {(nameError || bpmError) && <span className="error">{nameError || bpmError}</span>}
                    {(timeSignatureSaving || timeSignatureError) && (
                      <span className={timeSignatureError ? "error" : "muted"}>
                        {timeSignatureError || "Saving beats..."}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {isMobileEditMode && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exitMobileEditMode}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
            >
              Back
            </button>
            {renderMobileHistoryControls()}
            <button
              type="button"
              onClick={() => setGlobalSnapToGridEnabled((prev) => !prev)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm ${
                globalSnapToGridEnabled
                  ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              Snap {globalSnapToGridEnabled ? "On" : "Off"}
            </button>
            <div className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
              <span className="text-slate-500">Time</span>
              <span className="font-semibold text-slate-700">{timelineZoomPercent}%</span>
              <span className="inline-flex flex-col gap-1">
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    setTimelineZoomPercent((prev) =>
                      Math.min(TIMELINE_ZOOM_MAX, Math.max(TIMELINE_ZOOM_MIN, prev + 10))
                    )
                  }
                  className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-600"
                  aria-label="Increase time scale"
                >
                  &#9650;
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    setTimelineZoomPercent((prev) =>
                      Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, prev - 10))
                    )
                  }
                  className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-600"
                  aria-label="Decrease time scale"
                >
                  &#9660;
                </button>
              </span>
            </div>
          </div>
        )}
        {!isMobileViewport && (
        <div className="page-header" style={isMobileViewport ? { position: "relative", paddingRight: 152 } : undefined}>
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div
              className="page-title"
              style={{ display: "flex", alignItems: "baseline", gap: "14px", flexWrap: "wrap" }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  minWidth: 0,
                  maxWidth: "100%",
                }}
              >
                {nameEditing ? (
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={() => void commitName(nameDraft, { exitEdit: true })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitName(nameDraft, { exitEdit: true });
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setNameDraft(canvas?.name || "Untitled");
                        setNameEditing(false);
                      }
                    }}
                    className="min-w-0 max-w-full bg-transparent p-0 text-[1.15rem] font-medium text-slate-700 outline-none"
                    style={{ border: "none", boxShadow: "none" }}
                    placeholder="Untitled"
                  />
                ) : (
                  <span
                    style={{
                      paddingLeft: isMobileViewport ? 0 : 10,
                      fontSize: isMobileViewport ? "1.35rem" : "2.00rem",
                      lineHeight: 1.3,
                      fontWeight: 500,
                      color: "#334155",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: isMobileViewport ? "100%" : "min(32rem, 100%)",
                    }}
                  >
                    {canvas?.name || "Untitled"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setNameEditing(true)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  title="Rename editor"
                  aria-label="Rename editor"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13z" />
                  </svg>
                </button>
              </span>
            </div>
            {!isMobileViewport && (
            <>
            <div
              className="page-subtitle"
              style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}
            >
              <label className="text-small muted" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                BPM
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <input
                      type="number"
                      step={1}
                      min={1}
                      value={bpmDraft}
                      onChange={(event) => {
                        if (bpmCommitTimerRef.current !== null) {
                          window.clearTimeout(bpmCommitTimerRef.current);
                          bpmCommitTimerRef.current = null;
                        }
                        queuedBpmValueRef.current = null;
                        setBpmDraft(event.target.value);
                      }}
                      onBlur={() => void commitBpm()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void commitBpm();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          if (bpmCommitTimerRef.current !== null) {
                            window.clearTimeout(bpmCommitTimerRef.current);
                            bpmCommitTimerRef.current = null;
                          }
                          queuedBpmValueRef.current = null;
                          setBpmDraft(
                            formatBpm(
                              secondsPerBarToBpm(
                              canvas?.secondsPerBar,
                              normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8
                            )
                          )
                        );
                      }
                    }}
                    className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                  />
                  <span style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          const current =
                            normalizeBpm(bpmDraft) ??
                            secondsPerBarToBpm(
                              canvas?.secondsPerBar,
                              normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8
                            );
                          const next = current + 1;
                          setBpmDraft(formatBpm(next));
                          scheduleBpmCommit(next);
                        }}
                      className="flex h-3.5 w-4 items-center justify-center rounded border border-slate-200 bg-white text-[8px] leading-none text-slate-600 hover:bg-slate-50"
                      title="Increase BPM"
                      aria-label="Increase BPM"
                    >
                      &#9650;
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          const current =
                            normalizeBpm(bpmDraft) ??
                            secondsPerBarToBpm(
                              canvas?.secondsPerBar,
                              normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8
                            );
                          const next = Math.max(1, current - 1);
                          setBpmDraft(formatBpm(next));
                          scheduleBpmCommit(next);
                        }}
                      className="flex h-3.5 w-4 items-center justify-center rounded border border-slate-200 bg-white text-[8px] leading-none text-slate-600 hover:bg-slate-50"
                      title="Decrease BPM"
                      aria-label="Decrease BPM"
                      disabled={(normalizeBpm(bpmDraft) ?? 1) <= 1}
                    >
                      &#9660;
                    </button>
                  </span>
                </span>
              </label>
              <label className="text-small muted" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                Beats/bar
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <input
                      type="number"
                      step={1}
                      min={1}
                      max={64}
                      value={timeSignatureDraft}
                      onChange={(event) => {
                        if (timeSignatureCommitTimerRef.current !== null) {
                          window.clearTimeout(timeSignatureCommitTimerRef.current);
                          timeSignatureCommitTimerRef.current = null;
                        }
                        queuedTimeSignatureValueRef.current = null;
                        setTimeSignatureDraft(event.target.value);
                      }}
                      onBlur={() => void commitTimeSignature()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void commitTimeSignature();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          if (timeSignatureCommitTimerRef.current !== null) {
                            window.clearTimeout(timeSignatureCommitTimerRef.current);
                            timeSignatureCommitTimerRef.current = null;
                          }
                          queuedTimeSignatureValueRef.current = null;
                          setTimeSignatureDraft(String(normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8));
                        }
                      }}
                    className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                  />
                  <span style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          const current = normalizeTimeSignature(timeSignatureDraft) ?? normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8;
                          const next = current + 1;
                          setTimeSignatureDraft(String(Math.min(64, next)));
                          scheduleTimeSignatureCommit(next);
                        }}
                      className="flex h-3.5 w-4 items-center justify-center rounded border border-slate-200 bg-white text-[8px] leading-none text-slate-600 hover:bg-slate-50"
                      title="Increase beats per bar"
                      aria-label="Increase beats per bar"
                      disabled={(normalizeTimeSignature(timeSignatureDraft) ?? 8) >= 64}
                    >
                      &#9650;
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          const current = normalizeTimeSignature(timeSignatureDraft) ?? normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8;
                          const next = Math.max(1, current - 1);
                          setTimeSignatureDraft(String(next));
                          scheduleTimeSignatureCommit(next);
                        }}
                      className="flex h-3.5 w-4 items-center justify-center rounded border border-slate-200 bg-white text-[8px] leading-none text-slate-600 hover:bg-slate-50"
                      title="Decrease beats per bar"
                      aria-label="Decrease beats per bar"
                      disabled={(normalizeTimeSignature(timeSignatureDraft) ?? 8) <= 1}
                    >
                      &#9660;
                    </button>
                  </span>
                </span>
              </label>
              <label
                className="text-small muted"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                Time scale
                <input
                  type="range"
                  min={TIMELINE_ZOOM_MIN}
                  max={TIMELINE_ZOOM_MAX}
                  step={1}
                  value={timelineZoomPercent}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (!Number.isFinite(next)) return;
                    setTimelineZoomPercent(
                      Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, Math.round(next)))
                    );
                  }}
                  className="w-28"
                  title="Scale editor width in time direction"
                />
                <span className="text-[11px] text-slate-600">{timelineZoomPercent}%</span>
              </label>
              <button
                type="button"
                onClick={() => setGlobalSnapToGridEnabled((prev) => !prev)}
                className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                  globalSnapToGridEnabled
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
                title="Global snap to grid for all tracks. shortcut 'G'"
              >
                Snap to grid: {globalSnapToGridEnabled ? "On" : "Off"}
              </button>
              <button
                type="button"
                onClick={() => void router.push(transcriberHref)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title="Open the standalone transcriber"
              >
                Generate tabs
              </button>
              <button
                type="button"
                onClick={() => void router.push(`/gte/${editorId}/tabs`)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title="View current editor as ASCII tabs"
              >
                View as tabs
              </button>
            </div>
            <div
              className="text-small"
              style={{ minHeight: "1.25rem", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}
            >
              <span className="muted">{saveStatus}</span>
              {(nameSaving || bpmSaving) && !isGuestMode && <span className="muted">Saving draft...</span>}
              {(nameError || bpmError) && <span className="error">{nameError || bpmError}</span>}
              {(timeSignatureSaving || timeSignatureError) && (
                <span className={timeSignatureError ? "error" : "muted"}>
                  {timeSignatureError || "Saving beats..."}
                </span>
              )}
            </div>
            </>
            )}
            {isMobileViewport && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <button
                  type="button"
                  onClick={() => setMobileControlsOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={mobileControlsOpen}
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Project settings
                    </span>
                    <span className="block truncate text-sm text-slate-700">{mobileControlsSummary}</span>
                  </span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600">
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 transition-transform ${mobileControlsOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.9}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
                {mobileControlsOpen && (
                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      <label className="min-w-[172px] rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-slate-600">
                        <span className="mb-1 block">BPM</span>
                        <span className="flex items-center gap-2">
                          <input
                            type="number"
                            step={1}
                            min={1}
                            value={bpmDraft}
                            onChange={(event) => {
                              if (bpmCommitTimerRef.current !== null) {
                                window.clearTimeout(bpmCommitTimerRef.current);
                                bpmCommitTimerRef.current = null;
                              }
                              queuedBpmValueRef.current = null;
                              setBpmDraft(event.target.value);
                            }}
                            onBlur={() => void commitBpm()}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void commitBpm();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                if (bpmCommitTimerRef.current !== null) {
                                  window.clearTimeout(bpmCommitTimerRef.current);
                                  bpmCommitTimerRef.current = null;
                                }
                                queuedBpmValueRef.current = null;
                                setBpmDraft(
                                  formatBpm(
                                    secondsPerBarToBpm(
                                      canvas?.secondsPerBar,
                                      normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8
                                    )
                                  )
                                );
                              }
                            }}
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          />
                          <span className="inline-flex flex-col gap-1">
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                const current =
                                  normalizeBpm(bpmDraft) ??
                                  secondsPerBarToBpm(
                                    canvas?.secondsPerBar,
                                    normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8
                                  );
                                const next = current + 1;
                                setBpmDraft(formatBpm(next));
                                scheduleBpmCommit(next);
                              }}
                              className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600"
                              title="Increase BPM"
                              aria-label="Increase BPM"
                            >
                              &#9650;
                            </button>
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                const current =
                                  normalizeBpm(bpmDraft) ??
                                  secondsPerBarToBpm(
                                    canvas?.secondsPerBar,
                                    normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8
                                  );
                                const next = Math.max(1, current - 1);
                                setBpmDraft(formatBpm(next));
                                scheduleBpmCommit(next);
                              }}
                              className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600"
                              title="Decrease BPM"
                              aria-label="Decrease BPM"
                              disabled={(normalizeBpm(bpmDraft) ?? 1) <= 1}
                            >
                              &#9660;
                            </button>
                          </span>
                        </span>
                      </label>
                      <label className="min-w-[172px] rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-slate-600">
                        <span className="mb-1 block">Beats/bar</span>
                        <span className="flex items-center gap-2">
                          <input
                            type="number"
                            step={1}
                            min={1}
                            max={64}
                            value={timeSignatureDraft}
                            onChange={(event) => {
                              if (timeSignatureCommitTimerRef.current !== null) {
                                window.clearTimeout(timeSignatureCommitTimerRef.current);
                                timeSignatureCommitTimerRef.current = null;
                              }
                              queuedTimeSignatureValueRef.current = null;
                              setTimeSignatureDraft(event.target.value);
                            }}
                            onBlur={() => void commitTimeSignature()}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void commitTimeSignature();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                if (timeSignatureCommitTimerRef.current !== null) {
                                  window.clearTimeout(timeSignatureCommitTimerRef.current);
                                  timeSignatureCommitTimerRef.current = null;
                                }
                                queuedTimeSignatureValueRef.current = null;
                                setTimeSignatureDraft(String(normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ?? 8));
                              }
                            }}
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          />
                          <span className="inline-flex flex-col gap-1">
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                const current =
                                  normalizeTimeSignature(timeSignatureDraft) ??
                                  normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ??
                                  8;
                                const next = current + 1;
                                setTimeSignatureDraft(String(Math.min(64, next)));
                                scheduleTimeSignatureCommit(next);
                              }}
                              className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600"
                              title="Increase beats per bar"
                              aria-label="Increase beats per bar"
                              disabled={(normalizeTimeSignature(timeSignatureDraft) ?? 8) >= 64}
                            >
                              &#9650;
                            </button>
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                const current =
                                  normalizeTimeSignature(timeSignatureDraft) ??
                                  normalizeTimeSignature(canvas?.editors[0]?.timeSignature) ??
                                  8;
                                const next = Math.max(1, current - 1);
                                setTimeSignatureDraft(String(next));
                                scheduleTimeSignatureCommit(next);
                              }}
                              className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600"
                              title="Decrease beats per bar"
                              aria-label="Decrease beats per bar"
                              disabled={(normalizeTimeSignature(timeSignatureDraft) ?? 8) <= 1}
                            >
                              &#9660;
                            </button>
                          </span>
                        </span>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setGlobalSnapToGridEnabled((prev) => !prev)}
                        className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                          globalSnapToGridEnabled
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                        title="Global snap to grid for all tracks. shortcut 'G'"
                      >
                        Snap to grid: {globalSnapToGridEnabled ? "On" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void router.push(transcriberHref)}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        title="Open the standalone transcriber"
                      >
                        Generate tabs
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex min-h-[1.25rem] flex-wrap items-center gap-3 text-xs">
                  <span className="muted">{saveStatus}</span>
                  {(nameSaving || bpmSaving) && !isGuestMode && <span className="muted">Saving draft...</span>}
                  {(nameError || bpmError) && <span className="error">{nameError || bpmError}</span>}
                  {(timeSignatureSaving || timeSignatureError) && (
                    <span className={timeSignatureError ? "error" : "muted"}>
                      {timeSignatureError || "Saving beats..."}
                    </span>
                  )}
                </div>
              </div>
            )}
            {isMobileViewport && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Time scale
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step={10}
                    min={TIMELINE_ZOOM_MIN}
                    max={TIMELINE_ZOOM_MAX}
                    value={timelineZoomPercent}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next)) return;
                      setTimelineZoomPercent(
                        Math.max(
                          TIMELINE_ZOOM_MIN,
                          Math.min(TIMELINE_ZOOM_MAX, Math.round(next / 10) * 10)
                        )
                      );
                    }}
                    className="w-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    title="Scale editor width in time direction"
                  />
                  <span className="text-sm text-slate-500">%</span>
                  <span className="inline-flex flex-col gap-1">
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        setTimelineZoomPercent((prev) =>
                          Math.min(TIMELINE_ZOOM_MAX, Math.max(TIMELINE_ZOOM_MIN, prev + 10))
                        )
                      }
                      className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600"
                      title="Increase time scale"
                      aria-label="Increase time scale"
                    >
                      &#9650;
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        setTimelineZoomPercent((prev) =>
                          Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, prev - 10))
                        )
                      }
                      className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600"
                      title="Decrease time scale"
                      aria-label="Decrease time scale"
                    >
                      &#9660;
                    </button>
                  </span>
                </div>
              </div>
            )}
          </div>
          <div
            className="button-row"
            style={
              isMobileViewport
                ? {
                    flex: "0 0 auto",
                    alignSelf: "flex-start",
                    position: "absolute",
                    top: 0,
                    right: 0,
                    gap: 6,
                  }
                : { flex: "0 0 auto", alignSelf: "flex-start" }
            }
          >
            {isGuestMode ? (
              <>
                <Link
                  href="/"
                  className={`button-secondary button-small ${isMobileViewport ? "rounded-md px-2 py-1 text-[11px]" : ""}`}
                  style={isMobileViewport ? { borderRadius: 10, padding: "6px 8px", fontSize: 11 } : undefined}
                >
                  {isMobileViewport ? "Home" : "Back home"}
                </Link>
                {session?.user?.id ? (
                  <button
                    type="button"
                    onClick={() => void router.push(saveToAccountPath)}
                    className={`button-primary button-small ${isMobileViewport ? "rounded-md px-2 py-1 text-[11px]" : ""}`}
                    style={isMobileViewport ? { borderRadius: 10, padding: "6px 8px", fontSize: 11 } : undefined}
                  >
                    {isMobileViewport ? "Save" : "Save draft to account"}
                  </button>
                ) : (
                  <>
                    <Link
                      href={loginSaveHref}
                      className={`button-secondary button-small ${isMobileViewport ? "rounded-md px-2 py-1 text-[11px]" : ""}`}
                      style={isMobileViewport ? { borderRadius: 10, padding: "6px 8px", fontSize: 11 } : undefined}
                    >
                      {isMobileViewport ? "Log in" : "Log in to save"}
                    </Link>
                    <Link
                      href={signupSaveHref}
                      className={`button-primary button-small ${isMobileViewport ? "rounded-md px-2 py-1 text-[11px]" : ""}`}
                      style={isMobileViewport ? { borderRadius: 10, padding: "6px 8px", fontSize: 11 } : undefined}
                    >
                      {isMobileViewport ? "Sign up" : "Create account"}
                    </Link>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => router.push("/gte")}
                  className={`button-secondary button-small ${isMobileViewport ? "rounded-md px-2 py-1 text-[11px]" : ""}`}
                  style={isMobileViewport ? { borderRadius: 10, padding: "6px 8px", fontSize: 11 } : undefined}
                >
                  {isMobileViewport ? "Editors" : "Back to editors"}
                </button>
                <button
                  type="button"
                  onClick={() => void router.push(`/gte/${editorId}/tabs`)}
                  className={`button-secondary button-small ${isMobileViewport ? "rounded-md px-2 py-1 text-[11px]" : ""}`}
                  style={isMobileViewport ? { borderRadius: 10, padding: "6px 8px", fontSize: 11 } : undefined}
                  title="Open ASCII tab view"
                >
                  {isMobileViewport ? "Tabs" : "View as tabs"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void commitCanvasToBackend({ force: true })}
              className={`button-save button-small ${isMobileViewport ? "rounded-md px-2 py-1 text-[11px]" : ""}`}
              disabled={savingCanvas || isGuestMode}
              aria-label={savingCanvas ? "Saving..." : "Save now"}
              title={savingCanvas ? "Saving..." : "Save now"}
              style={isMobileViewport ? { paddingInline: 8, minWidth: 32, minHeight: 32 } : { paddingInline: 10, minWidth: 40 }}
            >
              <img
                src="/icons/save-now.png"
                alt=""
                aria-hidden="true"
                draggable={false}
                style={{ width: 16, height: 16, display: "block" }}
              />
            </button>
          </div>
        </div>
        )}

        {isGuestMode && !isMobileEditMode && (
          <div className="notice">
            You are working without an account right now. This draft stays in this browser until you save it to your library.
          </div>
        )}
        {loading && <p className="muted text-small">Loading editor...</p>}
        {error && <div className="error">{error}</div>}
        {saveError && <div className="error">{saveError}</div>}
        {canvas && (
          <div
            className={`stack min-w-0 overflow-x-hidden ${
              isMobileEditMode ? "flex-1 min-h-0 space-y-0" : "space-y-2"
            }`}
          >
            {canvas.editors.map((lane, index) => {
              const laneId = lane.id || `ed-${index + 1}`;
              if (isMobileViewport && mobileEditLaneId && laneId !== mobileEditLaneId) {
                return null;
              }
              const laneEditorRef = buildLaneEditorRef(editorId, laneId);
              const isActive = laneId === activeLaneId;
              const isTrackMuted = Boolean(trackMuteById[laneId]);
              const isTrackIsolated = isolatedTrackId === laneId;
              const trackVolume = normalizeTrackVolume(trackVolumeById[laneId] ?? 1);
              const trackPan = normalizeTrackPan(trackPanById[laneId] ?? 0);
              const laneBarCount = getLaneBarCount(lane);
              const instrumentValue = trackInstrumentOptions.some(
                (option) => option.id === normalizeTrackInstrumentId(lane.instrumentId)
              )
                ? normalizeTrackInstrumentId(lane.instrumentId)
                : DEFAULT_TRACK_INSTRUMENT_ID;
              const instrumentLabel =
                trackInstrumentOptions.find((option) => option.id === instrumentValue)?.label || "Built-in synth";
              const tuning = getSnapshotTuning(lane);
              const mobileEditing = isMobileViewport && mobileEditLaneId === laneId;
              const mobileSelectedBars =
                isMobileViewport && barSelection?.laneId === laneId ? barSelection.barIndices : [];
              const mobileBarPasteIndex = mobileSelectedBars.length
                ? Math.max(...mobileSelectedBars) + 1
                : laneBarCount;
                return (
                  <section
                    key={laneId}
                    ref={(node) => {
                      trackSectionRefs.current[laneId] = node;
                    }}
                    data-gte-track="true"
                    data-gte-track-lane-id={laneId}
                    className={`relative w-full min-w-0 max-w-full ${
                      isMobileEditMode
                        ? "flex min-h-0 flex-1 flex-col"
                        : isMobileViewport
                        ? "rounded-lg"
                        : ""
                    }`}
                    style={mobileEditing ? { backgroundColor: "var(--bg)", minHeight: 0 } : undefined}
                    onMouseDownCapture={(event) => {
                      const target = event.target as HTMLElement | null;
                      const clickedBarSelector = Boolean(
                        target?.closest("[data-bar-select='true']")
                    );
                    if (activeLaneId !== laneId) {
                      setBarSelectionClearExemptEditorId(
                        clickedBarSelector ? laneEditorRef : null
                      );
                      setBarSelectionClearEpoch((prev) => prev + 1);
                    }
                    if (
                      activeLaneId !== laneId &&
                      (!event.shiftKey || clickedBarSelector)
                    ) {
                      setSelectionClearExemptEditorId(laneEditorRef);
                        setSelectionClearEpoch((prev) => prev + 1);
                      }
                      setActiveLaneId(laneId);
                      if (isMobileViewport) {
                        setPendingTrackReorder(null);
                        return;
                      }
                      if (event.button !== 0) {
                        setPendingTrackReorder(null);
                        return;
                      }
                      if (
                        target?.closest(
                          "button, a, input, textarea, select, label, [role='button'], [data-track-reorder-block='true']"
                        )
                      ) {
                        setPendingTrackReorder(null);
                        return;
                      }
                      setPendingTrackReorder({
                        laneId,
                        startY: event.clientY,
                      });
                    }}
                    onTouchStartCapture={(event) => {
                      const target = event.target as HTMLElement | null;
                      const clickedBarSelector = Boolean(target?.closest("[data-bar-select='true']"));
                      if (activeLaneId !== laneId) {
                        setBarSelectionClearExemptEditorId(clickedBarSelector ? laneEditorRef : null);
                        setBarSelectionClearEpoch((prev) => prev + 1);
                        setOpenMobileBarMenuLaneId(null);
                      }
                      if (activeLaneId !== laneId) {
                        setSelectionClearExemptEditorId(laneEditorRef);
                        setSelectionClearEpoch((prev) => prev + 1);
                      }
                      setActiveLaneId(laneId);
                      setPendingTrackReorder(null);
                    }}
                  >
                    {trackDragLaneId !== null && trackDropIndex === index && (
                      <div className="pointer-events-none absolute -top-1 left-4 right-4 z-30 h-1 rounded-full bg-sky-400 shadow-sm" />
                    )}
                    {trackDragLaneId !== null && trackDropIndex === index + 1 && (
                      <div className="pointer-events-none absolute -bottom-1 left-4 right-4 z-30 h-1 rounded-full bg-sky-400 shadow-sm" />
                    )}
                    {isMobileViewport ? (
                      mobileEditing ? (
                        <div className="flex min-h-0 flex-1 flex-col justify-center">
                          {mobileSelectedBars.length > 0 && (
                            <div className="mb-2 flex justify-end">
                              <div
                                className="relative"
                                data-mobile-bar-menu="true"
                                data-mobile-bar-menu-editor={laneEditorRef}
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setOpenTrackMenuId(null);
                                    setOpenMobileBarMenuLaneId((prev) => (prev === laneId ? null : laneId));
                                  }}
                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm"
                                  title="Bar actions"
                                  aria-label="Bar actions"
                                >
                                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                                    <circle cx="12" cy="5" r="1.8" />
                                    <circle cx="12" cy="12" r="1.8" />
                                    <circle cx="12" cy="19" r="1.8" />
                                  </svg>
                                </button>
                                {openMobileBarMenuLaneId === laneId && (
                                  <div className="absolute right-0 top-11 z-40 w-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                                    <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                      {mobileSelectedBars.length} selected
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleCopySelectedBars(laneId, mobileSelectedBars);
                                        setOpenMobileBarMenuLaneId(null);
                                      }}
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      Copy
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handlePasteBars(laneId, mobileBarPasteIndex);
                                        setOpenMobileBarMenuLaneId(null);
                                      }}
                                      disabled={!barClipboard}
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                                    >
                                      Paste
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleDeleteSelectedBars(laneId, mobileSelectedBars);
                                        setOpenMobileBarMenuLaneId(null);
                                      }}
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="min-h-0 overflow-hidden rounded-2xl">
                            <GteWorkspace
                              editorId={laneEditorRef}
                              snapshot={lane}
                              onSnapshotChange={(nextSnapshot, options) =>
                                handleLaneSnapshotChange(laneId, nextSnapshot, options)
                              }
                              allowBackend
                              embedded
                              isActive
                              mobileViewport
                              mobileMode="edit"
                              onFocusWorkspace={() => setActiveLaneId(laneId)}
                              globalSnapToGridEnabled={globalSnapToGridEnabled}
                              onGlobalSnapToGridEnabledChange={setGlobalSnapToGridEnabled}
                              sharedTimeSignature={normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8}
                              sharedViewportBarCount={sharedViewportBarCount}
                              sharedTimelineScrollRatio={sharedTimelineScrollRatio}
                              onSharedTimelineScrollRatioChange={handleSharedTimelineScrollRatioChange}
                              timelineZoomFactor={timelineZoomPercent / 100}
                              historyUndoCount={canvasUndoCount}
                              historyRedoCount={canvasRedoCount}
                              onRequestUndo={handleCanvasUndo}
                              onRequestRedo={handleCanvasRedo}
                              globalPlaybackFrame={globalPlaybackFrame}
                              globalPlaybackIsPlaying={globalPlaybackIsPlaying}
                              globalPlaybackVolume={globalPlaybackVolume}
                              globalPlaybackTimelineEnd={canvasTimelineEnd}
                              onGlobalPlaybackToggle={toggleGlobalPlayback}
                              onGlobalPlaybackFrameChange={seekGlobalPlayback}
                              onGlobalPlaybackVolumeChange={handleGlobalPlaybackVolumeChange}
                              onGlobalPlaybackSkipToStart={skipGlobalPlaybackToStart}
                              onGlobalPlaybackSkipBackwardBar={skipGlobalPlaybackBackwardBar}
                              onGlobalPlaybackSkipForwardBar={skipGlobalPlaybackForwardBar}
                              practiceLoopEnabled={practiceLoopEnabled}
                              practiceLoopRange={globalPracticeLoopRange}
                              onPracticeLoopEnabledChange={setPracticeLoopEnabled}
                              metronomeEnabled={metronomeEnabled}
                              onMetronomeEnabledChange={setMetronomeEnabled}
                              countInEnabled={countInEnabled}
                              onCountInEnabledChange={setCountInEnabled}
                              speedTrainerEnabled={speedTrainerEnabled}
                              onSpeedTrainerEnabledChange={setSpeedTrainerEnabled}
                              speedTrainerTarget={speedTrainerTarget}
                              onSpeedTrainerTargetChange={setSpeedTrainerTarget}
                              speedTrainerStep={speedTrainerStep}
                              onSpeedTrainerStepChange={setSpeedTrainerStep}
                              playbackSpeed={normalizedPlaybackSpeed}
                              onPlaybackSpeedChange={setPlaybackSpeed}
                              showToolbarWhenInactive={false}
                              multiTrackSelectionActive={multiTrackSelectionActive}
                              onSelectionStateChange={(selection) =>
                                handleLaneSelectionStateChange(laneId, selection)
                              }
                              onRequestGlobalSelectedShift={(deltaFrames) =>
                                handleGlobalSelectedShift(laneId, deltaFrames)
                              }
                              selectionClearEpoch={selectionClearEpoch}
                              selectionClearExemptEditorId={selectionClearExemptEditorId}
                              barSelectionClearEpoch={barSelectionClearEpoch}
                              barSelectionClearExemptEditorId={barSelectionClearExemptEditorId}
                              onBarSelectionStateChange={(barIndices) =>
                                handleBarSelectionStateChange(laneId, barIndices)
                              }
                              onRequestSelectedBarsCopy={(barIndices) =>
                                void handleCopySelectedBars(laneId, barIndices)
                              }
                              onRequestSelectedBarsPaste={(insertIndex) =>
                                void handlePasteBars(laneId, insertIndex)
                              }
                              onRequestSelectedBarsDelete={(barIndices) =>
                                void handleDeleteSelectedBars(laneId, barIndices)
                              }
                              barClipboardAvailable={Boolean(barClipboard)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div
                            className={`flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-sm ${
                              isActive ? "border-sky-300 bg-sky-50/80" : "border-slate-200 bg-white"
                            }`}
                            data-track-reorder-block="true"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-semibold text-slate-800">Track {index + 1}</div>
                                {mobileSelectedBars.length > 0 && (
                                  <div
                                    className="relative shrink-0"
                                    data-mobile-bar-menu="true"
                                    data-mobile-bar-menu-editor={laneEditorRef}
                                  >
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setOpenTrackMenuId(null);
                                        setOpenMobileBarMenuLaneId((prev) => (prev === laneId ? null : laneId));
                                      }}
                                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm"
                                      title="Bar actions"
                                      aria-label="Bar actions"
                                    >
                                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                                        <circle cx="12" cy="5" r="1.8" />
                                        <circle cx="12" cy="12" r="1.8" />
                                        <circle cx="12" cy="19" r="1.8" />
                                      </svg>
                                    </button>
                                    {openMobileBarMenuLaneId === laneId && (
                                      <div className="absolute left-0 top-8 z-40 w-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                                        <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                          {mobileSelectedBars.length} selected
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void handleCopySelectedBars(laneId, mobileSelectedBars);
                                            setOpenMobileBarMenuLaneId(null);
                                          }}
                                          className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                          Copy
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void handlePasteBars(laneId, mobileBarPasteIndex);
                                            setOpenMobileBarMenuLaneId(null);
                                          }}
                                          disabled={!barClipboard}
                                          className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                                        >
                                          Paste
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void handleDeleteSelectedBars(laneId, mobileSelectedBars);
                                            setOpenMobileBarMenuLaneId(null);
                                          }}
                                          className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-slate-500">
                                {instrumentLabel} - Bars: {laneBarCount}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => activateLaneForEditing(laneId)}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                            >
                              Edit
                            </button>
                            <div className="relative" data-track-menu="true">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setOpenMobileBarMenuLaneId(null);
                                  setOpenTrackMenuId((prev) => (prev === laneId ? null : laneId));
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
                                title="Track options"
                                aria-label="Track options"
                              >
                                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                                  <circle cx="12" cy="5" r="1.8" />
                                  <circle cx="12" cy="12" r="1.8" />
                                  <circle cx="12" cy="19" r="1.8" />
                                </svg>
                              </button>
                              {openTrackMenuId === laneId && (
                                <div className="absolute right-0 top-11 z-30 w-60 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Sound
                                    <select
                                      value={instrumentValue}
                                      onChange={(event) => handleLaneInstrumentChange(laneId, event.target.value)}
                                      className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                                    >
                                      {trackInstrumentOptions.map((option) => (
                                        <option key={`${laneId}-mobile-instrument-${option.id}`} value={option.id}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <div className="mt-3 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleTrackMute(laneId)}
                                      className={`flex-1 rounded-md border px-2 py-2 text-xs font-semibold ${
                                        isTrackMuted
                                          ? "border-amber-300 bg-amber-50 text-amber-700"
                                          : "border-slate-200 bg-white text-slate-600"
                                      }`}
                                    >
                                      {isTrackMuted ? "Muted" : "Mute"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleTrackIsolation(laneId)}
                                      className={`flex-1 rounded-md border px-2 py-2 text-xs font-semibold ${
                                        isTrackIsolated
                                          ? "border-sky-500 bg-sky-500 text-white"
                                          : "border-slate-200 bg-white text-slate-600"
                                      }`}
                                    >
                                      {isTrackIsolated ? "Isolated" : "Isolate"}
                                    </button>
                                  </div>
                                  <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Volume
                                    <div className="mt-2 flex items-center gap-3">
                                      <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={trackVolume}
                                        onChange={(event) => handleTrackVolumeChange(laneId, Number(event.target.value))}
                                        className="flex-1 accent-slate-700"
                                      />
                                      <span className="w-10 text-right text-xs text-slate-500">
                                        {Math.round(trackVolume * 100)}%
                                      </span>
                                    </div>
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenTrackMenuId(null);
                                      requestDeleteTrack(laneId);
                                    }}
                                    className="mt-3 block w-full rounded-md bg-rose-50 px-3 py-2 text-left text-xs font-semibold text-rose-600"
                                    disabled={deletingLaneId === laneId}
                                  >
                                    {deletingLaneId === laneId ? "Removing..." : "Remove track"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="max-h-[220px] overflow-hidden rounded-2xl">
                            <GteWorkspace
                              editorId={laneEditorRef}
                              snapshot={lane}
                              onSnapshotChange={(nextSnapshot, options) =>
                                handleLaneSnapshotChange(laneId, nextSnapshot, options)
                              }
                              allowBackend
                              embedded
                              isActive={isActive}
                              mobileViewport
                              mobileMode="canvas"
                              onFocusWorkspace={() => setActiveLaneId(laneId)}
                              globalSnapToGridEnabled={globalSnapToGridEnabled}
                              onGlobalSnapToGridEnabledChange={setGlobalSnapToGridEnabled}
                              sharedTimeSignature={normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8}
                              sharedViewportBarCount={sharedViewportBarCount}
                              sharedTimelineScrollRatio={sharedTimelineScrollRatio}
                              onSharedTimelineScrollRatioChange={handleSharedTimelineScrollRatioChange}
                              timelineZoomFactor={timelineZoomPercent / 100}
                              historyUndoCount={canvasUndoCount}
                              historyRedoCount={canvasRedoCount}
                              onRequestUndo={handleCanvasUndo}
                              onRequestRedo={handleCanvasRedo}
                              globalPlaybackFrame={globalPlaybackFrame}
                              globalPlaybackIsPlaying={globalPlaybackIsPlaying}
                              globalPlaybackVolume={globalPlaybackVolume}
                              globalPlaybackTimelineEnd={canvasTimelineEnd}
                              onGlobalPlaybackToggle={toggleGlobalPlayback}
                              onGlobalPlaybackFrameChange={seekGlobalPlayback}
                              onGlobalPlaybackVolumeChange={handleGlobalPlaybackVolumeChange}
                              onGlobalPlaybackSkipToStart={skipGlobalPlaybackToStart}
                              onGlobalPlaybackSkipBackwardBar={skipGlobalPlaybackBackwardBar}
                              onGlobalPlaybackSkipForwardBar={skipGlobalPlaybackForwardBar}
                              practiceLoopEnabled={practiceLoopEnabled}
                              practiceLoopRange={globalPracticeLoopRange}
                              onPracticeLoopEnabledChange={setPracticeLoopEnabled}
                              metronomeEnabled={metronomeEnabled}
                              onMetronomeEnabledChange={setMetronomeEnabled}
                              countInEnabled={countInEnabled}
                              onCountInEnabledChange={setCountInEnabled}
                              speedTrainerEnabled={speedTrainerEnabled}
                              onSpeedTrainerEnabledChange={setSpeedTrainerEnabled}
                              speedTrainerTarget={speedTrainerTarget}
                              onSpeedTrainerTargetChange={setSpeedTrainerTarget}
                              speedTrainerStep={speedTrainerStep}
                              onSpeedTrainerStepChange={setSpeedTrainerStep}
                              playbackSpeed={normalizedPlaybackSpeed}
                              onPlaybackSpeedChange={setPlaybackSpeed}
                              showToolbarWhenInactive={index === 0 && activeLaneId === null}
                              multiTrackSelectionActive={multiTrackSelectionActive}
                              onSelectionStateChange={(selection) =>
                                handleLaneSelectionStateChange(laneId, selection)
                              }
                              onRequestGlobalSelectedShift={(deltaFrames) =>
                                handleGlobalSelectedShift(laneId, deltaFrames)
                              }
                              selectionClearEpoch={selectionClearEpoch}
                              selectionClearExemptEditorId={selectionClearExemptEditorId}
                              barSelectionClearEpoch={barSelectionClearEpoch}
                              barSelectionClearExemptEditorId={barSelectionClearExemptEditorId}
                              onBarSelectionStateChange={(barIndices) =>
                                handleBarSelectionStateChange(laneId, barIndices)
                              }
                              onRequestSelectedBarsCopy={(barIndices) =>
                                void handleCopySelectedBars(laneId, barIndices)
                              }
                              onRequestSelectedBarsPaste={(insertIndex) =>
                                void handlePasteBars(laneId, insertIndex)
                              }
                              onRequestSelectedBarsDelete={(barIndices) =>
                                void handleDeleteSelectedBars(laneId, barIndices)
                              }
                              barClipboardAvailable={Boolean(barClipboard)}
                            />
                          </div>
                        </div>
                      )
                    ) : (
                    <div className="flex flex-col gap-3 lg:flex-row">
                      <aside
                        className="w-full shrink-0 rounded-xl border border-slate-200 bg-white/90 p-2 shadow-sm lg:w-28"
                        data-track-reorder-block="true"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Track
                          </span>
                          <span className="text-[11px] font-semibold text-slate-600">
                            Bars: {laneBarCount}
                          </span>
                        </div>
                        <div className="mt-2 min-w-0">
                          <select
                            value={instrumentValue}
                            onChange={(event) => handleLaneInstrumentChange(laneId, event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700 shadow-sm"
                            title="Track sound"
                            aria-label="Track sound"
                          >
                            {trackInstrumentOptions.map((option) => (
                              <option key={`${laneId}-instrument-${option.id}`} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-2 min-w-0 space-y-1.5">
                          <select
                            value={tuning.presetId}
                            onChange={(event) => handleLaneTuningChange(laneId, event.target.value, tuning.capo)}
                            onClick={(event) => event.stopPropagation()}
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700 shadow-sm"
                            title="Track tuning"
                            aria-label="Track tuning"
                          >
                            {TUNING_PRESETS.map((preset) => (
                              <option key={`${laneId}-tuning-${preset.id}`} value={preset.id}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                            Capo
                            <input
                              type="number"
                              min={0}
                              max={12}
                              value={tuning.capo}
                              onChange={(event) =>
                                handleLaneTuningChange(laneId, tuning.presetId, Number(event.target.value))
                              }
                              onClick={(event) => event.stopPropagation()}
                              className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700 shadow-sm"
                              title="Track capo"
                              aria-label="Track capo"
                            />
                          </label>
                        </div>
                        <div className="mt-2 flex w-full flex-col items-center gap-2">
                          <div className="flex flex-col items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleTrackMute(laneId);
                              }}
                              className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
                                isTrackMuted
                                  ? "border-amber-300 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                              title={isTrackMuted ? "Unmute track" : "Mute track"}
                              aria-label={isTrackMuted ? "Unmute track" : "Mute track"}
                            >
                              {isTrackMuted ? (
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                                  <path d="M4 10v4h4l5 4V6L8 10H4z" />
                                  <path d="M16 9.4l1.4-1.4L20 10.6l2.6-2.6L24 9.4 21.4 12l2.6 2.6-1.4 1.4-2.6-2.6-2.6 2.6-1.4-1.4 2.6-2.6-2.6-2.6z" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                                  <path d="M4 10v4h4l5 4V6L8 10H4z" />
                                  <path d="M16 8a4 4 0 0 1 0 8v-2a2 2 0 0 0 0-4V8z" />
                                </svg>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleTrackIsolation(laneId);
                              }}
                              className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
                                isTrackIsolated
                                  ? "border-sky-500 bg-sky-500 text-white hover:bg-sky-400"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                              title={isTrackIsolated ? "Stop isolating track" : "Isolate track"}
                              aria-label={isTrackIsolated ? "Stop isolating track" : "Isolate track"}
                            >
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                                <path d="M12 4a8 8 0 0 0-8 8v5a3 3 0 0 0 3 3h2v-7H6v-1a6 6 0 0 1 12 0v1h-3v7h2a3 3 0 0 0 3-3v-5a8 8 0 0 0-8-8z" />
                              </svg>
                            </button>
                          </div>
                          <div className="flex w-full min-w-0 items-center gap-1">
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={trackVolume}
                              onChange={(event) => handleTrackVolumeChange(laneId, Number(event.target.value))}
                              onClick={(event) => event.stopPropagation()}
                              className="w-[90%] h-2 accent-slate-700"
                              title="Track volume"
                              aria-label="Track volume"
                            />
                            <div className="w-5 shrink-0 text-right text-[10px] font-medium text-slate-500">
                              {Math.round(trackVolume * 100)}%
                            </div>
                          </div>
                          <div className="flex w-full min-w-0 items-center gap-1">
                            <input
                              type="range"
                              min={-1}
                              max={1}
                              step={0.01}
                              value={trackPan}
                              onChange={(event) => handleTrackPanChange(laneId, Number(event.target.value))}
                              onClick={(event) => event.stopPropagation()}
                              className="w-[90%] h-2 accent-sky-700"
                              title="Track pan"
                              aria-label="Track pan"
                            />
                            <div className="w-5 shrink-0 text-right text-[10px] font-medium text-slate-500">
                              {trackPan < -0.05
                                ? `L${Math.round(Math.abs(trackPan) * 100)}`
                                : trackPan > 0.05
                                ? `R${Math.round(trackPan * 100)}`
                                : "C"}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-center" data-track-menu="true">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setOpenTrackMenuId((prev) => (prev === laneId ? null : laneId));
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              title="Track options"
                              aria-label="Track options"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                                <circle cx="12" cy="5" r="1.8" />
                                <circle cx="12" cy="12" r="1.8" />
                                <circle cx="12" cy="19" r="1.8" />
                              </svg>
                            </button>
                            {openTrackMenuId === laneId && (
                              <div className="absolute left-1/2 top-8 z-30 min-w-[120px] -translate-x-1/2 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenTrackMenuId(null);
                                    requestDeleteTrack(laneId);
                                  }}
                                  className="block w-full px-3 py-1.5 text-left text-[10px] font-medium text-rose-600 hover:bg-rose-50"
                                  disabled={deletingLaneId === laneId}
                                >
                                  {deletingLaneId === laneId ? "..." : "Remove track"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </aside>
                      <div className="min-w-0 flex-1">
                        <GteWorkspace
                          editorId={laneEditorRef}
                          snapshot={lane}
                          onSnapshotChange={(nextSnapshot, options) =>
                            handleLaneSnapshotChange(laneId, nextSnapshot, options)
                          }
                          allowBackend
                          embedded
                          isActive={isActive}
                          mobileViewport={isMobileViewport}
                          onFocusWorkspace={() => activateLaneForEditing(laneId)}
                          globalSnapToGridEnabled={globalSnapToGridEnabled}
                          onGlobalSnapToGridEnabledChange={setGlobalSnapToGridEnabled}
                          sharedTimeSignature={normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8}
                          sharedViewportBarCount={sharedViewportBarCount}
                          sharedTimelineScrollRatio={sharedTimelineScrollRatio}
                          onSharedTimelineScrollRatioChange={handleSharedTimelineScrollRatioChange}
                          timelineZoomFactor={timelineZoomPercent / 100}
                          historyUndoCount={canvasUndoCount}
                          historyRedoCount={canvasRedoCount}
                          onRequestUndo={handleCanvasUndo}
                          onRequestRedo={handleCanvasRedo}
                          globalPlaybackFrame={globalPlaybackFrame}
                          globalPlaybackIsPlaying={globalPlaybackIsPlaying}
                          globalPlaybackVolume={globalPlaybackVolume}
                          globalPlaybackTimelineEnd={canvasTimelineEnd}
                          onGlobalPlaybackToggle={toggleGlobalPlayback}
                          onGlobalPlaybackFrameChange={seekGlobalPlayback}
                          onGlobalPlaybackVolumeChange={handleGlobalPlaybackVolumeChange}
                          onGlobalPlaybackSkipToStart={skipGlobalPlaybackToStart}
                          onGlobalPlaybackSkipBackwardBar={skipGlobalPlaybackBackwardBar}
                          onGlobalPlaybackSkipForwardBar={skipGlobalPlaybackForwardBar}
                          practiceLoopEnabled={practiceLoopEnabled}
                          practiceLoopRange={globalPracticeLoopRange}
                          onPracticeLoopEnabledChange={setPracticeLoopEnabled}
                          metronomeEnabled={metronomeEnabled}
                          onMetronomeEnabledChange={setMetronomeEnabled}
                          countInEnabled={countInEnabled}
                          onCountInEnabledChange={setCountInEnabled}
                          speedTrainerEnabled={speedTrainerEnabled}
                          onSpeedTrainerEnabledChange={setSpeedTrainerEnabled}
                          speedTrainerTarget={speedTrainerTarget}
                          onSpeedTrainerTargetChange={setSpeedTrainerTarget}
                          speedTrainerStep={speedTrainerStep}
                          onSpeedTrainerStepChange={setSpeedTrainerStep}
                          playbackSpeed={normalizedPlaybackSpeed}
                          onPlaybackSpeedChange={setPlaybackSpeed}
                          showToolbarWhenInactive={
                            isMobileViewport ? index === 0 && !mobileEditLaneId : activeLaneId === null && index === 0
                          }
                          multiTrackSelectionActive={multiTrackSelectionActive}
                          onSelectionStateChange={(selection) =>
                            handleLaneSelectionStateChange(laneId, selection)
                          }
                          onRequestGlobalSelectedShift={(deltaFrames) =>
                            handleGlobalSelectedShift(laneId, deltaFrames)
                          }
                          selectionClearEpoch={selectionClearEpoch}
                          selectionClearExemptEditorId={selectionClearExemptEditorId}
                          barSelectionClearEpoch={barSelectionClearEpoch}
                          barSelectionClearExemptEditorId={barSelectionClearExemptEditorId}
                          onBarSelectionStateChange={(barIndices) =>
                            handleBarSelectionStateChange(laneId, barIndices)
                          }
                          onRequestSelectedBarsCopy={(barIndices) =>
                            void handleCopySelectedBars(laneId, barIndices)
                          }
                          onRequestSelectedBarsPaste={(insertIndex) =>
                            void handlePasteBars(laneId, insertIndex)
                          }
                          onRequestSelectedBarsDelete={(barIndices) =>
                            void handleDeleteSelectedBars(laneId, barIndices)
                          }
                          barClipboardAvailable={Boolean(barClipboard)}
                          activeBarDrag={barDragState}
                          onBarDragStart={(barIndices) => {
                            const nextBarIndices =
                              barSelection?.laneId === laneId ? barSelection.barIndices : barIndices;
                            setOpenMobileBarMenuLaneId(null);
                            setBarDragState({ sourceLaneId: laneId, barIndices: [...nextBarIndices] });
                          }}
                          onBarDragEnd={() => setBarDragState(null)}
                          onRequestBarDrop={(insertIndex) => {
                            if (!barDragState) return;
                            void handleMoveSelectedBars(
                              barDragState.sourceLaneId,
                              barDragState.barIndices,
                              laneId,
                              insertIndex
                            );
                          }}
                        />
                      </div>
                    </div>
                    )}
                  {trackDragLaneId === laneId && (
                    <div className="pointer-events-none absolute inset-0 z-10 rounded-xl border border-sky-300 bg-sky-100/20" />
                  )}
                </section>
              );
            })}
            {(!isMobileViewport || !mobileEditLaneId) && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => void handleAddLane()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={addingLane}
                  title={addingLane ? "Adding track..." : "Add track"}
                  aria-label={addingLane ? "Adding track" : "Add track"}
                >
                  +
                </button>
              </div>
            )}
          </div>
        )}

        {confirmDeleteTrackId && (
          <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/30 px-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <h2 className="text-base font-semibold text-slate-900">Remove track?</h2>
              <p className="mt-2 text-sm text-slate-600">
                This will permanently delete the track and its notes/chords. You cannot undo this action.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() => setConfirmDeleteTrackId(null)}
                  disabled={Boolean(deletingLaneId)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button-danger button-small"
                  onClick={() => void handleDeleteLane(confirmDeleteTrackId)}
                  disabled={Boolean(deletingLaneId)}
                >
                  {deletingLaneId === confirmDeleteTrackId ? "Removing..." : "Remove track"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const editorId = `${ctx.params?.editor_id || ""}`;
  const normalizedEditorId = editorId.trim().toLowerCase();
  if (normalizedEditorId === GTE_GUEST_EDITOR_ID) {
    return { props: { editorId: GTE_GUEST_EDITOR_ID, isGuestMode: true } };
  }

  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }
  return { props: { editorId, isGuestMode: false } };
};
