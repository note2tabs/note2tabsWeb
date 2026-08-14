import { GetServerSideProps } from "next";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUiEvent,
} from "react";
import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import { authOptions } from "../api/auth/[...nextauth]";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { buildLaneEditorRef, gteApi, normalizeEditorName } from "../../lib/gteApi";
import { buildTrackMergePlan } from "../../lib/gteTrackMerge";
import {
  PLAYBACK_SPEED_OPTIONS,
  SPEED_TRAINER_START_OPTIONS,
  SPEED_TRAINER_STEP_OPTIONS,
  SPEED_TRAINER_TARGET_OPTIONS,
  equalPowerPanGains,
  nextSpeedTrainerValue,
  normalizePlaybackSpeed,
  normalizeTrackPan,
  resolvePracticePlaybackStart,
  resolvePracticeLoopRange,
} from "../../lib/gtePractice";
import {
  buildTimingMapMetronomeClicks,
  frameDurationSeconds,
  frameToSeconds,
  normalizeTimingMap,
  secondsToFrame,
  timingMapForCanvas,
} from "../../lib/gteTiming";
import {
  buildPracticeRatingBars,
  encodeMonoWav,
  normalizePracticeRatingReplay,
  trimPracticeRecordingSamples,
  type PracticeRatingReplay,
} from "../../lib/gtePracticeRating";
import {
  deletePracticeReplayAudio,
  readPracticeReplayAudio,
  storePracticeReplayAudio,
} from "../../lib/gtePracticeReplayAudio";
import {
  DEFAULT_TRACK_INSTRUMENT_ID,
  getTrackInstrumentOptions,
  loadTrackInstrumentOptions,
  normalizeTrackInstrumentId,
  prepareTrackInstrument,
  schedulePreparedTrackNote,
  type TrackInstrumentOption,
  warmTrackInstrument,
} from "../../lib/gteSamplePlayback";
import { buildDiscreteSlideSteps } from "../../lib/gteSlidePlayback";
import { getOpenStringMidiFromSnapshot } from "../../lib/gteTuning";
import {
  getDrumVoiceForNote,
  isDrumTrackType,
  isSupportedDrumNote,
  type DrumVoiceId,
} from "../../lib/gteDrums";
import {
  prepareDrumKit,
  schedulePreparedDrumHit,
} from "../../lib/gteDrumPlayback";
import {
  materializeDrumLoopNotes,
  normalizeDrumLoops,
  preserveDrumLoopsAcrossCanvasUpdate,
} from "../../lib/gteDrumLoops";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";
import { getChordEditorMidiNotes } from "../../lib/gteChordEditor";
import { buildChordPlaybackWindows } from "../../lib/gteChordPlayback";
import GteFileImportButton from "../../components/GteFileImportButton";
import { EditorLoadingState } from "../../components/EditorLoadingState";
import {
  GTE_EXPORT_FORMAT_OPTIONS,
  buildGteExportFile,
  downloadGteExportFile,
  type GteExportFormat,
} from "../../lib/gteTabExport";
import {
  detectGteScale,
  getRelativeScaleMatches,
  type RelativeScaleMatch,
} from "../../lib/gteScaleDetection";
import {
  DEFAULT_GTE_DISPLAY_PREFERENCES,
  readGteDisplayPreferences,
  writeGteDisplayPreferences,
  type GteDisplayPreferences,
} from "../../lib/gteDisplayPreferences";
import {
  GTE_GUEST_EDITOR_ID,
  createGuestSnapshot,
  readGuestDraft,
} from "../../lib/gteGuestDraft";
import {
  TUNING_PRESETS,
  applyTuningToSnapshot,
  applyTuningToSnapshotPreservingSound,
  getSnapshotTuning,
  normalizeCapo,
} from "../../lib/gteTuning";
import NoIndexHead from "../../components/NoIndexHead";
import {
  incrementGtePlaybackFrameUpdates,
  recordGtePerfMeasure,
  useGteRenderInstrumentation,
} from "../../lib/gtePerformanceDiagnostics";
import {
  normalizeTrackOffsetFrames,
  offsetTrackToFrame,
} from "../../lib/gteTrackOffset";
import { appendBoundedHistory, replaceCanvasLane } from "../../lib/gteEditorPerformance";
import { createPlaybackLookaheadScheduler } from "../../lib/gtePlaybackLookahead";
import { getPlaybackScrollTarget } from "../../lib/gtePlaybackScroll";
import {
  GTE_TIMELINE_END_PADDING,
  GTE_TIMELINE_GUTTER_WIDTH,
} from "../../lib/gteTimelineGeometry";

const GteWorkspace = dynamic(() => import("../../components/GteTrackWorkspace"), {
  loading: () => (
    <div className="gte-workspace-loading" role="status" aria-label="Loading editor controls" />
  ),
});

type Props = {
  editorId: string;
  isGuestMode: boolean;
};

type TrackOffsetSession = {
  laneId: string;
  baseCanvas: CanvasSnapshot;
  startOffsetFrames: number;
  previewOffsetFrames: number;
  previousZoomPercent: number;
};

type TopMenuId =
  | "file"
  | "edit"
  | "generate"
  | "snapping"
  | "cursor"
  | "view"
  | "playback"
  | "help";

const FIXED_FRAMES_PER_BAR = 480;
const GLOBAL_PLAYBACK_LOOKAHEAD_SECONDS = 4;
const DEFAULT_SECONDS_PER_BAR = 2;
const CANVAS_AUTOSAVE_MS = 20000;
const MAX_CANVAS_HISTORY = 64;
const TIMELINE_ZOOM_MIN = 15;
const TIMELINE_ZOOM_MAX = 200;
const TIMELINE_ZOOM_DEFAULT = 100;
const SNAP_TO_KEY_STORAGE_PREFIX = "note2tabs:gte:snap-to-key:";
const CHORD_DIAGRAM_HANDEDNESS_STORAGE_PREFIX = "note2tabs:gte:chord-diagram-left-handed:";
const CONTROL_COMMIT_DEBOUNCE_MS = 350;
const TIME_SIGNATURE_TOP_OPTIONS = Array.from({ length: 64 }, (_, index) => index + 1);
const TIME_SIGNATURE_BOTTOM_OPTIONS = [1, 2, 4, 8, 16, 32, 64];
const NOTE_LENGTH_FRACTION_DENOMINATORS = [0.5, 1, 2, 3, 4, 8, 16, 32];
const CURSOR_SIZE_FRACTION_DENOMINATORS = [1, 2, 3, 4, 8, 16, 32, 64];
const SNAP_SUBDIVISION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
const TOOL_SHORTCUT_HELP = [
  ["Scale", "S"],
  ["Cycle scale mode", "D"],
  ["Move tool", "M"],
  ["Slice tool", "Shift+S"],
  ["Cut playing coordinates", "K"],
  ["Merge to chord", "C"],
  ["Disband chord", "Shift+L"],
  ["Merge notes", "J"],
  ["Optimize notes", "O"],
  ["Hammer/Pull", "H"],
  ["Slide", "L"],
  ["Bend", "B"],
  ["Toggle grid snapping", "G"],
  ["Confirm active tool", "Enter"],
  ["Cancel active tool", "Escape"],
] as const;
const TRACK_CURSOR_SHORTCUT_HELP = [
  ["Move cursor", "Arrow keys"],
  ["Select or cycle item", "Enter"],
  ["Add item to selection", "Shift+Enter"],
  ["Add note or set fret", "0–9"],
  ["Raise or lower fret", "+ / −"],
  ["Move selection in time", "Ctrl/Cmd+←/→"],
  ["Move notes between strings", "Ctrl/Cmd+↑/↓"],
  ["Select all notes and chords", "A"],
  ["Copy selection", "Ctrl/Cmd+C"],
  ["Paste selection", "Ctrl/Cmd+V"],
  ["Delete selection", "Delete/Backspace"],
  ["Clear selection or cancel", "Escape"],
] as const;
const SHORTCUT_HELP_SECTIONS: ReadonlyArray<
  readonly [string, ReadonlyArray<readonly [string, string]>]
> = [
  ["Tools", TOOL_SHORTCUT_HELP],
  ["Track cursor", TRACK_CURSOR_SHORTCUT_HELP],
];

const KEY_BASE_OPTIONS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEY_TYPE_OPTIONS = [
  "Major",
  "Minor",
  "Harmonic Minor",
  "Melodic Minor",
  "Dorian",
  "Phyrigian",
  "Lydian",
  "Mixolydian",
  "Major Blues",
  "Minor Blues",
];
const MOBILE_EDITOR_BREAKPOINT_PX = 768;
const GTE_GUEST_CANVAS_STORAGE_KEY = "note2tabs:gte:guest-canvas:v1";
const AUDIO_CONTEXT_RESUME_ERROR =
  "Your browser blocked audio playback. Tap Play again to allow sound.";
const PRACTICE_RATING_UI_ENABLED = false;

const serializeForInlineScript = (value: string) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

function resumeAudioContext(ctx: AudioContext): Promise<void> {
  try {
    return Promise.resolve(ctx.resume())
      .then(() => {
        if (ctx.state !== "running") {
          throw new Error(AUDIO_CONTEXT_RESUME_ERROR);
        }
      })
      .catch(() => {
        throw new Error(AUDIO_CONTEXT_RESUME_ERROR);
      });
  } catch {
    return Promise.reject(new Error(AUDIO_CONTEXT_RESUME_ERROR));
  }
}

function closeAudioContext(ctx: AudioContext) {
  if (ctx.state === "closed") return;
  void ctx.close().catch(() => undefined);
}

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

const normalizeKeyBase = (value: unknown) =>
  Math.max(0, Math.min(KEY_BASE_OPTIONS.length - 1, Math.round(toNumber(value, 0))));

const normalizeKeyType = (value: unknown) =>
  Math.max(0, Math.min(KEY_TYPE_OPTIONS.length - 1, Math.round(toNumber(value, 0))));

// Cursor and note size pickers are mouse-only: a focused select would
// otherwise turn the arrow keys into size shortcuts.
const SIZE_SELECT_BLOCKED_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const blockSizeSelectKeyboardChange = (event: ReactKeyboardEvent<HTMLSelectElement>) => {
  if (!SIZE_SELECT_BLOCKED_KEYS.has(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.blur();
};

const getNearestCursorSizeDenominator = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 4;
  return CURSOR_SIZE_FRACTION_DENOMINATORS.reduce((best, current) =>
    Math.abs(current - numeric) < Math.abs(best - numeric) ? current : best
  );
};

const formatNoteLengthOption = (denominator: number) =>
  denominator === 0.5 ? "2/1" : denominator === 1 ? "1/1" : `1/${denominator}`;

const isCanvasSnapshot = (value: unknown): value is CanvasSnapshot =>
  Boolean(value && typeof value === "object" && Array.isArray((value as CanvasSnapshot).editors));

const normalizeEditorKind = (value: unknown) => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (isDrumTrackType(raw)) return "drums";
  return raw === "chord" || raw === "chords" || raw === "chordeditor" || raw === "chord-editor"
    ? "chords"
    : "tab";
};

const isChordLane = (lane: Pick<EditorSnapshot, "editorType" | "trackType" | "type">) =>
  normalizeEditorKind(lane.editorType ?? lane.trackType ?? lane.type) === "chords";
const isDrumLane = (lane: Pick<EditorSnapshot, "editorType" | "trackType" | "type">) =>
  normalizeEditorKind(lane.editorType ?? lane.trackType ?? lane.type) === "drums";

const normalizeLane = (
  lane: EditorSnapshot,
  laneId: string,
  secondsPerBar: number,
  index: number
): EditorSnapshot => {
  const safeSeconds = Math.max(0.1, toNumber(secondsPerBar, toNumber(lane.secondsPerBar, DEFAULT_SECONDS_PER_BAR)));
  const totalFrames = Math.max(FIXED_FRAMES_PER_BAR, Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR)));
  const rawName = typeof lane.name === "string" ? lane.name.trim() : "";
  const defaultNamePattern = /^(editor|transcription|tab|chords?|drums?)\s+\d+$/i;
  const editorKind = normalizeEditorKind(lane.editorType ?? lane.trackType ?? lane.type);
  const laneTypeLabel =
    editorKind === "chords" ? "Chords" : editorKind === "drums" ? "Drums" : "Tab";
  const laneName =
    !rawName || defaultNamePattern.test(rawName)
      ? `${laneTypeLabel} ${index + 1}`
      : rawName;
  return {
    ...lane,
    id: laneId,
    name: laneName,
    editorType: editorKind,
    type: editorKind,
    trackType: editorKind,
    instrumentId: normalizeTrackInstrumentId(lane.instrumentId),
    playbackVolume: normalizeTrackVolume(lane.playbackVolume ?? 1),
    playbackMuted: lane.playbackMuted === true,
    playbackIsolated: lane.playbackIsolated === true,
    timelineOffsetFrames: Math.max(0, Math.round(toNumber(lane.timelineOffsetFrames, 0))),
    importGroupId:
      typeof lane.importGroupId === "string" && lane.importGroupId.trim()
        ? lane.importGroupId.trim()
        : undefined,
    framesPerMessure: FIXED_FRAMES_PER_BAR,
    secondsPerBar: safeSeconds,
    fps: fpsFromSecondsPerBar(safeSeconds),
    totalFrames,
    timeSignature: Math.max(1, Math.min(64, Math.round(toNumber(lane.timeSignature, 8)))),
    timeSignatureBottom: Math.max(1, Math.min(64, Math.round(toNumber(lane.timeSignatureBottom, 4)))),
    notes:
      Array.isArray(lane.notes) && editorKind === "drums"
        ? lane.notes.filter(isSupportedDrumNote)
        : Array.isArray(lane.notes)
          ? lane.notes
          : [],
    chords: Array.isArray(lane.chords) ? lane.chords : [],
    noteEffects: Array.isArray(lane.noteEffects) ? lane.noteEffects : [],
    drumLoops: normalizeDrumLoops(lane.drumLoops, totalFrames),
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
    const firstEditor = normalizedEditors[0];
    const totalFrames = Math.max(
      FIXED_FRAMES_PER_BAR,
      ...normalizedEditors.map((lane) => getLaneTimelineEnd(lane))
    );
    return {
      id: raw.id || fallbackCanvasId,
      name: raw.name || "Untitled",
      schemaVersion: raw.schemaVersion,
      canvasSchemaVersion: raw.canvasSchemaVersion,
      version: raw.version,
      draftRevision: raw.draftRevision,
      updatedAt: raw.updatedAt,
      keyBase: normalizeKeyBase(raw.keyBase),
      keyType: normalizeKeyType(raw.keyType),
      secondsPerBar: safeSeconds,
      timingVersion: 2,
      timingMap: normalizeTimingMap(raw.timingMap, {
        secondsPerBar: safeSeconds,
        totalFrames,
        numerator: firstEditor?.timeSignature,
        denominator: firstEditor?.timeSignatureBottom,
      }),
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
    draftRevision: undefined,
    updatedAt: lane.updatedAt,
    keyBase: 0,
    keyType: 0,
    secondsPerBar: lane.secondsPerBar || DEFAULT_SECONDS_PER_BAR,
    timingVersion: 2,
    timingMap: normalizeTimingMap(undefined, {
      secondsPerBar: lane.secondsPerBar,
      totalFrames: getLaneTimelineEnd(lane),
      numerator: lane.timeSignature,
      denominator: lane.timeSignatureBottom,
    }),
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

type PendingLaneTuningChange = {
  laneId: string;
  presetId: string;
  capo: number;
};

const getLaneTimelineEnd = (lane: EditorSnapshot) => {
  const noteEnd = (Array.isArray(lane.notes) ? lane.notes : []).reduce((max, note) => {
    const start = Math.max(0, Math.round(toNumber(note.startTime, 0)));
    const length = Math.max(1, Math.round(toNumber(note.length, 1)));
    return Math.max(max, start + length);
  }, 0);
  const chordEnd = (Array.isArray(lane.chords) ? lane.chords : []).reduce((max, chord) => {
    const start = Math.max(0, Math.round(toNumber(chord.startTime, 0)));
    const length = Math.max(1, Math.round(toNumber(chord.length, 1)));
    return Math.max(max, start + length);
  }, 0);
  return Math.max(
    FIXED_FRAMES_PER_BAR,
    Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR)),
    noteEnd,
    chordEnd
  );
};

const getLaneBarCount = (lane: EditorSnapshot) =>
  Math.max(1, Math.ceil(getLaneTimelineEnd(lane) / FIXED_FRAMES_PER_BAR));

const normalizeTimeSignature = (value: unknown) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return null;
  return Math.max(1, Math.min(64, Math.round(next)));
};

const normalizeTimeSignatureBottom = (value: unknown) => {
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

const adjustLaneEventsWithinBars = (
  lane: EditorSnapshot,
  ratiosByBar: Map<number, number>
): EditorSnapshot => {
  const scaleFrame = (value: number) => {
    const frame = Math.max(0, Math.round(toNumber(value, 0)));
    const barIndex = Math.floor(frame / FIXED_FRAMES_PER_BAR);
    const ratio = ratiosByBar.get(barIndex);
    if (!ratio) return frame;
    const barStart = barIndex * FIXED_FRAMES_PER_BAR;
    return barStart + Math.max(0, Math.round((frame - barStart) * ratio));
  };
  const scaleLength = (start: number, length: number) => {
    const barIndex = Math.floor(Math.max(0, start) / FIXED_FRAMES_PER_BAR);
    return Math.max(1, Math.round(Math.max(1, length) * (ratiosByBar.get(barIndex) || 1)));
  };
  return {
    ...lane,
    notes: lane.notes.map((note) => ({
      ...note,
      startTime: scaleFrame(note.startTime),
      length: scaleLength(note.startTime, note.length),
    })),
    chords: lane.chords.map((chord) => ({
      ...chord,
      startTime: scaleFrame(chord.startTime),
      length: scaleLength(chord.startTime, chord.length),
    })),
    cutPositionsWithCoords: lane.cutPositionsWithCoords.map((cut) => [
      [scaleFrame(cut[0][0]), Math.max(scaleFrame(cut[0][0]) + 1, scaleFrame(cut[0][1]))],
      [...cut[1]] as [number, number],
    ]),
    drumLoops: (lane.drumLoops || []).map((loop) => ({
      ...loop,
      sourceStart: scaleFrame(loop.sourceStart),
      sourceEnd: scaleFrame(loop.sourceEnd),
      loopEnd: scaleFrame(loop.loopEnd),
    })),
  };
};

const formatBpm = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const formatPlaybackTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
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

const ensureCanvasBarsContainEvents = (
  canvas: CanvasSnapshot
): { canvas: CanvasSnapshot; extended: boolean } => {
  let extended = false;
  const editors = canvas.editors.map((lane) => {
    const currentTotalFrames = Math.max(
      FIXED_FRAMES_PER_BAR,
      Math.round(toNumber(lane.totalFrames, FIXED_FRAMES_PER_BAR))
    );
    const lastEventFrame = Math.max(
      0,
      ...lane.notes.map(
        (note) =>
          Math.round(toNumber(note.startTime, 0)) +
          Math.max(1, Math.round(toNumber(note.length, 1)))
      ),
      ...lane.chords.map(
        (chord) =>
          Math.round(toNumber(chord.startTime, 0)) +
          Math.max(1, Math.round(toNumber(chord.length, 1)))
      )
    );
    if (lastEventFrame <= currentTotalFrames) return lane;

    extended = true;
    const requiredTotalFrames =
      Math.max(1, Math.ceil(lastEventFrame / FIXED_FRAMES_PER_BAR)) *
      FIXED_FRAMES_PER_BAR;
    const existingCuts = Array.isArray(lane.cutPositionsWithCoords)
      ? lane.cutPositionsWithCoords.map(cloneCutRegion)
      : [];
    const lastCut = [...existingCuts].sort(
      (left, right) => toNumber(left[0]?.[1], 0) - toNumber(right[0]?.[1], 0)
    ).at(-1);
    const extensionCoord = lastCut
      ? ([lastCut[1][0], lastCut[1][1]] as [number, number])
      : ([2, 0] as [number, number]);
    const extensionCut: EditorSnapshot["cutPositionsWithCoords"][number] = [
      [currentTotalFrames, requiredTotalFrames],
      extensionCoord,
    ];

    return {
      ...lane,
      totalFrames: requiredTotalFrames,
      cutPositionsWithCoords: [
        ...existingCuts,
        extensionCut,
      ],
    };
  });

  if (!extended) return { canvas, extended: false };
  return {
    canvas: {
      ...canvas,
      editors,
      updatedAt: new Date().toISOString(),
    },
    extended: true,
  };
};

const selectBarsFromLane = (lane: EditorSnapshot, barIndices: number[]): EditorSnapshot | null => {
  const normalized = normalizeBarIndices(lane, barIndices);
  if (!normalized.length) return null;

  const notes: EditorSnapshot["notes"] = [];
  const chords: EditorSnapshot["chords"] = [];
  const cutPositionsWithCoords: EditorSnapshot["cutPositionsWithCoords"] = [];
  const clipboardNoteIdBySourceId = new Map<number, number>();

  normalized.forEach((barIndex, outputIndex) => {
    const barStart = barIndex * FIXED_FRAMES_PER_BAR;
    const barEnd = barStart + FIXED_FRAMES_PER_BAR;
    const outputStart = outputIndex * FIXED_FRAMES_PER_BAR;
    const offset = outputStart - barStart;

    lane.notes.forEach((note) => {
      const noteStart = Math.round(toNumber(note.startTime, 0));
      if (noteStart < barStart || noteStart >= barEnd) return;
      const clipboardNoteId = notes.length + 1;
      clipboardNoteIdBySourceId.set(note.id, clipboardNoteId);
      notes.push({
        ...note,
        id: clipboardNoteId,
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
  const noteEffects = (lane.noteEffects || []).flatMap((effect, index) => {
    const startNoteId = clipboardNoteIdBySourceId.get(effect.startNoteId);
    const endNoteId = clipboardNoteIdBySourceId.get(effect.endNoteId);
    if (startNoteId === undefined || endNoteId === undefined) return [];
    return [
      {
        ...effect,
        id: index + 1,
        startNoteId,
        endNoteId,
      },
    ];
  });
  return normalizeLane(
    {
      ...lane,
      id: "clipboard",
      name: "Clipboard",
      version: 1,
      totalFrames,
      notes,
      chords,
      noteEffects,
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

  const insertedNoteIdByClipboardId = new Map<number, number>();
  const insertedNotes = clipboard.notes.map((note) => {
    const id = nextNoteId++;
    insertedNoteIdByClipboardId.set(note.id, id);
    return {
      ...note,
      id,
      startTime: Math.round(toNumber(note.startTime, 0)) + insertFrame,
      length: Math.max(1, Math.round(toNumber(note.length, 1))),
      tab: [note.tab[0], note.tab[1]] as [number, number],
      optimals: Array.isArray(note.optimals)
        ? note.optimals.map((tab) => [tab[0], tab[1]] as [number, number])
        : [],
    };
  });
  const nextNotes = [
    ...lane.notes.map((note) => {
      const noteStart = Math.round(toNumber(note.startTime, 0));
      if (noteStart < insertFrame) return note;
      return { ...note, startTime: noteStart + clipLength };
    }),
    ...insertedNotes,
  ].sort((left, right) => left.startTime - right.startTime || left.id - right.id);
  let nextNoteEffectId =
    (lane.noteEffects || []).reduce(
      (max, effect) => Math.max(max, Math.round(toNumber(effect.id, 0))),
      0
    ) + 1;
  const insertedNoteEffects = (clipboard.noteEffects || []).flatMap((effect) => {
    const startNoteId = insertedNoteIdByClipboardId.get(effect.startNoteId);
    const endNoteId = insertedNoteIdByClipboardId.get(effect.endNoteId);
    if (startNoteId === undefined || endNoteId === undefined) return [];
    return [
      {
        ...effect,
        id: nextNoteEffectId++,
        startNoteId,
        endNoteId,
      },
    ];
  });

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
      noteEffects: [...(lane.noteEffects || []), ...insertedNoteEffects],
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
  const remainingNoteIds = new Set(nextNotes.map((note) => note.id));
  const nextNoteEffects = (lane.noteEffects || []).filter(
    (effect) =>
      remainingNoteIds.has(effect.startNoteId) &&
      remainingNoteIds.has(effect.endNoteId)
  );

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
      noteEffects: nextNoteEffects,
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
  useGteRenderInstrumentation("GteEditorPage", editorId);
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
  const [timeSignatureBottomDraft, setTimeSignatureBottomDraft] = useState("4");
  const [timeSignatureSaving, setTimeSignatureSaving] = useState(false);
  const [timeSignatureError, setTimeSignatureError] = useState<string | null>(null);
  const [pendingMeterChange, setPendingMeterChange] = useState<{
    numerator: number;
    denominator: number;
  } | null>(null);
  const [timingDialogOpen, setTimingDialogOpen] = useState(false);
  const [timingBpmDraft, setTimingBpmDraft] = useState("120");
  const [timingApplyToAll, setTimingApplyToAll] = useState(false);
  const [timingSaving, setTimingSaving] = useState(false);
  const [activeLaneId, setActiveLaneId] = useState<string | null>(null);
  const [mobileEditLaneId, setMobileEditLaneId] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [savingCanvas, setSavingCanvas] = useState(false);
  const [exportingTrack, setExportingTrack] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [openTopMenu, setOpenTopMenu] = useState<TopMenuId | null>(null);
  const editMenuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelEditMenuClose = useCallback(() => {
    if (editMenuCloseTimeoutRef.current === null) return;
    clearTimeout(editMenuCloseTimeoutRef.current);
    editMenuCloseTimeoutRef.current = null;
  }, []);
  const scheduleEditMenuClose = useCallback(() => {
    cancelEditMenuClose();
    editMenuCloseTimeoutRef.current = setTimeout(() => {
      editMenuCloseTimeoutRef.current = null;
      setOpenTopMenu((current) => (current === "edit" ? null : current));
    }, 350);
  }, [cancelEditMenuClose]);
  useEffect(() => () => cancelEditMenuClose(), [cancelEditMenuClose]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasPendingCommit, setHasPendingCommit] = useState(false);
  const [lastCommittedAt, setLastCommittedAt] = useState<string | null>(null);
  const [addingLane, setAddingLane] = useState(false);
  const [addTrackMenuOpen, setAddTrackMenuOpen] = useState(false);
  const [deletingLaneId, setDeletingLaneId] = useState<string | null>(null);
  const [confirmDeleteTrackId, setConfirmDeleteTrackId] = useState<string | null>(null);
  const [mergeTracksDialogOpen, setMergeTracksDialogOpen] = useState(false);
  const [mergeTrackIds, setMergeTrackIds] = useState<string[]>([]);
  const [mergeTracksBusy, setMergeTracksBusy] = useState(false);
  const [openTrackMenuId, setOpenTrackMenuId] = useState<string | null>(null);
  const [shiftingLaneId, setShiftingLaneId] = useState<string | null>(null);
  const [trackContextMenu, setTrackContextMenu] = useState<{
    laneId: string;
    x: number;
    y: number;
  } | null>(null);
  const [trackOffsetSession, setTrackOffsetSession] = useState<TrackOffsetSession | null>(null);
  const trackOffsetSessionRef = useRef<TrackOffsetSession | null>(null);
  const trackOffsetDragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollRatio: number;
    scrollRatio: number;
  } | null>(null);
  const [openMobileBarMenuLaneId, setOpenMobileBarMenuLaneId] = useState<string | null>(null);
  const [editMenuPortalTarget, setEditMenuPortalTarget] = useState<HTMLDivElement | null>(null);
  const [editorMode, setEditorMode] = useState<"canvas" | "tab" | "practice">("canvas");
  const practiceModeEnabled = editorMode === "practice";
  const tabViewEnabled = editorMode !== "canvas";
  const [globalSnapToGridEnabled, setGlobalSnapToGridEnabled] = useState(true);
  const [globalSnapToKeyEnabled, setGlobalSnapToKeyEnabledState] = useState(false);
  const [globalSnapSubdivisionsPerBeat, setGlobalSnapSubdivisionsPerBeat] = useState(4);
  const [leftHandedChordDiagrams, setLeftHandedChordDiagramsState] = useState(false);
  const [chordOnlyDefaultNoteLengthDenominator, setChordOnlyDefaultNoteLengthDenominator] = useState(4);
  const [chordOnlyCursorSizeDenominator, setChordOnlyCursorSizeDenominator] = useState(4);
  const [findKeyDialogOpen, setFindKeyDialogOpen] = useState(false);
  const [selectedKeyCandidate, setSelectedKeyCandidate] = useState("");
  const [displayPreferences, setDisplayPreferences] = useState<GteDisplayPreferences>(
    DEFAULT_GTE_DISPLAY_PREFERENCES
  );
  const [generatePlayingCoordinatesRequest, setGeneratePlayingCoordinatesRequest] = useState(0);
  const [timelineZoomPercent, setTimelineZoomPercent] = useState(TIMELINE_ZOOM_DEFAULT);
  const [globalPlaybackFrame, setGlobalPlaybackFrame] = useState(0);
  const [globalPlaybackCounterFrame, setGlobalPlaybackCounterFrame] = useState(0);
  const [globalPlaybackFrameRevision, setGlobalPlaybackFrameRevision] = useState(0);
  const [globalPlaybackIsPlaying, setGlobalPlaybackIsPlaying] = useState(false);
  const [globalPlaybackIsPreparing, setGlobalPlaybackIsPreparing] = useState(false);
  const [globalPlaybackVolume, setGlobalPlaybackVolume] = useState(0.6);
  const [practiceLoopEnabled, setPracticeLoopEnabled] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [metronomeVolume, setMetronomeVolume] = useState(0.7);
  const [countInEnabled, setCountInEnabled] = useState(false);
  const [countInBars, setCountInBars] = useState(1);
  const [countInEveryLoop, setCountInEveryLoop] = useState(false);
  const [practiceFocusEnabled, setPracticeFocusEnabled] = useState(false);
  const [practiceChordOverlayLaneId, setPracticeChordOverlayLaneId] = useState<string | null>(null);
  const [practiceChordFingeringsVisible, setPracticeChordFingeringsVisible] = useState(false);
  const [practiceFullscreen, setPracticeFullscreen] = useState(false);
  const [speedTrainerEnabled, setSpeedTrainerEnabled] = useState(false);
  const [speedTrainerSessionActive, setSpeedTrainerSessionActive] = useState(false);
  const [speedTrainerStart, setSpeedTrainerStart] = useState(0.75);
  const [speedTrainerTarget, setSpeedTrainerTarget] = useState(1.5);
  const [speedTrainerStep, setSpeedTrainerStep] = useState(0.05);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [practiceRatingReplays, setPracticeRatingReplays] = useState<PracticeRatingReplay[]>([]);
  const [selectedPracticeRatingId, setSelectedPracticeRatingId] = useState<string | null>(null);
  const [practiceReplayPlayingId, setPracticeReplayPlayingId] = useState<string | null>(null);
  const [showPracticeRating, setShowPracticeRating] = useState(true);
  const [practiceRatingState, setPracticeRatingState] = useState<
    "idle" | "permission" | "countdown" | "recording" | "scoring"
  >("idle");
  const [practiceRatingCountdown, setPracticeRatingCountdown] = useState(5);
  const [practiceRatingError, setPracticeRatingError] = useState<string | null>(null);
  const [trackMuteById, setTrackMuteById] = useState<Record<string, boolean>>({});
  const [trackVolumeById, setTrackVolumeById] = useState<Record<string, number>>({});
  const [trackPanById, setTrackPanById] = useState<Record<string, number>>({});
  const [trackCapoDraftById, setTrackCapoDraftById] = useState<Record<string, string>>({});
  const [pendingLaneTuningChange, setPendingLaneTuningChange] = useState<PendingLaneTuningChange | null>(null);
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
    getTrackInstrumentOptions()
  );
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const practiceRootRef = useRef<HTMLElement | null>(null);
  const practiceSettingsHydratedRef = useRef(false);
  const globalPlaybackFrameRef = useRef(0);
  const globalPlaybackCounterSecondRef = useRef(0);
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
  const sharedTimelineMeasureRef = useRef<HTMLDivElement | null>(null);
  const applyingGlobalTimelineScrollbarRef = useRef(false);
  const applyingSharedTimelineDomRef = useRef(false);
  const sharedTimelineScrollRatioRef = useRef(0);
  const globalPlaybackAudioRef = useRef<AudioContext | null>(null);
  const globalPlaybackMasterGainRef = useRef<GainNode | null>(null);
  const globalPlaybackTrackGainByIdRef = useRef<Map<string, GainNode>>(new Map());
  const pendingTrackVolumeByIdRef = useRef<Record<string, number>>({});
  const practiceReplayAudioRef = useRef<HTMLAudioElement | null>(null);
  const practiceReplayAudioUrlRef = useRef<string | null>(null);
  const practiceReplayAudioCacheRef = useRef<Map<string, Blob>>(new Map());
  const globalPlaybackRafRef = useRef<number | null>(null);
  const globalPlaybackStartRequestRef = useRef(0);
  const globalPlaybackStartPendingRef = useRef(false);
  const globalPlaybackStartTimeRef = useRef<number | null>(null);
  const globalPlaybackStartFrameRef = useRef(0);
  const globalPlaybackEndFrameRef = useRef<number | null>(null);
  const globalPlaybackAudioStartRef = useRef<number | null>(null);
  const practiceLoopEnabledRef = useRef(practiceLoopEnabled);
  const speedTrainerSessionActiveRef = useRef(false);
  const speedTrainerOriginalSpeedRef = useRef<number | null>(null);
  const previousTrackPlaybackStateSignatureRef = useRef<string | null>(null);
  const previousTrackInstrumentSignatureRef = useRef<string | null>(null);
  const canvasUndoRef = useRef<CanvasSnapshot[]>([]);
  const canvasRedoRef = useRef<CanvasSnapshot[]>([]);
  const trackSectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [sharedTimelineBaseScale, setSharedTimelineBaseScale] = useState<number | undefined>(undefined);

  useEffect(() => {
    setDisplayPreferences(readGteDisplayPreferences(window.localStorage));
  }, []);

  const updateDisplayPreference = useCallback(
    (key: keyof GteDisplayPreferences, value: boolean) => {
      const next = { ...displayPreferences, [key]: value };
      setDisplayPreferences(next);
      writeGteDisplayPreferences(window.localStorage, next);
    },
    [displayPreferences]
  );
  const resetSpeedTrainerSession = useCallback(() => {
    const originalSpeed = speedTrainerOriginalSpeedRef.current;
    speedTrainerOriginalSpeedRef.current = null;
    speedTrainerSessionActiveRef.current = false;
    setSpeedTrainerSessionActive(false);
    if (originalSpeed !== null) setPlaybackSpeed(originalSpeed);
  }, []);
  const router = useRouter();
  const saveToAccountPath = "/gte?importGuest=1";
  const loginSaveHref = `/auth/login?next=${encodeURIComponent(saveToAccountPath)}`;
  const signupSaveHref = `/auth/signup?next=${encodeURIComponent(saveToAccountPath)}`;
  const transcriberHref = isGuestMode
    ? "/#hero"
    : `/?appendEditorId=${encodeURIComponent(editorId)}#hero`;
  const chordDiagramHandednessStorageKey = useMemo(() => {
    if (session?.user?.id) {
      return `${CHORD_DIAGRAM_HANDEDNESS_STORAGE_PREFIX}user:${session.user.id}`;
    }
    return isGuestMode ? `${CHORD_DIAGRAM_HANDEDNESS_STORAGE_PREFIX}guest` : null;
  }, [isGuestMode, session?.user?.id]);
  const setGlobalSnapToKeyEnabled = useCallback(
    (value: boolean | ((enabled: boolean) => boolean)) => {
      setGlobalSnapToKeyEnabledState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(`${SNAP_TO_KEY_STORAGE_PREFIX}${editorId}`, next ? "1" : "0");
        }
        return next;
      });
    },
    [editorId]
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(`${SNAP_TO_KEY_STORAGE_PREFIX}${editorId}`);
    if (stored === "1" || stored === "0") {
      setGlobalSnapToKeyEnabledState(stored === "1");
    }
  }, [editorId]);

  const setLeftHandedChordDiagrams = useCallback(
    (value: boolean | ((leftHanded: boolean) => boolean)) => {
      setLeftHandedChordDiagramsState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        if (typeof window !== "undefined" && chordDiagramHandednessStorageKey) {
          window.localStorage.setItem(chordDiagramHandednessStorageKey, next ? "1" : "0");
        }
        return next;
      });
    },
    [chordDiagramHandednessStorageKey]
  );

  useEffect(() => {
    if (!chordDiagramHandednessStorageKey) return;
    let stored = window.localStorage.getItem(chordDiagramHandednessStorageKey);
    if (stored !== "1" && stored !== "0") {
      const legacyStored = window.localStorage.getItem(
        `${CHORD_DIAGRAM_HANDEDNESS_STORAGE_PREFIX}${editorId}`
      );
      if (legacyStored === "1" || legacyStored === "0") {
        stored = legacyStored;
        window.localStorage.setItem(chordDiagramHandednessStorageKey, legacyStored);
      }
    }
    setLeftHandedChordDiagramsState(stored === "1");
  }, [chordDiagramHandednessStorageKey, editorId]);

  useEffect(() => {
    if (!chordDiagramHandednessStorageKey) return;
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== chordDiagramHandednessStorageKey ||
        (event.newValue !== "1" && event.newValue !== "0")
      ) {
        return;
      }
      setLeftHandedChordDiagramsState(event.newValue === "1");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [chordDiagramHandednessStorageKey]);

  const cloneCanvas = useCallback((value: CanvasSnapshot) => {
    return JSON.parse(JSON.stringify(value)) as CanvasSnapshot;
  }, []);

  const resetCanvasHistory = useCallback(() => {
    canvasUndoRef.current = [];
    canvasRedoRef.current = [];
    setCanvasUndoCount(0);
    setCanvasRedoCount(0);
  }, []);

  const recordCanvasHistory = useCallback(
    (previous: CanvasSnapshot, next: CanvasSnapshot) => {
      if (previous === next) return;
      const nextUndo = appendBoundedHistory(
        canvasUndoRef.current,
        previous,
        MAX_CANVAS_HISTORY
      );
      canvasUndoRef.current = nextUndo;
      canvasRedoRef.current = [];
      setCanvasUndoCount(nextUndo.length);
      setCanvasRedoCount(0);
    },
    []
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
    sharedTimelineScrollRatioRef.current = 0;
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
    if (!editorId) return;

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
    let activeDurationMs = 0;
    let visibleStartedAt = document.visibilityState === "visible" ? Date.now() : null;
    let heartbeatSequence = 0;

    const currentActiveDurationSec = () =>
      Math.max(
        0,
        Math.round(
          (activeDurationMs + (visibleStartedAt === null ? 0 : Date.now() - visibleStartedAt)) /
            1000
        )
      );

    const sendTelemetry = (
      event:
        | "gte_editor_visit"
        | "gte_editor_session_start"
        | "gte_editor_session_end"
        | "gte_editor_session_heartbeat",
      properties: {
        durationSec?: number;
        activeDurationSec?: number;
        heartbeatSequence?: number;
      } = {}
    ) => {
      const payload = {
        event,
        editorId,
        sessionId,
        path: window.location.pathname,
        ...properties,
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

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      heartbeatSequence += 1;
      const startedAt = telemetryStartedAtRef.current ?? Date.now();
      void sendTelemetry("gte_editor_session_heartbeat", {
        durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
        activeDurationSec: currentActiveDurationSec(),
        heartbeatSequence,
      }).catch(() => {});
    }, 60_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (visibleStartedAt === null) visibleStartedAt = Date.now();
        return;
      }
      if (visibleStartedAt !== null) {
        activeDurationMs += Date.now() - visibleStartedAt;
        visibleStartedAt = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

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
        activeDurationSec: currentActiveDurationSec(),
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
      window.clearInterval(heartbeatId);
      flushSessionEnd();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [editorId, isGuestMode]);

  useEffect(() => {
    if (!editorId || editorMode !== "practice" || !telemetrySessionRef.current) return;
    void fetch("/api/gte/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "gte_practice_started",
        editorId,
        sessionId: telemetrySessionRef.current,
        mode: "practice",
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [editorId, editorMode]);

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
    setTimeSignatureBottomDraft(String(normalizeTimeSignatureBottom(canvas.editors[0]?.timeSignatureBottom) ?? 4));
    if (activeLaneId && !canvas.editors.some((lane) => lane.id === activeLaneId)) {
      setActiveLaneId(canvas.editors[0]?.id || null);
    }
    if (mobileEditLaneId && !canvas.editors.some((lane) => lane.id === mobileEditLaneId)) {
      setMobileEditLaneId(null);
    }
  }, [canvas?.name, canvas?.secondsPerBar, canvas?.editors, activeLaneId, mobileEditLaneId, nameEditing]);

  useEffect(() => {
    if (!canvas) return;
    const volumes: Record<string, number> = {};
    const muted: Record<string, boolean> = {};
    let isolated: string | null = null;
    canvas.editors.forEach((lane, index) => {
      const laneId = lane.id || `ed-${index + 1}`;
      volumes[laneId] = normalizeTrackVolume(lane.playbackVolume ?? 1);
      muted[laneId] = lane.playbackMuted === true;
      if (!isolated && lane.playbackIsolated === true) isolated = laneId;
    });
    setTrackVolumeById(volumes);
    setTrackMuteById(muted);
    setIsolatedTrackId(isolated);
  }, [canvas?.editors]);

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

  const handleMainMouseDownCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (practiceModeEnabled) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (isMobileViewport && mobileEditLaneId) return;
    if (target.closest("[data-gte-track='true']")) return;
    if (target.closest("[data-gte-timeline-control='true']")) return;
    if (target.closest("[data-gte-floating-ui='true']")) return;
    if (target.closest("button, a, input, textarea, select, label, [role='button']")) return;
    setActiveLaneId(null);
  }, [isMobileViewport, mobileEditLaneId, practiceModeEnabled]);

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
          const normalized = preserveDrumLoopsAcrossCanvasUpdate(
            normalizeCanvas((res as any).canvas ?? res.snapshot ?? canvas, editorId),
            canvas
          );
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
        const normalized = preserveDrumLoopsAcrossCanvasUpdate(
          normalizeCanvas(res.snapshot, editorId),
          canvas
        );
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
        const merged = prev ? preserveDrumLoopsAcrossCanvasUpdate(next, prev) : next;
        if (prev && options?.recordHistory !== false) {
          recordCanvasHistory(prev, merged);
        }
        return merged;
      });
      if (options?.markDirty !== false) {
        setHasPendingCommit(true);
      }
    },
    [recordCanvasHistory]
  );

  const commitCanvasKey = useCallback(
    (nextKeyBase: number, nextKeyType: number) => {
      if (!canvas) return;
      const keyBase = normalizeKeyBase(nextKeyBase);
      const keyType = normalizeKeyType(nextKeyType);
      const currentKeyBase = normalizeKeyBase(canvas.keyBase);
      const currentKeyType = normalizeKeyType(canvas.keyType);
      if (keyBase === currentKeyBase && keyType === currentKeyType) return;
      const nextCanvas = normalizeCanvas(
        {
          ...canvas,
          keyBase,
          keyType,
          updatedAt: new Date().toISOString(),
        },
        editorId
      );
      applyCanvasUpdate(nextCanvas, { markDirty: true });
      void syncCanvasDraftToBackend(nextCanvas, { silent: true });
    },
    [applyCanvasUpdate, canvas, editorId, syncCanvasDraftToBackend]
  );

  const keyDetectionMatches = useMemo<RelativeScaleMatch[]>(() => {
    if (!findKeyDialogOpen || !canvas) return [];
    const detected = detectGteScale(canvas);
    return detected ? getRelativeScaleMatches(detected, 5) : [];
  }, [canvas, findKeyDialogOpen]);

  useEffect(() => {
    if (!findKeyDialogOpen) return;
    const first = keyDetectionMatches[0];
    setSelectedKeyCandidate(first ? `${first.rootKey}:${first.scaleType}` : "");
  }, [findKeyDialogOpen, keyDetectionMatches]);

  const handleContinueFindKey = useCallback(() => {
    const selected = keyDetectionMatches.find(
      (candidate) => `${candidate.rootKey}:${candidate.scaleType}` === selectedKeyCandidate
    );
    if (selected) {
      const detectedKeyBase = normalizeKeyBase(selected.rootKey - 1);
      const detectedKeyTypeIndex = KEY_TYPE_OPTIONS.findIndex(
        (label) => label === selected.scaleType
      );
      commitCanvasKey(detectedKeyBase, detectedKeyTypeIndex >= 0 ? detectedKeyTypeIndex : 0);
    }
    setFindKeyDialogOpen(false);
  }, [commitCanvasKey, keyDetectionMatches, selectedKeyCandidate]);

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
    const denominator = normalizeTimeSignatureBottom(timeSignatureBottomDraft) ?? 4;
    const timingMap = timingMapForCanvas(canvas);
    const selectedBarIndex = barSelection?.barIndices[0] ?? 0;
    const currentBar = timingMap.bars[selectedBarIndex] || timingMap.bars[0];
    if (
      currentBar?.timeSignature.numerator === normalized &&
      currentBar?.timeSignature.denominator === denominator
    ) return;
    setPendingMeterChange({ numerator: normalized, denominator });
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

  const commitTimeSignatureBottom = async (rawValue: string | number = timeSignatureBottomDraft) => {
    if (!canvas) return;
    const normalized = normalizeTimeSignatureBottom(rawValue);
    if (!normalized) {
      setTimeSignatureBottomDraft(String(normalizeTimeSignatureBottom(canvas.editors[0]?.timeSignatureBottom) ?? 4));
      return;
    }
    setTimeSignatureBottomDraft(String(normalized));
    const numerator = normalizeTimeSignature(timeSignatureDraft) ?? 4;
    const timingMap = timingMapForCanvas(canvas);
    const selectedBarIndex = barSelection?.barIndices[0] ?? 0;
    const currentBar = timingMap.bars[selectedBarIndex] || timingMap.bars[0];
    if (
      currentBar?.timeSignature.numerator === numerator &&
      currentBar?.timeSignature.denominator === normalized
    ) return;
    setPendingMeterChange({ numerator, denominator: normalized });
  };

  const cancelMeterChange = useCallback(() => {
    if (canvas) {
      const timingMap = timingMapForCanvas(canvas);
      const selectedBarIndex = barSelection?.barIndices[0] ?? 0;
      const currentBar = timingMap.bars[selectedBarIndex] || timingMap.bars[0];
      setTimeSignatureDraft(String(currentBar?.timeSignature.numerator || 4));
      setTimeSignatureBottomDraft(String(currentBar?.timeSignature.denominator || 4));
    }
    setPendingMeterChange(null);
  }, [barSelection?.barIndices, canvas]);

  const resolveMeterChange = useCallback(async (behavior: "adjust" | "keep") => {
    if (!canvas || !pendingMeterChange || timeSignatureSaving) return;
    const timingMap = timingMapForCanvas(canvas);
    const selectedBarIndexes = Array.from(new Set(barSelection?.barIndices || [])).sort((left, right) => left - right);
    const applyToAll = selectedBarIndexes.length === 0;
    const targetIndexes = applyToAll ? timingMap.bars.map((bar) => bar.index) : selectedBarIndexes;
    const targetSet = new Set(targetIndexes);
    setTimeSignatureSaving(true);
    setTimeSignatureError(null);
    try {
      if (isGuestMode) {
        const nextQuarterNotes = pendingMeterChange.numerator * (4 / pendingMeterChange.denominator);
        const ratiosByBar = new Map<number, number>();
        timingMap.bars.forEach((bar) => {
          if (!targetSet.has(bar.index)) return;
          const previousQuarterNotes =
            bar.timeSignature.numerator * (4 / bar.timeSignature.denominator);
          ratiosByBar.set(bar.index, nextQuarterNotes / Math.max(0.25, previousQuarterNotes));
        });
        let cursorSeconds = 0;
        timingMap.bars = timingMap.bars.map((bar) => {
          const selected = targetSet.has(bar.index);
          const bpm = Math.max(1, bar.quarterNoteBpm);
          const meter = selected
            ? { numerator: pendingMeterChange.numerator, denominator: pendingMeterChange.denominator }
            : bar.timeSignature;
          const quarterNotes = meter.numerator * (4 / meter.denominator);
          const duration = selected
            ? (60 * quarterNotes) / bpm
            : Math.max(0.1, bar.endSeconds - bar.startSeconds);
          const next = {
            ...bar,
            timeSignature: meter,
            startSeconds: cursorSeconds,
            endSeconds: cursorSeconds + duration,
            source: selected ? "manual" : bar.source,
            confidence: selected ? 1 : bar.confidence,
            anchors: Array.from({ length: meter.numerator + 1 }, (_, beat) => ({
              tick: Math.round((beat * FIXED_FRAMES_PER_BAR) / meter.numerator),
              seconds: cursorSeconds + (beat * duration) / meter.numerator,
            })),
          };
          cursorSeconds = next.endSeconds;
          return next;
        });
        const editors = canvas.editors.map((lane) => {
          const adjusted = behavior === "adjust" ? adjustLaneEventsWithinBars(lane, ratiosByBar) : lane;
          return applyToAll
            ? {
                ...adjusted,
                timeSignature: pendingMeterChange.numerator,
                timeSignatureBottom: pendingMeterChange.denominator,
              }
            : adjusted;
        });
        applyCanvasUpdate(
          normalizeCanvas(
            { ...canvas, timingVersion: 2, timingMap, editors, updatedAt: new Date().toISOString() },
            editorId
          ),
          { markDirty: true }
        );
      } else {
        const response = await gteApi.setTimeSignatureMap(editorId, {
          expectedVersion: Math.max(1, Number(canvas.version) || 1),
          timeSignature: pendingMeterChange.numerator,
          timeSignatureBottom: pendingMeterChange.denominator,
          barIndexes: selectedBarIndexes,
          applyToAll,
          behavior,
        });
        applyCanvasUpdate(normalizeCanvas(response.canvas, editorId), { markDirty: true });
      }
      setPendingMeterChange(null);
    } catch (err: any) {
      setTimeSignatureError(err?.message || "Could not update time signature.");
    } finally {
      setTimeSignatureSaving(false);
    }
  }, [applyCanvasUpdate, barSelection?.barIndices, canvas, editorId, isGuestMode, pendingMeterChange, timeSignatureSaving]);

  const handleAddLane = async (kind: "tab" | "chords" | "drums" = "tab") => {
    if (!canvas || addingLane) return;
    setAddingLane(true);
    setAddTrackMenuOpen(false);
    setError(null);
    try {
      const res = await gteApi.addCanvasEditor(editorId, undefined, {
        editorType: kind,
        trackType: kind,
        type: kind,
        ...(kind === "chords"
          ? {
              chordEditor: {
                roots: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
                qualities: ["major", "minor", "augmentet", "diminished", "sus2", "sus4", "power"],
                extensions: ["", "6", "7", "maj7", "9", "maj9", "11", "13"],
              },
            }
          : {}),
      });
      const currentTimeSignature = normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8;
      const currentTimeSignatureBottom = normalizeTimeSignatureBottom(canvas.editors[0]?.timeSignatureBottom) ?? 4;
      const currentSecondsPerBar = Math.max(0.1, toNumber(canvas.secondsPerBar, DEFAULT_SECONDS_PER_BAR));
      const createdLaneId =
        res.editor?.id || res.canvas.editors[res.canvas.editors.length - 1]?.id;
      const nextCanvas = normalizeCanvas(
        {
          ...res.canvas,
          secondsPerBar: currentSecondsPerBar,
          editors: res.canvas.editors.map((lane) => ({
            ...lane,
            secondsPerBar: currentSecondsPerBar,
            timeSignature: currentTimeSignature,
            timeSignatureBottom: currentTimeSignatureBottom,
            ...(lane.id === createdLaneId
              ? { editorType: kind, type: kind, trackType: kind }
              : {}),
          })),
        },
        editorId
      );
      if (kind !== "drums") {
        await gteApi.applySnapshot(editorId, nextCanvas);
      }
      applyCanvasUpdate(nextCanvas, {
        markDirty: kind === "drums" ? isGuestMode : !isGuestMode,
      });
      setActiveLaneId(res.editor?.id || nextCanvas.editors[nextCanvas.editors.length - 1]?.id || null);
    } catch (err: any) {
      setError(err?.message || "Could not add track.");
    } finally {
      setAddingLane(false);
    }
  };

  const handleLaneNameCommit = useCallback(
    async (laneId: string, rawName: string) => {
      if (!canvas) return;
      const lane = canvas.editors.find((entry) => entry.id === laneId);
      if (!lane) return;
      const normalizedName = normalizeEditorName(rawName);
      if (!normalizedName || normalizedName === lane.name) return;
      setSaveError(null);
      try {
        const response = await gteApi.setEditorName(
          buildLaneEditorRef(editorId, laneId),
          normalizedName
        );
        let nextCanvas = normalizeCanvas(
          response.canvas || {
            ...canvas,
            editors: canvas.editors.map((entry) =>
              entry.id === laneId ? { ...entry, name: normalizedName } : entry
            ),
          },
          editorId
        );
        if (!isGuestMode) {
          const committed = await gteApi.commitEditor(editorId);
          nextCanvas = normalizeCanvas(committed.snapshot, editorId);
        }
        applyCanvasUpdate(nextCanvas, { markDirty: isGuestMode });
      } catch (err: any) {
        setSaveError(err?.message || "Could not rename track.");
      }
    },
    [applyCanvasUpdate, canvas, editorId, isGuestMode]
  );

  const getExportLane = useCallback(() => {
    if (!canvas?.editors.length) return null;
    const preferredLaneId = mobileEditLaneId || activeLaneId;
    return canvas.editors.find((lane) => lane.id === preferredLaneId) || canvas.editors[0];
  }, [activeLaneId, canvas, mobileEditLaneId]);

  const handleExportTrack = useCallback((format: GteExportFormat) => {
    const lane = getExportLane();
    if (!lane || exportingTrack) return;
    setExportingTrack(true);
    setExportMenuOpen(false);
    setError(null);
    try {
      const file = buildGteExportFile(lane, format, canvas?.timingMap);
      downloadGteExportFile(file);
    } catch (err: any) {
      setError(err?.message || "Could not export this track.");
    } finally {
      setExportingTrack(false);
    }
  }, [canvas?.timingMap, exportingTrack, getExportLane]);

  const openTimingEditor = useCallback(() => {
    if (!canvas) return;
    const timingMap = timingMapForCanvas(canvas);
    const selectedBar =
      barSelection?.barIndices.length && barSelection.barIndices.length === 1
        ? timingMap.bars[barSelection.barIndices[0]]
        : null;
    setTimingBpmDraft(formatBpm(selectedBar?.quarterNoteBpm ?? timingMap.bars[0]?.quarterNoteBpm ?? 120));
    setTimingApplyToAll(!barSelection?.barIndices.length);
    setTimingDialogOpen(true);
    setOpenTopMenu(null);
  }, [barSelection?.barIndices, canvas]);

  const commitTimingBpm = useCallback(async () => {
    if (!canvas || timingSaving) return;
    const bpm = normalizeBpm(timingBpmDraft);
    if (!bpm) {
      setError("Enter a valid BPM.");
      return;
    }
    const barIndexes = Array.from(new Set(barSelection?.barIndices || [])).sort((left, right) => left - right);
    if (!timingApplyToAll && barIndexes.length === 0) {
      setError("Select one or more bars, or choose All bars.");
      return;
    }
    setTimingSaving(true);
    setError(null);
    try {
      if (isGuestMode) {
        const timingMap = timingMapForCanvas(canvas);
        const targets = timingApplyToAll ? timingMap.bars.map((bar) => bar.index) : barIndexes;
        const targetSet = new Set(targets);
        let cursorSeconds = 0;
        timingMap.bars = timingMap.bars.map((bar) => {
          const selected = targetSet.has(bar.index);
          const numerator = Math.max(1, bar.timeSignature.numerator);
          const denominator = Math.max(1, bar.timeSignature.denominator);
          const duration = selected
            ? (60 * numerator * (4 / denominator)) / bpm
            : Math.max(0.1, bar.endSeconds - bar.startSeconds);
          const next = {
            ...bar,
            startSeconds: cursorSeconds,
            endSeconds: cursorSeconds + duration,
            quarterNoteBpm: selected ? bpm : bar.quarterNoteBpm,
            source: selected ? "manual" : bar.source,
            confidence: selected ? 1 : bar.confidence,
            anchors: Array.from({ length: numerator + 1 }, (_, beat) => ({
              tick: Math.round((beat * FIXED_FRAMES_PER_BAR) / numerator),
              seconds: cursorSeconds + (beat * duration) / numerator,
            })),
          };
          cursorSeconds = next.endSeconds;
          return next;
        });
        applyCanvasUpdate(
          normalizeCanvas({ ...canvas, timingVersion: 2, timingMap, updatedAt: new Date().toISOString() }, editorId),
          { markDirty: true }
        );
      } else {
        const response = await gteApi.setBarTempo(editorId, {
          expectedVersion: Math.max(1, Number(canvas.version) || 1),
          barIndexes,
          bpm,
          applyToAll: timingApplyToAll,
        });
        applyCanvasUpdate(normalizeCanvas(response.canvas, editorId), { markDirty: true });
      }
      setTimingDialogOpen(false);
    } catch (err: any) {
      setError(err?.message || "Could not update bar tempo.");
    } finally {
      setTimingSaving(false);
    }
  }, [applyCanvasUpdate, barSelection?.barIndices, canvas, editorId, isGuestMode, timingApplyToAll, timingBpmDraft, timingSaving]);

  const previewTrackOffset = useCallback((nextOffsetFrames: number) => {
    const session = trackOffsetSessionRef.current;
    if (!session) return;
    const normalizedOffset = normalizeTrackOffsetFrames(nextOffsetFrames);
    if (normalizedOffset === session.previewOffsetFrames) return;
    const nextSession = { ...session, previewOffsetFrames: normalizedOffset };
    trackOffsetSessionRef.current = nextSession;
    setTrackOffsetSession(nextSession);
    setCanvas(
      normalizeCanvas(
        {
          ...session.baseCanvas,
          editors: session.baseCanvas.editors.map((item) =>
            item.id === session.laneId ? offsetTrackToFrame(item, normalizedOffset) : item
          ),
        },
        editorId
      )
    );
  }, [editorId]);

  const beginTrackOffset = useCallback((laneId: string) => {
    if (!canvas || shiftingLaneId) return;
    const lane = canvas.editors.find((item) => item.id === laneId);
    if (!lane) return;
    const startOffsetFrames = normalizeTrackOffsetFrames(lane.timelineOffsetFrames);
    const session: TrackOffsetSession = {
      laneId,
      baseCanvas: cloneCanvas(canvas),
      startOffsetFrames,
      previewOffsetFrames: startOffsetFrames,
      previousZoomPercent: timelineZoomPercent,
    };
    trackOffsetSessionRef.current = session;
    trackOffsetDragRef.current = null;
    setTrackOffsetSession(session);
    setTrackContextMenu(null);
    setOpenTrackMenuId(null);
    setActiveLaneId(laneId);
    setTimelineZoomPercent((current) => Math.min(current, 50));
  }, [canvas, cloneCanvas, shiftingLaneId, timelineZoomPercent]);

  const finishTrackOffset = useCallback(async (commit: boolean) => {
    const session = trackOffsetSessionRef.current;
    if (!session) return;
    trackOffsetSessionRef.current = null;
    trackOffsetDragRef.current = null;
    setTrackOffsetSession(null);
    setTimelineZoomPercent(session.previousZoomPercent);

    if (!commit || session.previewOffsetFrames === session.startOffsetFrames) {
      setCanvas(session.baseCanvas);
      return;
    }

    setShiftingLaneId(session.laneId);
    setError(null);
    try {
      const previewCanvas = normalizeCanvas(
        {
          ...session.baseCanvas,
          editors: session.baseCanvas.editors.map((item) =>
            item.id === session.laneId
              ? offsetTrackToFrame(item, session.previewOffsetFrames)
              : item
          ),
        },
        editorId
      );
      if (isGuestMode) {
        setCanvas(session.baseCanvas);
        applyCanvasUpdate(previewCanvas, { markDirty: true });
      } else {
        const response = await gteApi.setLaneTimelineOffset(editorId, session.laneId, {
          expectedVersion: Math.max(1, Number(session.baseCanvas.version) || 1),
          timelineOffsetFrames: session.previewOffsetFrames,
          applyToImportGroup: false,
        });
        applyCanvasUpdate(normalizeCanvas(response.canvas, editorId), { markDirty: true });
      }
    } catch (err: any) {
      setCanvas(session.baseCanvas);
      setError(err?.message || "Could not offset this track.");
    } finally {
      setShiftingLaneId(null);
    }
  }, [applyCanvasUpdate, editorId, isGuestMode]);

  const handleShiftTrack = useCallback(async (laneId: string, deltaBars: number) => {
    if (!canvas || shiftingLaneId) return;
    const lane = canvas.editors.find((item) => item.id === laneId);
    if (!lane) return;
    const currentOffset = Math.max(0, Math.round(toNumber(lane.timelineOffsetFrames, 0)));
    const nextOffset = Math.max(0, currentOffset + deltaBars * FIXED_FRAMES_PER_BAR);
    if (nextOffset === currentOffset) return;
    setShiftingLaneId(laneId);
    setError(null);
    try {
      if (isGuestMode) {
        const shifted = canvas.editors.map((item) =>
          item.id === laneId ? offsetTrackToFrame(item, nextOffset) : item
        );
        applyCanvasUpdate(normalizeCanvas({ ...canvas, editors: shifted }, editorId), { markDirty: true });
      } else {
        const response = await gteApi.setLaneTimelineOffset(editorId, laneId, {
          expectedVersion: Math.max(1, Number(canvas.version) || 1),
          timelineOffsetFrames: nextOffset,
          applyToImportGroup: false,
        });
        applyCanvasUpdate(normalizeCanvas(response.canvas, editorId), { markDirty: true });
      }
      setOpenTrackMenuId(null);
    } catch (err: any) {
      setError(err?.message || "Could not move this track.");
    } finally {
      setShiftingLaneId(null);
    }
  }, [applyCanvasUpdate, canvas, editorId, isGuestMode, shiftingLaneId]);

  const openTrackMerge = useCallback(() => {
    if (!canvas || canvas.editors.length < 2 || isGuestMode) return;
    setMergeTrackIds(canvas.editors.slice(0, 2).map((lane) => lane.id));
    setMergeTracksDialogOpen(true);
    setOpenTopMenu(null);
  }, [canvas, isGuestMode]);

  const commitTrackMerge = useCallback(async () => {
    if (!canvas || mergeTracksBusy || mergeTrackIds.length < 2) return;
    const mergePlan = buildTrackMergePlan(canvas.editors, mergeTrackIds);
    if (!mergePlan) return;
    setMergeTracksBusy(true);
    setError(null);
    try {
      const response = await gteApi.mergeTracks(editorId, {
        expectedVersion: Math.max(1, Number(canvas.version) || 1),
        laneIds: mergePlan.laneIds,
        name: mergePlan.name,
        keepOriginals: false,
      });
      applyCanvasUpdate(normalizeCanvas(response.canvas, editorId), { markDirty: false });
      setActiveLaneId(response.mergedLaneId);
      setMergeTracksDialogOpen(false);
    } catch (err: any) {
      setError(err?.message || "Could not merge these tracks.");
    } finally {
      setMergeTracksBusy(false);
    }
  }, [applyCanvasUpdate, canvas, editorId, mergeTrackIds, mergeTracksBusy]);

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
      const nextEditors = canvas.editors.filter((lane) => lane.id !== laneId);
      if (nextEditors.length === canvas.editors.length) {
        throw new Error("Track not found.");
      }
      const nextCanvas = normalizeCanvas(
        {
          ...canvas,
          editors: nextEditors,
          updatedAt: new Date().toISOString(),
          version: Math.max(1, Math.round(toNumber(canvas.version, 1))) + 1,
        },
        editorId
      );
      await gteApi.applySnapshot(editorId, nextCanvas);
      applyCanvasUpdate(nextCanvas, { markDirty: !isGuestMode });
      if (activeLaneId === laneId) {
        setActiveLaneId(nextCanvas.editors[0]?.id || null);
      }
      if (mobileEditLaneId === laneId) {
        setMobileEditLaneId(null);
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

  const handleMoveTrackBy = useCallback(
    (laneId: string, direction: -1 | 1) => {
      if (!canvas) return;
      const currentIndex = canvas.editors.findIndex((lane) => lane.id === laneId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= canvas.editors.length) return;
      setTrackContextMenu(null);
      void handleReorderTrack(laneId, direction < 0 ? nextIndex : nextIndex + 1);
    },
    [canvas, handleReorderTrack]
  );

  const handleLaneSnapshotChange = (
    laneId: string,
    nextLaneSnapshot: EditorSnapshot,
    options?: { recordHistory?: boolean; markDirty?: boolean }
  ) => {
    setCanvas((prev) => {
      if (!prev) return prev;
      const secondsPerBar = Math.max(
        0.1,
        toNumber(prev.secondsPerBar, toNumber(nextLaneSnapshot.secondsPerBar, DEFAULT_SECONDS_PER_BAR))
      );
      const sharedTimeSignature = normalizeTimeSignature(prev.editors[0]?.timeSignature) ?? 8;
      const sharedTimeSignatureBottom = normalizeTimeSignatureBottom(prev.editors[0]?.timeSignatureBottom) ?? 4;
      const laneIndex = prev.editors.findIndex((lane) => lane.id === laneId);
      if (laneIndex < 0) return prev;
      const previousLane = prev.editors[laneIndex];
      const normalizedLane = normalizeLane(
        {
          ...nextLaneSnapshot,
          secondsPerBar,
          timeSignature: sharedTimeSignature,
          timeSignatureBottom: sharedTimeSignatureBottom,
          instrumentId:
            normalizeTrackInstrumentId(nextLaneSnapshot.instrumentId) !== DEFAULT_TRACK_INSTRUMENT_ID ||
            normalizeTrackInstrumentId(previousLane.instrumentId) === DEFAULT_TRACK_INSTRUMENT_ID
              ? nextLaneSnapshot.instrumentId
              : previousLane.instrumentId,
        },
        laneId,
        secondsPerBar,
        laneIndex
      );
      const replacedCanvas = replaceCanvasLane(prev, laneId, normalizedLane);
      const nextCanvas = {
        ...replacedCanvas,
        updatedAt: new Date().toISOString(),
        secondsPerBar,
      };
      if (options?.recordHistory !== false) {
        recordCanvasHistory(prev, nextCanvas);
      }
      return nextCanvas;
    });
    if (options?.markDirty ?? options?.recordHistory !== false) {
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

  const commitLaneTuningChange = useCallback(
    (laneId: string, presetId: string, capoValue: number, preserveSound: boolean) => {
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
        const tunedLane = preserveSound
          ? applyTuningToSnapshotPreservingSound(normalizedLane, presetId, capo)
          : applyTuningToSnapshot(normalizedLane, presetId, capo);
        return normalizeLane(tunedLane, laneId, secondsPerBar, index);
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

  const handleLaneTuningChange = useCallback(
    (laneId: string, presetId: string, capoValue: number) => {
      if (!canvas) return;
      const secondsPerBar = Math.max(0.1, toNumber(canvas.secondsPerBar, DEFAULT_SECONDS_PER_BAR));
      const lane = canvas.editors.find((item, index) => {
        const normalizedLane = normalizeLane(item, item.id || `ed-${index + 1}`, secondsPerBar, index);
        return normalizedLane.id === laneId;
      });
      if (!lane) return;
      const currentTuning = getSnapshotTuning(lane);
      const capo = normalizeCapo(capoValue);
      if (currentTuning.presetId === presetId && currentTuning.capo === capo) return;
      if (lane.notes.length || lane.chords.length) {
        setPendingLaneTuningChange({ laneId, presetId, capo });
        return;
      }
      commitLaneTuningChange(laneId, presetId, capo, false);
    },
    [canvas, commitLaneTuningChange]
  );

  const closeLaneTuningPrompt = useCallback(() => {
    const pending = pendingLaneTuningChange;
    if (pending && canvas) {
      const lane = canvas.editors.find((item) => item.id === pending.laneId);
      if (lane) {
        const tuning = getSnapshotTuning(lane);
        setTrackCapoDraftById((prev) => ({ ...prev, [pending.laneId]: String(tuning.capo) }));
      }
    }
    setPendingLaneTuningChange(null);
  }, [canvas, pendingLaneTuningChange]);

  const resolveLaneTuningPrompt = useCallback(
    (preserveSound: boolean) => {
      const pending = pendingLaneTuningChange;
      if (!pending) return;
      setPendingLaneTuningChange(null);
      commitLaneTuningChange(pending.laneId, pending.presetId, pending.capo, preserveSound);
    },
    [commitLaneTuningChange, pendingLaneTuningChange]
  );

  const handleLaneCapoDraftChange = useCallback(
    (laneId: string, rawValue: string) => {
      setTrackCapoDraftById((prev) => ({ ...prev, [laneId]: rawValue }));
    },
    []
  );

  const commitLaneCapoDraft = useCallback(
    (laneId: string, presetId: string, fallbackCapo: number) => {
      const rawValue = trackCapoDraftById[laneId];
      const capo = rawValue === "" ? 0 : normalizeCapo(rawValue ?? fallbackCapo);
      setTrackCapoDraftById((prev) => ({ ...prev, [laneId]: String(capo) }));
      handleLaneTuningChange(laneId, presetId, capo);
    },
    [handleLaneTuningChange, trackCapoDraftById]
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
      const expanded = ensureCanvasBarsContainEvents(nextCanvas).canvas;
      const normalized = normalizeCanvas(expanded, editorId);
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
        const movedCanvas = moveBarsInCanvas(
          canvas,
          sourceLaneId,
          targetLaneId,
          barIndices,
          insertIndex
        );
        if (!movedCanvas) {
          throw new Error("Unable to move bars.");
        }
        const expandedCanvas = ensureCanvasBarsContainEvents(movedCanvas).canvas;
        if (isGuestMode) {
          applyCanvasBarUpdate(expandedCanvas);
        } else {
          const res = await gteApi.applySnapshot(editorId, expandedCanvas);
          const savedCanvas =
            res.canvas ||
            (res.snapshot && Array.isArray(res.snapshot.editors)
              ? (res.snapshot as CanvasSnapshot)
              : expandedCanvas);
          applyCanvasBarUpdate(savedCanvas);
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
      const nextRedo = appendBoundedHistory(
        canvasRedoRef.current,
        current,
        MAX_CANVAS_HISTORY
      );
      canvasUndoRef.current = nextUndo;
      canvasRedoRef.current = nextRedo;
      setCanvasUndoCount(nextUndo.length);
      setCanvasRedoCount(nextRedo.length);
      nextCanvasSnapshot = previous;
      return nextCanvasSnapshot;
    });
    setHasPendingCommit(true);
    if (nextCanvasSnapshot) {
      void syncCanvasDraftToBackend(nextCanvasSnapshot, { silent: true });
    }
  }, [addingLane, canvas, deletingLaneId, savingCanvas, syncCanvasDraftToBackend]);

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
      const nextUndo = appendBoundedHistory(
        canvasUndoRef.current,
        current,
        MAX_CANVAS_HISTORY
      );
      canvasUndoRef.current = nextUndo;
      canvasRedoRef.current = nextRedo;
      setCanvasUndoCount(nextUndo.length);
      setCanvasRedoCount(nextRedo.length);
      nextCanvasSnapshot = next;
      return nextCanvasSnapshot;
    });
    setHasPendingCommit(true);
    if (nextCanvasSnapshot) {
      void syncCanvasDraftToBackend(nextCanvasSnapshot, { silent: true });
    }
  }, [addingLane, canvas, deletingLaneId, savingCanvas, syncCanvasDraftToBackend]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      event.stopPropagation();
      if (savingCanvas || event.repeat) return;
      void commitCanvasToBackend({ force: true });
    };
    window.addEventListener("keydown", handleSaveShortcut, true);
    return () => window.removeEventListener("keydown", handleSaveShortcut, true);
  }, [commitCanvasToBackend, savingCanvas]);

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
    if (savingCanvas || hasPendingCommit) return "Unsaved changes";
    if (lastCommittedAt) {
      return `Saved ${new Date(lastCommittedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    return "Unsaved changes";
  }, [hasPendingCommit, lastCommittedAt, savingCanvas]);

  const sharedViewportBarCount = useMemo(() => {
    if (!canvas) return 1;
    let maxBars = 1;
    for (const lane of canvas.editors) {
      const bars = getLaneBarCount(lane);
      if (bars > maxBars) maxBars = bars;
    }
    return maxBars;
  }, [canvas]);

  useEffect(() => {
    if (isMobileViewport || !canvas) {
      setSharedTimelineBaseScale(undefined);
      return;
    }

    const container = sharedTimelineMeasureRef.current;
    if (!container) return;

    const computeScale = () => {
      const availableWidth = Math.max(240, container.clientWidth - 16);
      const rawScale = availableWidth / Math.max(1, FIXED_FRAMES_PER_BAR * 4);
      const nextScale = Math.max(0.5, Math.min(4, rawScale));
      setSharedTimelineBaseScale((prev) =>
        prev !== undefined && Math.abs(prev - nextScale) < 0.01 ? prev : nextScale
      );
    };

    computeScale();
    const observer = new ResizeObserver(computeScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvas, isMobileViewport]);

  const synchronizeSharedTimelineScroll = useCallback((next: number, scrollLeft?: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    const requestedScrollLeft = Number.isFinite(scrollLeft)
      ? Math.max(0, Number(scrollLeft))
      : null;
    sharedTimelineScrollRatioRef.current = clamped;

    applyingSharedTimelineDomRef.current = true;
    document.querySelectorAll<HTMLElement>("[data-gte-shared-timeline='true']").forEach((element) => {
      const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
      const targetScroll = requestedScrollLeft === null
        ? maxScroll * clamped
        : Math.min(maxScroll, requestedScrollLeft);
      if (Math.abs(element.scrollLeft - targetScroll) >= 0.5) {
        element.scrollLeft = targetScroll;
      }
    });
    const scrollbar = globalTimelineScrollbarRef.current;
    if (scrollbar) {
      const maxScroll = Math.max(0, scrollbar.scrollWidth - scrollbar.clientWidth);
      const targetScroll = requestedScrollLeft === null
        ? maxScroll * clamped
        : Math.min(maxScroll, requestedScrollLeft);
      if (Math.abs(scrollbar.scrollLeft - targetScroll) >= 0.5) {
        applyingGlobalTimelineScrollbarRef.current = true;
        scrollbar.scrollLeft = targetScroll;
      }
    }
    window.requestAnimationFrame(() => {
      applyingSharedTimelineDomRef.current = false;
      applyingGlobalTimelineScrollbarRef.current = false;
    });
  }, []);

  const handleSharedTimelineScrollRatioChange = useCallback(
    (next: number, scrollLeft?: number) => {
      if (applyingSharedTimelineDomRef.current) return;
      synchronizeSharedTimelineScroll(next, scrollLeft);
    },
    [synchronizeSharedTimelineScroll]
  );

  const globalTimelineTrackWidth = useMemo(
    () =>
      Math.max(
        1,
        GTE_TIMELINE_GUTTER_WIDTH +
          sharedViewportBarCount *
            FIXED_FRAMES_PER_BAR *
            (sharedTimelineBaseScale ?? 0.5) *
            (timelineZoomPercent / 100) +
          GTE_TIMELINE_END_PADDING
      ),
    [
      sharedTimelineBaseScale,
      sharedViewportBarCount,
      timelineZoomPercent,
    ]
  );

  const handleTrackOffsetPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = trackOffsetSessionRef.current;
      if (!session || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      trackOffsetDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollRatio: sharedTimelineScrollRatioRef.current,
        scrollRatio: sharedTimelineScrollRatioRef.current,
      };
    },
    []
  );

  const handleTrackOffsetPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = trackOffsetDragRef.current;
      const session = trackOffsetSessionRef.current;
      if (!drag || !session || drag.pointerId !== event.pointerId) return;
      event.preventDefault();

      const edgeSize = Math.min(120, Math.max(56, window.innerWidth * 0.08));
      let nextScrollRatio = drag.scrollRatio;
      if (event.clientX < edgeSize) nextScrollRatio = Math.max(0, nextScrollRatio - 0.018);
      if (event.clientX > window.innerWidth - edgeSize) {
        nextScrollRatio = Math.min(1, nextScrollRatio + 0.018);
      }
      if (nextScrollRatio !== drag.scrollRatio) {
        drag.scrollRatio = nextScrollRatio;
        synchronizeSharedTimelineScroll(nextScrollRatio);
      }

      const trackWidth = Math.max(
        240,
        (trackSectionRefs.current[session.laneId]?.clientWidth || window.innerWidth) - 160
      );
      const maxScroll = Math.max(0, globalTimelineTrackWidth - trackWidth);
      const scrollDelta = (nextScrollRatio - drag.startScrollRatio) * maxScroll;
      const pixelsPerBar = Math.max(
        1,
        FIXED_FRAMES_PER_BAR * (sharedTimelineBaseScale ?? 0.5) * (timelineZoomPercent / 100)
      );
      const deltaBars = Math.round((event.clientX - drag.startX + scrollDelta) / pixelsPerBar);
      previewTrackOffset(
        Math.max(0, session.startOffsetFrames + deltaBars * FIXED_FRAMES_PER_BAR)
      );
    },
    [
      globalTimelineTrackWidth,
      previewTrackOffset,
      sharedTimelineBaseScale,
      synchronizeSharedTimelineScroll,
      timelineZoomPercent,
    ]
  );

  const handleTrackOffsetPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = trackOffsetDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      trackOffsetDragRef.current = null;
      void finishTrackOffset(true);
    },
    [finishTrackOffset]
  );

  const mobileControlsSummary = `${nameDraft || "Untitled"} - ${bpmDraft} BPM - ${timeSignatureDraft}/${timeSignatureBottomDraft}`;
  const isMobileCanvasMode = isMobileViewport && mobileEditLaneId === null;
  const isMobileEditMode = isMobileViewport && mobileEditLaneId !== null;
  const globalControlsLaneId = useMemo(() => {
    if (!canvas?.editors.length) return null;
    if (mobileEditLaneId && canvas.editors.some((lane) => lane.id === mobileEditLaneId)) return mobileEditLaneId;
    if (
      practiceModeEnabled &&
      activeLaneId &&
      canvas.editors.some(
        (lane) => (lane.id || null) === activeLaneId && !isDrumLane(lane)
      )
    ) {
      return activeLaneId;
    }
    const tabLane = canvas.editors.find(
      (lane) => !isChordLane(lane) && !isDrumLane(lane)
    );
    if (tabLane) return tabLane.id || null;
    if (practiceModeEnabled) {
      // Drum lanes are never viewable in practice mode, so never fall back to one.
      const nonDrumLane = canvas.editors.find((lane) => !isDrumLane(lane));
      return nonDrumLane?.id || null;
    }
    return canvas.editors[0]?.id || null;
  }, [activeLaneId, canvas?.editors, mobileEditLaneId, practiceModeEnabled]);
  const activeEditableLaneId = useMemo(() => {
    if (!activeLaneId || !canvas?.editors.length) return null;
    const lane = canvas.editors.find((candidate) => (candidate.id || null) === activeLaneId);
    return lane ? activeLaneId : null;
  }, [activeLaneId, canvas?.editors]);
  const fallbackEditableLaneId = useMemo(
    () => canvas?.editors[0]?.id || null,
    [canvas?.editors]
  );
  const editMenuOwnerLaneId = activeEditableLaneId ?? fallbackEditableLaneId;
  const editMenuDisabled = activeEditableLaneId === null;
  const chordOnlyCanvas = useMemo(
    () => Boolean(canvas?.editors.length) && canvas!.editors.every((lane) => isChordLane(lane)),
    [canvas]
  );

  useEffect(() => {
    synchronizeSharedTimelineScroll(sharedTimelineScrollRatioRef.current);
  }, [canvas?.editors.length, editorId, globalTimelineTrackWidth, synchronizeSharedTimelineScroll, tabViewEnabled]);

  const handleGlobalTimelineScrollbarScroll = useCallback(
    (event: ReactUiEvent<HTMLDivElement>) => {
      if (applyingGlobalTimelineScrollbarRef.current) return;
      const maxScroll = Math.max(
        0,
        event.currentTarget.scrollWidth - event.currentTarget.clientWidth
      );
      if (maxScroll <= 0) return;
      handleSharedTimelineScrollRatioChange(
        event.currentTarget.scrollLeft / maxScroll,
        event.currentTarget.scrollLeft
      );
    },
    [handleSharedTimelineScrollRatioChange]
  );

  const canvasTimelineEnd = useMemo(() => {
    if (!canvas) return FIXED_FRAMES_PER_BAR;
    let maxFrames = FIXED_FRAMES_PER_BAR;
    canvas.editors.forEach((lane) => {
      maxFrames = Math.max(maxFrames, getLaneTimelineEnd(lane));
    });
    return maxFrames;
  }, [canvas]);

  const globalPlaybackFps = useMemo(
    () => fpsFromSecondsPerBar(Math.max(0.1, toNumber(canvas?.secondsPerBar, DEFAULT_SECONDS_PER_BAR))),
    [canvas?.secondsPerBar]
  );
  const globalTimingMap = useMemo(
    () =>
      canvas
        ? timingMapForCanvas(canvas)
        : normalizeTimingMap(undefined, {
            secondsPerBar: DEFAULT_SECONDS_PER_BAR,
            totalFrames: FIXED_FRAMES_PER_BAR,
          }),
    [canvas]
  );
  const selectedPracticePlaybackRange = useMemo(
    () =>
      practiceModeEnabled && barSelection?.laneId === globalControlsLaneId
        ? resolvePracticeLoopRange(
            barSelection.barIndices,
            FIXED_FRAMES_PER_BAR,
            canvasTimelineEnd
          )
        : null,
    [
      barSelection?.barIndices,
      barSelection?.laneId,
      canvasTimelineEnd,
      globalControlsLaneId,
      practiceModeEnabled,
    ]
  );
  const globalPracticeLoopRange = useMemo(
    () =>
      selectedPracticePlaybackRange ||
      (canvasTimelineEnd > 0 ? { startFrame: 0, endFrame: canvasTimelineEnd } : null),
    [canvasTimelineEnd, selectedPracticePlaybackRange]
  );
  const normalizedPlaybackSpeed = normalizePlaybackSpeed(playbackSpeed);
  const practiceSettingsStorageKey = `note2tabs:practice:${editorId}:v1`;
  const practiceRatingsStorageKey = `note2tabs:practice-ratings:${editorId}:v1`;

  useEffect(() => {
    practiceSettingsHydratedRef.current = false;
  }, [editorId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(practiceRatingsStorageKey) || "[]");
      const replayCountByLane = new Map<string, number>();
      const replays = Array.isArray(saved)
        ? saved.filter((replay: unknown): replay is PracticeRatingReplay => {
            if (!replay || typeof replay !== "object") {
              return false;
            }
            const candidate = replay as Partial<PracticeRatingReplay>;
            if (typeof candidate.laneId !== "string") return false;
            const count = replayCountByLane.get(candidate.laneId) ?? 0;
            if (count >= 3) return false;
            replayCountByLane.set(candidate.laneId, count + 1);
            return true;
          })
        : [];
      setPracticeRatingReplays(replays);
      setSelectedPracticeRatingId(replays[0]?.id ?? null);
    } catch {
      setPracticeRatingReplays([]);
      setSelectedPracticeRatingId(null);
    }
  }, [practiceRatingsStorageKey]);

  useEffect(() => {
    if (!canvas || practiceSettingsHydratedRef.current || typeof window === "undefined") return;
    practiceSettingsHydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(practiceSettingsStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (typeof saved.activeLaneId === "string") setActiveLaneId(saved.activeLaneId);
      setPlaybackSpeed(normalizePlaybackSpeed(saved.playbackSpeed));
      if (typeof saved.practiceLoopEnabled === "boolean") setPracticeLoopEnabled(saved.practiceLoopEnabled);
      if (typeof saved.metronomeEnabled === "boolean") setMetronomeEnabled(saved.metronomeEnabled);
      if (typeof saved.countInEnabled === "boolean") setCountInEnabled(saved.countInEnabled);
      if (typeof saved.speedTrainerEnabled === "boolean") setSpeedTrainerEnabled(saved.speedTrainerEnabled);
      if (typeof saved.practiceFocusEnabled === "boolean") setPracticeFocusEnabled(saved.practiceFocusEnabled);
      if (typeof saved.chordFingeringsVisible === "boolean") {
        setPracticeChordFingeringsVisible(saved.chordFingeringsVisible);
      }
      if (typeof saved.chordOverlayLaneId === "string") {
        setPracticeChordOverlayLaneId(saved.chordOverlayLaneId);
      } else {
        setPracticeChordOverlayLaneId(null);
      }
      setMetronomeVolume(Math.max(0, Math.min(1, Number(saved.metronomeVolume) || 0.7)));
      setCountInBars(Math.max(1, Math.min(3, Math.round(Number(saved.countInBars) || 1))));
      if (typeof saved.countInEveryLoop === "boolean") setCountInEveryLoop(saved.countInEveryLoop);
      setSpeedTrainerStart(normalizePlaybackSpeed(saved.speedTrainerStart ?? 0.75));
      setSpeedTrainerTarget(normalizePlaybackSpeed(saved.speedTrainerTarget));
      setSpeedTrainerStep(Math.max(0.01, Number(saved.speedTrainerStep) || 0.05));
      if (Array.isArray(saved.barIndices) && typeof saved.barLaneId === "string") {
        setBarSelection({
          laneId: saved.barLaneId,
          barIndices: saved.barIndices.map(Number).filter(Number.isFinite),
        });
      }
      const savedFrame = Number(saved.playbackFrame);
      if (Number.isFinite(savedFrame)) {
        const frame = Math.max(0, Math.min(canvasTimelineEnd, Math.round(savedFrame)));
        globalPlaybackFrameRef.current = frame;
        setGlobalPlaybackFrame(frame);
        setGlobalPlaybackFrameRevision((revision) => revision + 1);
      }
    } catch {
      // Ignore malformed local settings and continue with defaults.
    }
  }, [canvas, canvasTimelineEnd, practiceSettingsStorageKey]);

  useEffect(() => {
    if (!canvas || !practiceSettingsHydratedRef.current || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        practiceSettingsStorageKey,
        JSON.stringify({
          activeLaneId: globalControlsLaneId,
          playbackSpeed:
            speedTrainerSessionActiveRef.current && speedTrainerOriginalSpeedRef.current !== null
              ? speedTrainerOriginalSpeedRef.current
              : normalizedPlaybackSpeed,
          playbackFrame: globalPlaybackFrameRef.current,
          practiceLoopEnabled,
          metronomeEnabled,
          metronomeVolume,
          countInEnabled,
          countInBars,
          countInEveryLoop,
          speedTrainerEnabled,
          speedTrainerStart,
          speedTrainerTarget,
          speedTrainerStep,
          practiceFocusEnabled,
          chordOverlayLaneId: practiceChordOverlayLaneId,
          chordFingeringsVisible: practiceChordFingeringsVisible,
          barLaneId: barSelection?.laneId ?? null,
          barIndices: barSelection?.barIndices ?? [],
        })
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    barSelection,
    canvas,
    countInBars,
    countInEnabled,
    countInEveryLoop,
    globalControlsLaneId,
    globalPlaybackFrameRevision,
    metronomeEnabled,
    metronomeVolume,
    normalizedPlaybackSpeed,
    practiceFocusEnabled,
    practiceChordFingeringsVisible,
    practiceChordOverlayLaneId,
    practiceLoopEnabled,
    practiceSettingsStorageKey,
    speedTrainerEnabled,
    speedTrainerStart,
    speedTrainerStep,
    speedTrainerTarget,
  ]);

  useEffect(() => {
    if (!barSelection?.barIndices.length) setPracticeFocusEnabled(false);
  }, [barSelection]);

  useEffect(() => {
    if (speedTrainerStart <= speedTrainerTarget) return;
    setSpeedTrainerStart(speedTrainerTarget);
  }, [speedTrainerStart, speedTrainerTarget]);

  useEffect(() => {
    if (globalPracticeLoopRange) return;
    if (practiceLoopEnabled) setPracticeLoopEnabled(false);
  }, [globalPracticeLoopRange, practiceLoopEnabled]);
  useEffect(() => {
    practiceLoopEnabledRef.current = practiceLoopEnabled;
  }, [practiceLoopEnabled]);

  useEffect(() => {
    setGlobalPlaybackFrame((prev) => Math.max(0, Math.min(canvasTimelineEnd, Math.round(prev))));
  }, [canvasTimelineEnd]);

  useEffect(() => {
    globalPlaybackFrameRef.current = globalPlaybackFrame;
    setGlobalPlaybackCounterFrame(globalPlaybackFrame);
    globalPlaybackCounterSecondRef.current = Math.floor(
      globalPlaybackFrame / Math.max(1, globalPlaybackFps)
    );
  }, [globalPlaybackFps, globalPlaybackFrame]);

  const syncGlobalPlaybackFrame = useCallback((nextFrame: number, options?: { forceReact?: boolean }) => {
    const normalized = Math.max(0, Math.min(canvasTimelineEnd, Math.round(nextFrame)));
    globalPlaybackFrameRef.current = normalized;
    const counterSecond = Math.floor(normalized / Math.max(1, globalPlaybackFps));
    if (options?.forceReact || counterSecond !== globalPlaybackCounterSecondRef.current) {
      globalPlaybackCounterSecondRef.current = counterSecond;
      setGlobalPlaybackCounterFrame(normalized);
    }
    if (options?.forceReact) {
      setGlobalPlaybackFrame(normalized);
      setGlobalPlaybackFrameRevision((revision) => revision + 1);
    }
  }, [canvasTimelineEnd, globalPlaybackFps]);

  const getGlobalPlaybackFrame = useCallback(
    () => globalPlaybackFrameRef.current,
    [globalPlaybackFrameRevision]
  );

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
    setPracticeReplayPlayingId(null);
    if (practiceReplayAudioRef.current) {
      practiceReplayAudioRef.current.pause();
      practiceReplayAudioRef.current.removeAttribute("src");
      practiceReplayAudioRef.current.load();
      practiceReplayAudioRef.current = null;
    }
    if (practiceReplayAudioUrlRef.current) {
      URL.revokeObjectURL(practiceReplayAudioUrlRef.current);
      practiceReplayAudioUrlRef.current = null;
    }
    if (globalPlaybackAudioRef.current) {
      closeAudioContext(globalPlaybackAudioRef.current);
      globalPlaybackAudioRef.current = null;
    }
    globalPlaybackTrackGainByIdRef.current.clear();
    globalPlaybackMasterGainRef.current = null;
  }, []);

  const scheduleMetronomeClick = useCallback(
    (ctx: AudioContext, destination: AudioNode, startTime: number, accent: boolean) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(accent ? 1320 : 880, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(
        (accent ? 0.18 : 0.11) * metronomeVolume,
        startTime + 0.004
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.055);
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.06);
    },
    [metronomeVolume]
  );

  const stopGlobalPlayback = useCallback((options?: { preserveSpeedTrainerSession?: boolean }) => {
    globalPlaybackStartRequestRef.current += 1;
    globalPlaybackStartPendingRef.current = false;
    setGlobalPlaybackIsPreparing(false);
    if (globalPlaybackRafRef.current !== null) {
      window.cancelAnimationFrame(globalPlaybackRafRef.current);
      globalPlaybackRafRef.current = null;
    }
    globalPlaybackStartTimeRef.current = null;
    globalPlaybackEndFrameRef.current = null;
    globalPlaybackAudioStartRef.current = null;
    stopGlobalPlaybackAudio();
    setGlobalPlaybackIsPlaying(false);
    if (!options?.preserveSpeedTrainerSession) resetSpeedTrainerSession();
  }, [resetSpeedTrainerSession, stopGlobalPlaybackAudio]);

  useEffect(() => {
    if (practiceLoopEnabled || !speedTrainerEnabled) return;
    setSpeedTrainerEnabled(false);
    stopGlobalPlayback();
  }, [practiceLoopEnabled, speedTrainerEnabled, stopGlobalPlayback]);

  useEffect(() => {
    if (practiceModeEnabled || !speedTrainerSessionActiveRef.current) return;
    stopGlobalPlayback();
  }, [practiceModeEnabled, stopGlobalPlayback]);

  useEffect(() => {
    stopGlobalPlayback();
    syncGlobalPlaybackFrame(0, { forceReact: true });
  }, [editorId, stopGlobalPlayback, syncGlobalPlaybackFrame]);

  const scheduleGlobalPlayback = useCallback(
    async (
      ctx: AudioContext,
      audioReady: Promise<void>,
      isCurrentRequest: () => boolean,
      startFrame: number,
      speedOverride?: number,
      isLoopRestart = false,
      oneShotRange?: { startFrame: number; endFrame: number },
      forceRequestedStart = false,
      muteOutput = false
    ) => {
      if (!canvas) return null;
      const scheduleStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const runPlaybackSpeed = normalizePlaybackSpeed(speedOverride ?? normalizedPlaybackSpeed);
      const playbackStartFrame =
        oneShotRange?.startFrame ??
        resolvePracticePlaybackStart(
          startFrame,
          selectedPracticePlaybackRange ??
            (practiceLoopEnabled ? globalPracticeLoopRange : null),
          practiceLoopEnabled && !forceRequestedStart
        );
      const playbackEndFrame =
        oneShotRange?.endFrame ??
        (selectedPracticePlaybackRange?.endFrame ??
          (practiceLoopEnabled && globalPracticeLoopRange
            ? globalPracticeLoopRange.endFrame
            : canvasTimelineEnd));
      const playbackSecondsBetween = (fromFrame: number, toFrame: number) =>
        frameDurationSeconds(globalTimingMap, fromFrame, toFrame) / runPlaybackSpeed;

      const getMidiFromTab = (lane: EditorSnapshot, tab: [number, number], fallback?: number) => {
        const fromRef = lane.tabRef?.[tab[0]]?.[tab[1]];
        if (fromRef !== undefined && fromRef !== null && Number.isFinite(Number(fromRef))) {
          return Number(fromRef);
        }
        if (fallback !== undefined && fallback !== null && Number.isFinite(Number(fallback))) {
          return Number(fallback);
        }
        const openStrings = getOpenStringMidiFromSnapshot(lane);
        const base = openStrings[tab[0]];
        if (base !== undefined && Number.isFinite(tab[1]) && tab[1] >= 0) {
          return base + tab[1];
        }
        return 0;
      };

      let endFrame = Math.max(playbackStartFrame, playbackEndFrame);
      const events: Array<{
        trackId: string;
        start: number;
        duration: number;
        midi: number;
        gain: number;
        instrumentId: string;
        pan: number;
        drumVoiceId?: DrumVoiceId;
        bendSegments?: Array<{
          holdSec: number;
          bendSec: number;
          targetCents: number;
        }>;
      }> = [];

      const pushEvent = (
        eventStart: number,
        eventLength: number,
        midi: number,
        gain: number,
        instrumentId: string,
        pan: number,
        trackId: string,
        bendSegments?: Array<{
          holdFrames: number;
          bendFrames: number;
          targetCents: number;
        }>
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
          trackId,
          start: playbackSecondsBetween(playbackStartFrame, trimmedStart),
          duration: playbackSecondsBetween(trimmedStart, trimmedEnd),
          midi,
          gain,
          instrumentId,
          pan,
          bendSegments:
            Array.isArray(bendSegments) && bendSegments.length > 0
              ? bendSegments
                  .map((segment) => ({
                    holdSec: playbackSecondsBetween(
                      trimmedStart,
                      Math.max(trimmedStart, roundedStart + segment.holdFrames)
                    ),
                    bendSec: playbackSecondsBetween(
                      Math.max(trimmedStart, roundedStart + segment.holdFrames),
                      Math.max(trimmedStart, roundedStart + segment.holdFrames + segment.bendFrames)
                    ),
                    targetCents: segment.targetCents,
                  }))
                  .filter(
                    (segment) => Number.isFinite(segment.holdSec) && Number.isFinite(segment.bendSec)
                  )
              : undefined,
        });
      };

      canvas.editors.forEach((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        if (isolatedTrackId && laneId !== isolatedTrackId) return;
        if (trackMuteById[laneId]) return;
        const lanePan = normalizeTrackPan(trackPanById[laneId] ?? 0);
        const instrumentId = normalizeTrackInstrumentId(lane.instrumentId);
        if (isDrumLane(lane)) {
          materializeDrumLoopNotes(
            lane.notes,
            lane.drumLoops || [],
            lane.totalFrames
          ).forEach(({ note }) => {
            const roundedStart = Math.round(note.startTime);
            if (
              roundedStart < playbackStartFrame ||
              roundedStart >= playbackEndFrame
            ) {
              return;
            }
            endFrame = Math.max(endFrame, roundedStart + 1);
            events.push({
              trackId: laneId,
              start: playbackSecondsBetween(playbackStartFrame, roundedStart),
              duration: 0.2,
              midi: note.midiNum,
              gain: 0.72,
              instrumentId: "drum1",
              pan: lanePan,
              drumVoiceId: getDrumVoiceForNote(note).id,
            });
          });
          return;
        }
        const notesById = new Map(lane.notes.map((note) => [note.id, note] as const));
        const outgoingTransitions = new Map<
          number,
          {
            startNoteId: number;
            endNoteId: number;
            type: number;
          }
        >();
        const incomingTransitionNoteIds = new Set<number>();
        const discreteSlideEffects: Array<{ startNoteId: number; endNoteId: number }> = [];

        (lane.noteEffects || []).forEach((effect) => {
          const first = notesById.get(effect.startNoteId);
          const second = notesById.get(effect.endNoteId);
          if (!first || !second || first.id === second.id) return;
          if (first.tab[0] !== second.tab[0]) return;

          const [startNote, endNote] =
            first.startTime < second.startTime || (first.startTime === second.startTime && first.id <= second.id)
              ? [first, second]
              : [second, first];
          const blocked = lane.notes.some((note) => {
            if (note.id === startNote.id || note.id === endNote.id) return false;
            if (note.tab[0] !== startNote.tab[0]) return false;
            const noteStart = Math.round(note.startTime);
            return (
              Math.round(startNote.startTime + Math.max(1, Math.round(startNote.length))) <= noteStart &&
              noteStart <= Math.round(endNote.startTime)
            );
          });
          if (blocked) return;
          if (effect.type === 2) {
            discreteSlideEffects.push({ startNoteId: startNote.id, endNoteId: endNote.id });
            return;
          }
          if (effect.type !== 0 || outgoingTransitions.has(startNote.id)) return;
          outgoingTransitions.set(startNote.id, {
            startNoteId: startNote.id,
            endNoteId: endNote.id,
            type: effect.type,
          });
          incomingTransitionNoteIds.add(endNote.id);
        });

        const consumedTransitionNoteIds = new Set<number>();
        lane.notes.forEach((note) => {
          if (consumedTransitionNoteIds.has(note.id)) return;
          if (incomingTransitionNoteIds.has(note.id) && !outgoingTransitions.has(note.id)) return;

          const baseMidi =
            Number.isFinite(note.midiNum) && note.midiNum > 0 ? note.midiNum : getMidiFromTab(lane, note.tab);
          const noteGain = 0.55;
          if (!outgoingTransitions.has(note.id)) {
            pushEvent(note.startTime, note.length, baseMidi, noteGain, instrumentId, lanePan, laneId);
            return;
          }

          const chain = [note];
          const visited = new Set<number>([note.id]);
          let current = note;
          while (true) {
            const effect = outgoingTransitions.get(current.id);
            if (!effect) break;
            const next = notesById.get(effect.endNoteId);
            if (!next || visited.has(next.id)) break;
            chain.push(next);
            visited.add(next.id);
            current = next;
          }

          chain.forEach((item) => consumedTransitionNoteIds.add(item.id));
          const lastNote = chain[chain.length - 1];
          const totalEnd = Math.max(
            Math.round(lastNote.startTime + lastNote.length),
            ...chain.map((item) => Math.round(item.startTime + item.length))
          );
          const totalLength = Math.max(1, totalEnd - Math.round(note.startTime));
          const minimumBendFrames = 10;
          let previousBendEndFrames = 0;
          const bendSegments: Array<{ holdFrames: number; bendFrames: number; targetCents: number }> = [];
          chain.slice(1).forEach((item, chainIndex) => {
            const previous = chain[chainIndex];
            const transition = outgoingTransitions.get(previous.id);
            if (!transition) return;
            const targetMidi =
              Number.isFinite(item.midiNum) && item.midiNum > 0
                ? item.midiNum
                : getMidiFromTab(lane, item.tab);
            const targetStartFrames = Math.max(0, Math.round(item.startTime - note.startTime));
            const previousStartFrames = Math.max(0, Math.round(previous.startTime - note.startTime));
            const previousEndFrames = Math.max(
              previousStartFrames,
              Math.round(previous.startTime + previous.length - note.startTime)
            );
            const bendStartFrames = Math.max(
              previousStartFrames,
              previousBendEndFrames,
              Math.min(previousEndFrames, targetStartFrames - minimumBendFrames)
            );
            const bendFrames = Math.max(0, targetStartFrames - bendStartFrames);
            previousBendEndFrames = targetStartFrames;
            const targetCents = (targetMidi - baseMidi) * 100;
            bendSegments.push({
              holdFrames: bendStartFrames,
              bendFrames,
              targetCents,
            });
          });

          pushEvent(
            note.startTime,
            totalLength,
            baseMidi,
            noteGain,
            instrumentId,
            lanePan,
            laneId,
            bendSegments.length > 0 ? bendSegments : undefined
          );
        });

        discreteSlideEffects.forEach((effect) => {
          const source = notesById.get(effect.startNoteId);
          const target = notesById.get(effect.endNoteId);
          if (!source || !target) return;
          const sourceMidi =
            Number.isFinite(source.midiNum) && source.midiNum > 0
              ? source.midiNum
              : getMidiFromTab(lane, source.tab);
          const targetMidi =
            Number.isFinite(target.midiNum) && target.midiNum > 0
              ? target.midiNum
              : getMidiFromTab(lane, target.tab);
          const sourceStart = Math.round(source.startTime);
          const targetStart = Math.round(target.startTime);
          const sourceEnd = Math.round(source.startTime + source.length);
          const slideStart = Math.max(sourceStart, Math.min(sourceEnd, targetStart - 10));
          buildDiscreteSlideSteps({
            sourceMidi,
            targetMidi,
            slideStartFrame: slideStart,
            targetStartFrame: targetStart,
          }).forEach((step) => {
            pushEvent(
              step.startFrame,
              step.durationFrames,
              step.midi,
              0.55,
              instrumentId,
              lanePan,
              laneId
            );
          });
        });

        if (isChordLane(lane)) {
          lane.chords.forEach((chord) => {
            const midiNotes = getChordEditorMidiNotes(chord);
            if (!midiNotes.length) return;
            buildChordPlaybackWindows({
              chordStart: chord.startTime,
              chordLength: chord.length,
              strums: chord.strums,
              maxRingFrames: FIXED_FRAMES_PER_BAR,
            }).forEach((strum) => {
              if (strum.direction === "mute") return;
              const direction = strum.direction === "up" ? "up" : "down";
              const orderedNotes = direction === "up" ? [...midiNotes].reverse() : midiNotes;
              orderedNotes.forEach((midi, noteIndex) => {
                const noteStart = strum.startFrame + noteIndex * 4;
                if (noteStart >= strum.endFrame) return;
                pushEvent(
                  noteStart,
                  strum.endFrame - noteStart,
                  midi,
                  0.42,
                  instrumentId,
                  lanePan,
                  laneId
                );
              });
            });
          });
          return;
        }

        lane.chords.forEach((chord) => {
          buildChordPlaybackWindows({
            chordStart: chord.startTime,
            chordLength: chord.length,
            strums: chord.strums,
            maxRingFrames: FIXED_FRAMES_PER_BAR,
          }).forEach((strum) => {
            if (strum.direction === "mute") return;
            const notes = chord.currentTabs.map((tab, tabIndex) => ({ tab, tabIndex }));
            const orderedNotes = strum.direction === "up" ? notes.reverse() : notes;
            orderedNotes.forEach(({ tab, tabIndex }, noteIndex) => {
              const noteStart = strum.startFrame + noteIndex * 4;
              if (noteStart >= strum.endFrame) return;
              const midi = getMidiFromTab(lane, tab, chord.originalMidi?.[tabIndex]);
              pushEvent(
                noteStart,
                strum.endFrame - noteStart,
                midi,
                0.48,
                instrumentId,
                lanePan,
                laneId
              );
            });
          });
        });
      });

      const drumEventsPresent = !muteOutput && events.some((event) => event.drumVoiceId);
      const [preparedEntries, preparedDrumKit] = await Promise.all([
        muteOutput
          ? Promise.resolve([] as Array<readonly [string, Awaited<ReturnType<typeof prepareTrackInstrument>>]>)
          : Promise.all(
              [
                ...new Set(
                  events
                    .filter((event) => !event.drumVoiceId)
                    .map((event) => event.instrumentId)
                ),
              ].map(async (instrumentId) => {
                const instrument = await prepareTrackInstrument(ctx, instrumentId);
                return [instrumentId, instrument] as const;
              })
            ),
        drumEventsPresent ? prepareDrumKit(ctx) : Promise.resolve(null),
        audioReady,
      ]);
      if (!isCurrentRequest() || ctx.state !== "running") {
        throw new Error(AUDIO_CONTEXT_RESUME_ERROR);
      }
      const preparedByInstrumentId = new Map<string, Awaited<ReturnType<typeof prepareTrackInstrument>>>(
        preparedEntries
      );

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
      const trackGainById = new Map<string, GainNode>();
      if (!muteOutput) {
        new Set(events.map((event) => event.trackId)).forEach((trackId) => {
          const trackGain = ctx.createGain();
          trackGain.gain.value = normalizeTrackVolume(trackVolumeById[trackId] ?? 1);
          trackGain.connect(master);
          trackGainById.set(trackId, trackGain);
        });
      }
      globalPlaybackTrackGainByIdRef.current = trackGainById;
      const shouldCountIn = !oneShotRange && countInEnabled && (!isLoopRestart || countInEveryLoop);
      const playbackStartBar = Math.max(0, Math.floor(playbackStartFrame / FIXED_FRAMES_PER_BAR));
      const playbackStartBarFrame = playbackStartBar * FIXED_FRAMES_PER_BAR;
      const countInSec = shouldCountIn
        ? playbackSecondsBetween(
            playbackStartBarFrame,
            playbackStartBarFrame + FIXED_FRAMES_PER_BAR
          ) * countInBars
        : 0;
      const playBase = base + countInSec;

      if (!muteOutput && (metronomeEnabled || shouldCountIn)) {
        buildTimingMapMetronomeClicks({
          timingMap: globalTimingMap,
          startFrame: playbackStartFrame,
          endFrame,
          playbackSpeed: runPlaybackSpeed,
          countInBars: shouldCountIn ? countInBars : 0,
        }).forEach((click) => {
          if (!metronomeEnabled && !click.countIn) return;
          scheduleMetronomeClick(ctx, master, playBase + click.timeSec, click.accent);
        });
      }

      const destinationByTrackId = new Map<string, AudioNode>();
      if (!muteOutput) {
        const panByTrackId = new Map<string, number>();
        events.forEach((event) => {
          if (!panByTrackId.has(event.trackId)) panByTrackId.set(event.trackId, event.pan);
        });
        panByTrackId.forEach((pan, trackId) => {
          const trackDestination = trackGainById.get(trackId) ?? master;
          if (typeof ctx.createStereoPanner === "function") {
            const panner = ctx.createStereoPanner();
            panner.pan.value = normalizeTrackPan(pan);
            panner.connect(trackDestination);
            destinationByTrackId.set(trackId, panner);
            return;
          }
          const merger = ctx.createChannelMerger(2);
          const left = ctx.createGain();
          const right = ctx.createGain();
          const gains = equalPowerPanGains(pan);
          left.gain.value = gains.leftGain;
          right.gain.value = gains.rightGain;
          left.connect(merger, 0, 0);
          right.connect(merger, 0, 1);
          merger.connect(trackDestination);
          const splitter = ctx.createGain();
          splitter.connect(left);
          splitter.connect(right);
          destinationByTrackId.set(trackId, splitter);
        });
      }

      const scheduleAhead = createPlaybackLookaheadScheduler(
        events,
        (evt) => {
          if (muteOutput) return;
          const destination = destinationByTrackId.get(evt.trackId) ?? master;
          if (evt.drumVoiceId) {
            if (!preparedDrumKit) return;
            schedulePreparedDrumHit({
              ctx,
              destination,
              kit: preparedDrumKit,
              voiceId: evt.drumVoiceId,
              gain: evt.gain,
              startTime: playBase + evt.start,
            });
            return;
          }
          if (!Number.isFinite(evt.midi) || evt.midi <= 0) return;
          const instrument = preparedByInstrumentId.get(evt.instrumentId);
          if (!instrument) return;
          schedulePreparedTrackNote({
            ctx,
            destination,
            instrument,
            midi: evt.midi,
            gain: evt.gain,
            startTime: playBase + evt.start,
            duration: Math.max(0.05, evt.duration),
            bendSegments: evt.bendSegments,
          });
        },
        GLOBAL_PLAYBACK_LOOKAHEAD_SECONDS
      );
      scheduleAhead(0);

      recordGtePerfMeasure("global-playback-schedule", (typeof performance !== "undefined" ? performance.now() : Date.now()) - scheduleStartedAt, {
        eventCount: events.length,
        trackCount: canvas.editors.length,
      });

      return { ctx, endFrame, startFrame: playbackStartFrame, startTimeSec: playBase, scheduleAhead };
    },
    [
      canvas,
      canvasTimelineEnd,
      countInEnabled,
      countInBars,
      countInEveryLoop,
      globalTimingMap,
      globalPlaybackVolume,
      globalPracticeLoopRange,
      isolatedTrackId,
      metronomeEnabled,
      normalizedPlaybackSpeed,
      practiceLoopEnabled,
      scheduleMetronomeClick,
      selectedPracticePlaybackRange,
      trackMuteById,
      trackPanById,
      trackVolumeById,
    ]
  );

  const startGlobalPlayback = useCallback(async (
    startFrameOverride?: number,
    speedOverride?: number,
    isLoopRestart = false,
    options?: {
      oneShotRange?: { startFrame: number; endFrame: number };
      onScheduled?: (delaySeconds: number) => void;
      onComplete?: () => void;
      forceRequestedStart?: boolean;
      muteOutput?: boolean;
    }
  ) => {
    if (!canvas) return false;
    if (globalPlaybackRafRef.current !== null || globalPlaybackStartPendingRef.current) return false;
    globalPlaybackStartPendingRef.current = true;
    setGlobalPlaybackIsPreparing(true);
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
      options?.oneShotRange?.startFrame ??
      resolvePracticePlaybackStart(
        requestedStartFrame,
        selectedPracticePlaybackRange ??
          (practiceLoopEnabled ? globalPracticeLoopRange : null),
        practiceLoopEnabled && !options?.forceRequestedStart
      );
    stopGlobalPlaybackAudio();
    const runPlaybackSpeed = normalizePlaybackSpeed(speedOverride ?? normalizedPlaybackSpeed);
    let scheduled: Awaited<ReturnType<typeof scheduleGlobalPlayback>>;
    let playbackContext: AudioContext | null = null;
    try {
      // The context must be activated synchronously, before sample loading yields.
      playbackContext = new AudioContext();
      globalPlaybackAudioRef.current = playbackContext;
      const audioReady = resumeAudioContext(playbackContext);
      scheduled = await scheduleGlobalPlayback(
        playbackContext,
        audioReady,
        () =>
          globalPlaybackStartRequestRef.current === requestId &&
          globalPlaybackAudioRef.current === playbackContext,
        startFrame,
        runPlaybackSpeed,
        isLoopRestart,
        options?.oneShotRange,
        options?.forceRequestedStart,
        options?.muteOutput
      );
    } catch (error) {
      if (playbackContext) {
        closeAudioContext(playbackContext);
        if (globalPlaybackAudioRef.current === playbackContext) {
          globalPlaybackAudioRef.current = null;
          globalPlaybackMasterGainRef.current = null;
        }
      }
      if (globalPlaybackStartRequestRef.current === requestId) {
        setSaveError(error instanceof Error ? error.message : "Could not load the selected guitar sound.");
      }
      return false;
    } finally {
      if (globalPlaybackStartRequestRef.current === requestId) {
        globalPlaybackStartPendingRef.current = false;
        setGlobalPlaybackIsPreparing(false);
      }
    }
    if (globalPlaybackStartRequestRef.current !== requestId) {
      if (scheduled?.ctx) {
        closeAudioContext(scheduled.ctx);
      }
      return false;
    }
    if (!scheduled?.ctx) {
      if (playbackContext) {
        closeAudioContext(playbackContext);
        if (globalPlaybackAudioRef.current === playbackContext) {
          globalPlaybackAudioRef.current = null;
          globalPlaybackMasterGainRef.current = null;
        }
      }
      setGlobalPlaybackIsPlaying(false);
      return false;
    }

    globalPlaybackAudioStartRef.current = scheduled.startTimeSec ?? null;
    globalPlaybackEndFrameRef.current = Math.max(startFrame, Math.round(scheduled.endFrame ?? startFrame));
    globalPlaybackStartFrameRef.current = Math.round(scheduled.startFrame ?? startFrame);
    globalPlaybackStartTimeRef.current = performance.now();
    options?.onScheduled?.(
      Math.max(0, (scheduled.startTimeSec ?? scheduled.ctx.currentTime) - scheduled.ctx.currentTime)
    );
    syncGlobalPlaybackFrame(startFrame, { forceReact: true });
    setGlobalPlaybackIsPlaying(true);

    const tick = (now: number) => {
      if (globalPlaybackStartTimeRef.current === null) return;
      let elapsed = (now - globalPlaybackStartTimeRef.current) / 1000;
      if (globalPlaybackAudioRef.current && globalPlaybackAudioStartRef.current !== null) {
        elapsed = globalPlaybackAudioRef.current.currentTime - globalPlaybackAudioStartRef.current;
      }
      if (elapsed < 0) elapsed = 0;
      scheduled.scheduleAhead(elapsed);
      const nextFrame =
        secondsToFrame(
          globalTimingMap,
          frameToSeconds(globalTimingMap, globalPlaybackStartFrameRef.current) +
            elapsed * runPlaybackSpeed
        );
      const endFrame = globalPlaybackEndFrameRef.current ?? canvasTimelineEnd;
      if (nextFrame >= endFrame) {
        const trainerSessionActive = speedTrainerSessionActiveRef.current;
        if (
          trainerSessionActive &&
          runPlaybackSpeed >= normalizePlaybackSpeed(speedTrainerTarget)
        ) {
          syncGlobalPlaybackFrame(endFrame, { forceReact: true });
          setSpeedTrainerEnabled(false);
          stopGlobalPlayback();
          options?.onComplete?.();
          return;
        }
        if (
          !options?.oneShotRange &&
          practiceLoopEnabledRef.current &&
          globalPracticeLoopRange
        ) {
          const nextSpeed = trainerSessionActive
            ? nextSpeedTrainerValue(runPlaybackSpeed, speedTrainerStep, speedTrainerTarget)
            : runPlaybackSpeed;
          if (trainerSessionActive) {
            setPlaybackSpeed(nextSpeed);
          }
          syncGlobalPlaybackFrame(globalPracticeLoopRange.startFrame, { forceReact: true });
          stopGlobalPlayback({ preserveSpeedTrainerSession: trainerSessionActive });
          window.setTimeout(() => {
            if (trainerSessionActive && !speedTrainerSessionActiveRef.current) return;
            void startGlobalPlayback(globalPracticeLoopRange.startFrame, nextSpeed, true);
          }, 0);
          return;
        }
        syncGlobalPlaybackFrame(endFrame, { forceReact: true });
        stopGlobalPlayback();
        options?.onComplete?.();
        return;
      }
      incrementGtePlaybackFrameUpdates();
      syncGlobalPlaybackFrame(nextFrame);
      globalPlaybackRafRef.current = window.requestAnimationFrame(tick);
    };

    globalPlaybackRafRef.current = window.requestAnimationFrame(tick);
    return true;
  }, [
    canvas,
    canvasTimelineEnd,
    globalPracticeLoopRange,
    globalTimingMap,
    normalizedPlaybackSpeed,
    scheduleGlobalPlayback,
    selectedPracticePlaybackRange,
    speedTrainerStep,
    speedTrainerTarget,
    stopGlobalPlayback,
    stopGlobalPlaybackAudio,
    syncGlobalPlaybackFrame,
  ]);

  const startPracticeReplayPlayback = useCallback(
    async (replay: PracticeRatingReplay, startFrameOverride?: number) => {
      const audioStorageKey = replay.audioStorageKey;
      if (!audioStorageKey) {
        setPracticeRatingError("Audio was not saved for this older replay. Record a new Play & rate attempt to listen back.");
        return false;
      }
      if (globalPlaybackRafRef.current !== null || globalPlaybackStartPendingRef.current) {
        return false;
      }

      globalPlaybackStartPendingRef.current = true;
      setGlobalPlaybackIsPreparing(true);
      setPracticeRatingError(null);
      const requestId = globalPlaybackStartRequestRef.current + 1;
      globalPlaybackStartRequestRef.current = requestId;
      stopGlobalPlaybackAudio();

      let objectUrl: string | null = null;
      try {
        const cachedAudio = practiceReplayAudioCacheRef.current.get(audioStorageKey);
        const audioBlob = cachedAudio ?? (await readPracticeReplayAudio(audioStorageKey));
        if (!audioBlob) {
          throw new Error("The recorded audio for this replay is no longer available.");
        }
        practiceReplayAudioCacheRef.current.set(audioStorageKey, audioBlob);
        if (globalPlaybackStartRequestRef.current !== requestId) return false;

        objectUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(objectUrl);
        practiceReplayAudioUrlRef.current = objectUrl;
        practiceReplayAudioRef.current = audio;
        audio.preload = "auto";
        audio.volume = Math.max(0, Math.min(1, globalPlaybackVolume));
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
          audio.addEventListener("error", () => reject(new Error("The recorded replay audio could not be loaded.")), {
            once: true,
          });
          audio.load();
        });
        if (globalPlaybackStartRequestRef.current !== requestId) return false;

        const requestedFrame = Math.round(startFrameOverride ?? globalPlaybackFrameRef.current);
        const startFrame =
          requestedFrame >= replay.startFrame && requestedFrame < replay.endFrame
            ? requestedFrame
            : replay.startFrame;
        const replaySpeed = normalizePlaybackSpeed(replay.playbackSpeed);
        const audioOffsetSeconds = Math.max(
          0,
          frameDurationSeconds(globalTimingMap, replay.startFrame, startFrame) / replaySpeed
        );
        audio.currentTime = Math.min(audio.duration || audioOffsetSeconds, audioOffsetSeconds);
        await audio.play();
        if (globalPlaybackStartRequestRef.current !== requestId) return false;

        syncGlobalPlaybackFrame(startFrame, { forceReact: true });
        setPracticeReplayPlayingId(replay.id);
        setGlobalPlaybackIsPlaying(true);
        const tick = () => {
          if (
            globalPlaybackStartRequestRef.current !== requestId ||
            practiceReplayAudioRef.current !== audio
          ) {
            return;
          }
          const nextFrame = Math.min(
            replay.endFrame,
            secondsToFrame(
              globalTimingMap,
              frameToSeconds(globalTimingMap, replay.startFrame) +
                audio.currentTime * replaySpeed
            )
          );
          if (audio.ended || nextFrame >= replay.endFrame) {
            syncGlobalPlaybackFrame(replay.endFrame, { forceReact: true });
            stopGlobalPlayback();
            return;
          }
          incrementGtePlaybackFrameUpdates();
          syncGlobalPlaybackFrame(nextFrame);
          globalPlaybackRafRef.current = window.requestAnimationFrame(tick);
        };
        globalPlaybackRafRef.current = window.requestAnimationFrame(tick);
        return true;
      } catch (error) {
        if (globalPlaybackStartRequestRef.current === requestId) {
          stopGlobalPlaybackAudio();
          setPracticeRatingError(
            error instanceof Error ? error.message : "The recorded replay audio could not be played."
          );
        } else if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        return false;
      } finally {
        if (globalPlaybackStartRequestRef.current === requestId) {
          globalPlaybackStartPendingRef.current = false;
          setGlobalPlaybackIsPreparing(false);
        }
      }
    },
    [
      globalTimingMap,
      globalPlaybackVolume,
      stopGlobalPlayback,
      stopGlobalPlaybackAudio,
      syncGlobalPlaybackFrame,
    ]
  );

  const downloadPracticeReplayAudio = useCallback(async (replay: PracticeRatingReplay) => {
    const audioStorageKey = replay.audioStorageKey;
    if (!audioStorageKey) {
      setPracticeRatingError("Audio was not saved for this older replay.");
      return;
    }

    try {
      setPracticeRatingError(null);
      const cachedAudio = practiceReplayAudioCacheRef.current.get(audioStorageKey);
      const audioBlob = cachedAudio ?? (await readPracticeReplayAudio(audioStorageKey));
      if (!audioBlob) {
        throw new Error("The recorded audio for this replay is no longer available.");
      }
      practiceReplayAudioCacheRef.current.set(audioStorageKey, audioBlob);
      const extension = audioBlob.type.includes("ogg")
        ? "ogg"
        : audioBlob.type.includes("mp4")
          ? "m4a"
          : "webm";
      const objectUrl = URL.createObjectURL(audioBlob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `practice-replay-${replay.id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      setPracticeRatingError(
        error instanceof Error ? error.message : "The recorded replay audio could not be downloaded."
      );
    }
  }, []);

  const beginSpeedTrainerSession = useCallback(() => {
    const startSpeed = Math.min(
      normalizePlaybackSpeed(speedTrainerStart),
      normalizePlaybackSpeed(speedTrainerTarget)
    );
    speedTrainerOriginalSpeedRef.current = normalizedPlaybackSpeed;
    speedTrainerSessionActiveRef.current = true;
    setSpeedTrainerSessionActive(true);
    practiceLoopEnabledRef.current = true;
    setPracticeLoopEnabled(true);
    setPlaybackSpeed(startSpeed);
    return startSpeed;
  }, [normalizedPlaybackSpeed, speedTrainerStart, speedTrainerTarget]);

  const toggleSpeedTrainer = useCallback(() => {
    stopGlobalPlayback();
    if (speedTrainerEnabled) {
      setSpeedTrainerEnabled(false);
      return;
    }
    practiceLoopEnabledRef.current = true;
    setPracticeLoopEnabled(true);
    setSpeedTrainerEnabled(true);
  }, [speedTrainerEnabled, stopGlobalPlayback]);

  const toggleGlobalPlayback = useCallback(() => {
    if (globalPlaybackStartPendingRef.current) return;
    if (globalPlaybackIsPlaying) {
      stopGlobalPlayback();
      return;
    }
    if (speedTrainerEnabled && globalPracticeLoopRange) {
      const startSpeed = beginSpeedTrainerSession();
      void startGlobalPlayback(globalPracticeLoopRange.startFrame, startSpeed).then((started) => {
        if (!started) resetSpeedTrainerSession();
      });
      return;
    }
    const atTimelineEnd = Math.round(globalPlaybackFrameRef.current) >= canvasTimelineEnd;
    void startGlobalPlayback(atTimelineEnd ? 0 : undefined);
  }, [
    beginSpeedTrainerSession,
    canvasTimelineEnd,
    globalPracticeLoopRange,
    globalPlaybackIsPlaying,
    resetSpeedTrainerSession,
    speedTrainerEnabled,
    startGlobalPlayback,
    stopGlobalPlayback,
  ]);

  const playPracticeFromFrame = useCallback(
    (frame: number) => {
      stopGlobalPlayback();
      void startGlobalPlayback(frame, undefined, false, { forceRequestedStart: true });
    },
    [startGlobalPlayback, stopGlobalPlayback]
  );

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

  useEffect(() => {
    const handleFullscreenChange = () => {
      setPracticeFullscreen(document.fullscreenElement === practiceRootRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const seekGlobalPlayback = useCallback(
    (frame: number) => {
      const clamped = Math.max(0, Math.min(canvasTimelineEnd, Math.round(frame)));
      if (globalPlaybackIsPlaying || globalPlaybackStartPendingRef.current) {
        stopGlobalPlayback();
      }
      syncGlobalPlaybackFrame(clamped, { forceReact: true });
    },
    [canvasTimelineEnd, globalPlaybackIsPlaying, stopGlobalPlayback, syncGlobalPlaybackFrame]
  );

  const skipGlobalPlaybackToStart = useCallback(() => {
    seekGlobalPlayback(0);
  }, [seekGlobalPlayback]);

  const skipGlobalPlaybackBackwardBar = useCallback(() => {
    const current = Math.max(0, Math.floor(globalPlaybackFrameRef.current));
    const prevIndex = Math.floor((current - 1) / FIXED_FRAMES_PER_BAR);
    const target = Math.max(0, prevIndex * FIXED_FRAMES_PER_BAR);
    seekGlobalPlayback(target);
  }, [seekGlobalPlayback]);

  const skipGlobalPlaybackForwardBar = useCallback(() => {
    const current = Math.max(0, Math.floor(globalPlaybackFrameRef.current));
    const nextIndex = Math.floor(current / FIXED_FRAMES_PER_BAR) + 1;
    const target = Math.min(canvasTimelineEnd, nextIndex * FIXED_FRAMES_PER_BAR);
    seekGlobalPlayback(target);
  }, [canvasTimelineEnd, seekGlobalPlayback]);

  useEffect(() => {
    if (!practiceModeEnabled) return;
    const handlePracticeShortcut = (event: KeyboardEvent) => {
      if (isShortcutTextEntryTarget(event.target as HTMLElement | null)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        event.preventDefault();
        toggleGlobalPlayback();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        skipGlobalPlaybackBackwardBar();
      } else if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        skipGlobalPlaybackForwardBar();
      } else if (key === "l") {
        event.preventDefault();
        setPracticeLoopEnabled((enabled) => !enabled);
      } else if (key === "m") {
        event.preventDefault();
        setMetronomeEnabled((enabled) => !enabled);
      } else if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        const direction = event.key === "[" ? -1 : 1;
        const currentIndex = PLAYBACK_SPEED_OPTIONS.findIndex(
          (speed) => speed >= normalizedPlaybackSpeed
        );
        const nextIndex = Math.max(
          0,
          Math.min(
            PLAYBACK_SPEED_OPTIONS.length - 1,
            (currentIndex < 0 ? 2 : currentIndex) + direction
          )
        );
        setPlaybackSpeed(PLAYBACK_SPEED_OPTIONS[nextIndex]);
      }
    };
    window.addEventListener("keydown", handlePracticeShortcut, true);
    return () => window.removeEventListener("keydown", handlePracticeShortcut, true);
  }, [
    normalizedPlaybackSpeed,
    practiceModeEnabled,
    skipGlobalPlaybackBackwardBar,
    skipGlobalPlaybackForwardBar,
    toggleGlobalPlayback,
  ]);

  const handleGlobalPlaybackVolumeChange = useCallback((nextVolume: number) => {
    const volume = Math.max(0, Math.min(1, nextVolume));
    setGlobalPlaybackVolume(volume);
    if (practiceReplayAudioRef.current) {
      practiceReplayAudioRef.current.volume = volume;
    }
  }, []);

  const persistTrackPlaybackCanvas = useCallback(
    (nextCanvas: CanvasSnapshot) => {
      applyCanvasUpdate(nextCanvas, { markDirty: true, recordHistory: false });
      void syncCanvasDraftToBackend(nextCanvas, { silent: true });
    },
    [applyCanvasUpdate, syncCanvasDraftToBackend]
  );

  const toggleTrackMute = useCallback((trackId: string) => {
    if (!canvas) return;
    const nextMuted = !Boolean(trackMuteById[trackId]);
    setTrackMuteById((prev) => ({ ...prev, [trackId]: nextMuted }));
    persistTrackPlaybackCanvas({
      ...canvas,
      updatedAt: new Date().toISOString(),
      editors: canvas.editors.map((lane) =>
        lane.id === trackId ? { ...lane, playbackMuted: nextMuted } : lane
      ),
    });
  }, [canvas, persistTrackPlaybackCanvas, trackMuteById]);

  const handleTrackVolumePreview = useCallback((trackId: string, nextVolume: number) => {
    const volume = normalizeTrackVolume(nextVolume);
    pendingTrackVolumeByIdRef.current[trackId] = volume;
    setTrackVolumeById((prev) => ({ ...prev, [trackId]: volume }));
    const audioContext = globalPlaybackAudioRef.current;
    const trackGain = globalPlaybackTrackGainByIdRef.current.get(trackId);
    if (audioContext && trackGain) {
      const now = audioContext.currentTime;
      trackGain.gain.cancelScheduledValues(now);
      trackGain.gain.setTargetAtTime(volume, now, 0.015);
    }
  }, []);

  const commitTrackVolume = useCallback((trackId: string) => {
    if (!canvas) return;
    const pendingVolume = pendingTrackVolumeByIdRef.current[trackId];
    if (pendingVolume === undefined) return;
    delete pendingTrackVolumeByIdRef.current[trackId];
    persistTrackPlaybackCanvas({
      ...canvas,
      updatedAt: new Date().toISOString(),
      editors: canvas.editors.map((lane) =>
        lane.id === trackId ? { ...lane, playbackVolume: pendingVolume } : lane
      ),
    });
  }, [canvas, persistTrackPlaybackCanvas]);

  const handleTrackPanChange = useCallback((trackId: string, nextPan: number) => {
    setTrackPanById((prev) => ({
      ...prev,
      [trackId]: normalizeTrackPan(nextPan),
    }));
  }, []);

  const toggleTrackIsolation = useCallback((trackId: string) => {
    if (!canvas) return;
    const nextIsolatedId = isolatedTrackId === trackId ? null : trackId;
    setIsolatedTrackId(nextIsolatedId);
    persistTrackPlaybackCanvas({
      ...canvas,
      updatedAt: new Date().toISOString(),
      editors: canvas.editors.map((lane) => ({
        ...lane,
        playbackIsolated: lane.id === nextIsolatedId,
      })),
    });
  }, [canvas, isolatedTrackId, persistTrackPlaybackCanvas]);

  const trackPlaybackStateSignature = useMemo(() => {
    if (!canvas) return "";
    return [
      `iso:${isolatedTrackId ?? ""}`,
      `loop:${practiceLoopEnabled ? globalPracticeLoopRange?.startFrame ?? "-" : "-"}:${practiceLoopEnabled ? globalPracticeLoopRange?.endFrame ?? "-" : "-"}`,
      `selection:${selectedPracticePlaybackRange?.startFrame ?? "-"}:${selectedPracticePlaybackRange?.endFrame ?? "-"}`,
      `met:${metronomeEnabled ? 1 : 0}`,
      `count:${countInEnabled ? 1 : 0}`,
      `train:${speedTrainerEnabled ? 1 : 0}`,
      `speed:${Math.round(normalizedPlaybackSpeed * 1000)}`,
      ...canvas.editors.map((lane, index) => {
        const laneId = lane.id || `ed-${index + 1}`;
        return `${laneId}:${trackMuteById[laneId] ? 1 : 0}:${Math.round(
          normalizeTrackPan(trackPanById[laneId] ?? 0) * 1000
        )}`;
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
    selectedPracticePlaybackRange,
    speedTrainerEnabled,
    trackMuteById,
    trackPanById,
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
    if (!openTrackMenuId && !openMobileBarMenuLaneId && !trackContextMenu) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-track-menu='true'], [data-mobile-bar-menu='true']")) return;
      setOpenTrackMenuId(null);
      setOpenMobileBarMenuLaneId(null);
      setTrackContextMenu(null);
    };
    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("touchstart", handlePointerDown, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("touchstart", handlePointerDown, true);
    };
  }, [openMobileBarMenuLaneId, openTrackMenuId, trackContextMenu]);

  useEffect(() => {
    if (!trackOffsetSession) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void finishTrackOffset(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        void finishTrackOffset(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finishTrackOffset, trackOffsetSession]);

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
    let rafId: number | null = null;
    const alignToPlayback = () => {
      const scrollbar = globalTimelineScrollbarRef.current;
      if (!scrollbar) return;
      const maxScroll = Math.max(0, scrollbar.scrollWidth - scrollbar.clientWidth);
      if (maxScroll > 0) {
        const progress = Math.max(
          0,
          Math.min(1, globalPlaybackFrameRef.current / Math.max(1, canvasTimelineEnd))
        );
        const target = getPlaybackScrollTarget({
          playheadLeft: progress * scrollbar.scrollWidth,
          maxScroll,
          visibleStartInContainer: 0,
          visibleWidth: scrollbar.clientWidth,
        });
        if (Math.abs(scrollbar.scrollLeft - target) >= 0.5) {
          synchronizeSharedTimelineScroll(target / maxScroll, target);
        }
      }
    };
    const tick = () => {
      alignToPlayback();
      rafId = window.requestAnimationFrame(tick);
    };
    // Align immediately, then retain canvas-level ownership until playback stops.
    alignToPlayback();
    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [canvasTimelineEnd, globalPlaybackIsPlaying, synchronizeSharedTimelineScroll]);

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

  const renderViewModeSwitch = (compact = false) => {
    const activeIndex = editorMode === "canvas" ? 0 : editorMode === "tab" ? 1 : 2;
    return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-100 p-0.5 ${
        compact ? "w-64" : "w-72"
      }`}
    >
      <div
        className="relative grid grid-cols-3"
        role="group"
        aria-label="Workspace mode"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 rounded-md bg-white shadow-sm ring-1 ring-slate-200/70 transition-transform duration-200 ease-out"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        <button
          type="button"
          onClick={() => setEditorMode("canvas")}
          aria-pressed={editorMode === "canvas"}
          className={`relative z-10 h-7 rounded-md px-2 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 ${
            editorMode === "canvas" ? "text-slate-900" : "text-slate-600 hover:text-slate-800"
          }`}
        >
          Canvas
        </button>
        <button
          type="button"
          onClick={() => setEditorMode("tab")}
          aria-pressed={editorMode === "tab"}
          className={`relative z-10 h-7 rounded-md px-2 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 ${
            editorMode === "tab" ? "text-slate-900" : "text-slate-600 hover:text-slate-800"
          }`}
        >
          Tab view
        </button>
        <button
          type="button"
          onClick={() => setEditorMode("practice")}
          aria-pressed={practiceModeEnabled}
          className={`relative z-10 h-7 rounded-md px-2 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${
            practiceModeEnabled ? "text-emerald-800" : "text-slate-600 hover:text-slate-800"
          }`}
        >
          Practice
        </button>
      </div>
    </div>
    );
  };

  const practiceLaneIndex =
    canvas?.editors.findIndex(
      (lane, index) =>
        !isChordLane(lane) &&
        (lane.id || `ed-${index + 1}`) === globalControlsLaneId
    ) ?? -1;
  const practiceLane =
    practiceLaneIndex >= 0 ? canvas?.editors[practiceLaneIndex] ?? null : null;
  const practiceLaneId =
    practiceLane && practiceLaneIndex >= 0
      ? practiceLane.id || `ed-${practiceLaneIndex + 1}`
      : null;
  const practiceSoundLaneIndex =
    canvas?.editors.findIndex(
      (lane, index) => (lane.id || `ed-${index + 1}`) === globalControlsLaneId
    ) ?? -1;
  const practiceSoundLane =
    practiceSoundLaneIndex >= 0 ? canvas?.editors[practiceSoundLaneIndex] ?? null : null;
  const practiceSoundLaneId =
    practiceSoundLane && practiceSoundLaneIndex >= 0
      ? practiceSoundLane.id || `ed-${practiceSoundLaneIndex + 1}`
      : null;
  const practiceViewedLaneIsChord = practiceSoundLane ? isChordLane(practiceSoundLane) : false;
  const practiceInstrumentValue = practiceSoundLane
    ? normalizeTrackInstrumentId(practiceSoundLane.instrumentId)
    : DEFAULT_TRACK_INSTRUMENT_ID;
  const practiceRatingReplaysForLane = useMemo(
    () => practiceRatingReplays.filter((replay) => replay.laneId === practiceLaneId),
    [practiceLaneId, practiceRatingReplays]
  );
  useEffect(() => {
    if (!practiceReplayPlayingId) return;
    const playingReplay = practiceRatingReplays.find(
      (replay) => replay.id === practiceReplayPlayingId
    );
    if (playingReplay?.laneId === practiceLaneId) return;
    stopGlobalPlayback();
  }, [practiceLaneId, practiceRatingReplays, practiceReplayPlayingId, stopGlobalPlayback]);
  useEffect(() => {
    if (
      selectedPracticeRatingId &&
      practiceRatingReplaysForLane.some((replay) => replay.id === selectedPracticeRatingId)
    ) {
      return;
    }
    setSelectedPracticeRatingId(practiceRatingReplaysForLane[0]?.id ?? null);
    if (practiceRatingReplaysForLane.length > 0) setShowPracticeRating(true);
  }, [practiceRatingReplaysForLane, selectedPracticeRatingId]);
  const selectedPracticeRatingForPlayback =
    practiceRatingReplaysForLane.find((replay) => replay.id === selectedPracticeRatingId) ?? null;
  const selectedPracticeRating =
    PRACTICE_RATING_UI_ENABLED && showPracticeRating
      ? selectedPracticeRatingForPlayback
      : null;
  const practiceChordLaneOptions = useMemo(
    () =>
      canvas?.editors.flatMap((lane, index) =>
        isChordLane(lane)
          ? [{ lane, laneId: lane.id || `ed-${index + 1}`, trackNumber: index + 1 }]
          : []
      ) ?? [],
    [canvas?.editors]
  );
  const practiceChordOverlay = useMemo(
    () =>
      practiceChordLaneOptions.find(
        (option) => option.laneId === practiceChordOverlayLaneId
      )?.lane ?? null,
    [practiceChordLaneOptions, practiceChordOverlayLaneId]
  );
  useEffect(() => {
    if (!practiceChordOverlayLaneId || practiceChordOverlay) return;
    setPracticeChordOverlayLaneId(null);
  }, [practiceChordOverlay, practiceChordOverlayLaneId]);
  const practiceRatingBusy = practiceRatingState !== "idle";

  const toggleSelectedPracticeReplay = () => {
    const replay = selectedPracticeRatingForPlayback;
    if (!replay) return;
    if (globalPlaybackIsPlaying && practiceReplayPlayingId === replay.id) {
      stopGlobalPlayback();
      return;
    }
    stopGlobalPlayback();
    const atReplayEnd = Math.round(globalPlaybackFrameRef.current) >= replay.endFrame;
    void startPracticeReplayPlayback(
      replay,
      atReplayEnd ? replay.startFrame : undefined
    );
  };

  const startPracticeRating = async () => {
    if (
      !practiceLane ||
      !practiceLaneId ||
      !globalPracticeLoopRange ||
      practiceRatingBusy
    ) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPracticeRatingError("Microphone recording is not supported by this browser.");
      return;
    }

    let stream: MediaStream | null = null;
    let microphoneContext: AudioContext | null = null;
    try {
      setPracticeRatingError(null);
      stopGlobalPlayback();
      setPracticeRatingState("permission");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Preserve the full guitar spectrum. Browser speech processing can
          // remove harmonics and sustained instrument tones that the
          // polyphonic pitch detector needs.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });

      setPracticeRatingState("countdown");
      for (let count = 5; count > 0; count -= 1) {
        setPracticeRatingCountdown(count);
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }

      microphoneContext = new AudioContext();
      await resumeAudioContext(microphoneContext);
      const source = microphoneContext.createMediaStreamSource(stream);
      const processor = microphoneContext.createScriptProcessor(4096, 1, 1);
      const silentOutput = microphoneContext.createGain();
      silentOutput.gain.value = 0;
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(microphoneContext.destination);

      setPracticeRatingState("recording");
      const recordingStartedAt = performance.now();
      let playbackLeadSeconds = 0;
      const playbackDurationSeconds =
        frameDurationSeconds(
          globalTimingMap,
          globalPracticeLoopRange.startFrame,
          globalPracticeLoopRange.endFrame
        ) / normalizedPlaybackSpeed;
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          void startGlobalPlayback(
            globalPracticeLoopRange.startFrame,
            normalizedPlaybackSpeed,
            false,
            {
              oneShotRange: globalPracticeLoopRange,
              // Raw microphone mode cannot use browser echo cancellation.
              // Do not create audible synth or metronome nodes while rating,
              // otherwise the speakers become a perfect false performance.
              muteOutput: true,
              onScheduled: (delaySeconds) => {
                playbackLeadSeconds =
                  (performance.now() - recordingStartedAt) / 1000 + delaySeconds;
              },
              onComplete: resolve,
            }
          ).then((started) => {
            if (!started) reject(new Error("Practice playback could not start."));
          });
        }),
        new Promise<void>((_, reject) =>
          window.setTimeout(
            () => reject(new Error("Practice playback did not finish in time.")),
            Math.ceil((playbackDurationSeconds + 15) * 1000)
          )
        ),
      ]);
      await new Promise((resolve) => window.setTimeout(resolve, 250));

      processor.disconnect();
      source.disconnect();
      silentOutput.disconnect();
      processor.onaudioprocess = null;
      const totalSamples = chunks.reduce((total, chunk) => total + chunk.length, 0);
      const samples = new Float32Array(totalSamples);
      let sampleOffset = 0;
      chunks.forEach((chunk) => {
        samples.set(chunk, sampleOffset);
        sampleOffset += chunk.length;
      });
      const sampleRate = microphoneContext.sampleRate;
      await microphoneContext.close();
      microphoneContext = null;
      stream.getTracks().forEach((track) => track.stop());
      stream = null;

      setPracticeRatingState("scoring");
      const { bars, eventMap } = buildPracticeRatingBars({
        snapshot: practiceLane,
        range: globalPracticeLoopRange,
        framesPerBar: FIXED_FRAMES_PER_BAR,
        fps: globalPlaybackFps,
        playbackSpeed: normalizedPlaybackSpeed,
        recordingLeadSeconds: playbackLeadSeconds,
        timingMap: globalTimingMap,
      });
      const ratingAudio = encodeMonoWav(samples, sampleRate);
      const replaySamples = trimPracticeRecordingSamples(
        samples,
        sampleRate,
        playbackLeadSeconds,
        playbackDurationSeconds
      );
      const replayAudio = encodeMonoWav(replaySamples, sampleRate);
      const body = new FormData();
      body.set("audio", ratingAudio, "practice.wav");
      body.set("sample_rate", String(sampleRate));
      body.set("bars", JSON.stringify(bars));
      const response = await fetch("/api/practice-rate", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          payload?.error || payload?.detail || "The performance could not be rated.";
        throw new Error(payload?.reason ? `${message} ${payload.reason}` : message);
      }
      const ratedReplay = normalizePracticeRatingReplay({
        laneId: practiceLaneId,
        startFrame: globalPracticeLoopRange.startFrame,
        endFrame: globalPracticeLoopRange.endFrame,
        playbackSpeed: normalizedPlaybackSpeed,
        eventMap,
        responseBars: payload?.bars,
        fps: globalPlaybackFps,
        recordingLeadSeconds: playbackLeadSeconds,
        framesPerBar: FIXED_FRAMES_PER_BAR,
        timingMap: globalTimingMap,
      });
      const replay: PracticeRatingReplay = {
        ...ratedReplay,
        audioStorageKey: ratedReplay.id,
        audioDurationSeconds: replaySamples.length / sampleRate,
      };
      practiceReplayAudioCacheRef.current.set(replay.audioStorageKey!, replayAudio);
      void storePracticeReplayAudio(replay.audioStorageKey!, replayAudio).catch(() => {
        // Keep the in-memory copy playable for this session if durable browser storage is unavailable.
      });
      const nextLaneReplays = [
        replay,
        ...practiceRatingReplays.filter((item) => item.laneId === replay.laneId),
      ].slice(0, 3);
      const nextReplays = [
        ...nextLaneReplays,
        ...practiceRatingReplays.filter((item) => item.laneId !== replay.laneId),
      ];
      const retainedReplayIds = new Set(nextReplays.map((item) => item.id));
      practiceRatingReplays.forEach((discardedReplay) => {
        if (retainedReplayIds.has(discardedReplay.id) || !discardedReplay.audioStorageKey) return;
        practiceReplayAudioCacheRef.current.delete(discardedReplay.audioStorageKey);
        void deletePracticeReplayAudio(discardedReplay.audioStorageKey).catch(() => undefined);
      });
      setPracticeRatingReplays(nextReplays);
      setSelectedPracticeRatingId(replay.id);
      setShowPracticeRating(true);
      window.localStorage.setItem(practiceRatingsStorageKey, JSON.stringify(nextReplays));
    } catch (error) {
      stopGlobalPlayback();
      const errorName =
        error && typeof error === "object" && "name" in error
          ? String((error as { name?: unknown }).name)
          : "";
      const microphonePermissionDenied =
        errorName === "NotAllowedError" ||
        errorName === "PermissionDeniedError" ||
        errorName === "SecurityError";
      setPracticeRatingError(
        microphonePermissionDenied
          ? "Permission to use the microphone has to be given before your playing can be rated. Allow Microphone in the browser's site controls, then try again."
          : error instanceof Error
          ? error.message
          : "The performance could not be rated."
      );
    } finally {
      if (microphoneContext && microphoneContext.state !== "closed") {
        await microphoneContext.close().catch(() => undefined);
      }
      stream?.getTracks().forEach((track) => track.stop());
      setPracticeRatingState("idle");
    }
  };

  const renderPracticeControls = () => (
    <section
      className="mx-auto w-full max-w-[900px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm min-[1400px]:fixed min-[1400px]:left-[max(1rem,calc(50vw-700px))] min-[1400px]:top-28 min-[1400px]:z-40 min-[1400px]:w-56 min-[1400px]:max-w-none min-[1400px]:p-3"
      aria-labelledby="practice-mode-title"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center min-[1400px]:block">
        <div className="flex min-w-36 items-center gap-2 border-b border-slate-100 pb-2 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3 min-[1400px]:border-b min-[1400px]:border-r-0 min-[1400px]:pb-2 min-[1400px]:pr-0">
          <h2 id="practice-mode-title" className="text-sm font-semibold text-slate-900">Practice</h2>
          <span className="text-xs text-slate-500">
            {barSelection?.barIndices.length
              ? `${barSelection.barIndices.length} bar${barSelection.barIndices.length === 1 ? "" : "s"}`
              : "Whole song"}
          </span>
        </div>
        <div
          className="flex flex-1 flex-wrap items-center gap-1.5 min-[1400px]:mt-3 min-[1400px]:flex-col min-[1400px]:items-stretch"
          role="group"
          aria-label="Practice controls"
        >
          {PRACTICE_RATING_UI_ENABLED && practiceRatingReplaysForLane.length > 0 && (
            <div className="order-[1] w-full rounded-lg border border-slate-200 bg-slate-50 p-2">
              <button
                type="button"
                onClick={() => setShowPracticeRating((shown) => !shown)}
                aria-pressed={showPracticeRating}
                className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-600"
              >
                <span>Show replay feedback</span>
                <span
                  className={`relative h-5 w-9 rounded-full transition ${
                    showPracticeRating ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  aria-hidden="true"
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                      showPracticeRating ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>
              <div className="mt-2 grid grid-cols-3 gap-1" aria-label="Choose a rated replay">
                {practiceRatingReplaysForLane.map((replay, index) => (
                  <button
                    key={replay.id}
                    type="button"
                    onClick={() => {
                      stopGlobalPlayback();
                      setSelectedPracticeRatingId(replay.id);
                      setShowPracticeRating(true);
                      syncGlobalPlaybackFrame(replay.startFrame, { forceReact: true });
                    }}
                    aria-pressed={selectedPracticeRatingId === replay.id}
                    className={`rounded border px-1 py-1 text-[10px] font-semibold ${
                      selectedPracticeRatingId === replay.id
                        ? "border-emerald-400 bg-white text-emerald-800"
                        : "border-slate-200 bg-slate-100 text-slate-500"
                    }`}
                  >
                    {index === 0 ? "Latest" : `Replay ${index + 1}`}
                  </button>
                ))}
              </div>
              {selectedPracticeRatingForPlayback && (
                <div
                  className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2"
                  role="group"
                  aria-label="Replay audio"
                >
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                      Replay audio
                    </p>
                    <p className="truncate text-[9px] leading-3 text-slate-400">
                      {selectedPracticeRatingForPlayback.audioStorageKey
                        ? "Plays this recording on the timeline"
                        : "Audio is unavailable for this older replay"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void downloadPracticeReplayAudio(selectedPracticeRatingForPlayback)}
                      disabled={!selectedPracticeRatingForPlayback.audioStorageKey}
                      className="flex h-8 items-center rounded-lg border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Download replay audio"
                      title="Download this microphone recording"
                    >
                      Download
                    </button>
                  <button
                    type="button"
                    onClick={toggleSelectedPracticeReplay}
                    disabled={
                      !selectedPracticeRatingForPlayback.audioStorageKey ||
                      globalPlaybackIsPreparing
                    }
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 text-[10px] font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={
                      practiceReplayPlayingId === selectedPracticeRatingForPlayback.id
                        ? "Pause replay audio"
                        : "Play replay audio"
                    }
                  >
                    <span aria-hidden="true">
                      {practiceReplayPlayingId === selectedPracticeRatingForPlayback.id ? "Ⅱ" : "▶"}
                    </span>
                    {practiceReplayPlayingId === selectedPracticeRatingForPlayback.id
                      ? "Pause"
                      : "Play"}
                  </button>
                  </div>
                </div>
              )}
              {selectedPracticeRating && (
                <div
                  className={`mt-2 rounded bg-white px-1 py-1 ${
                    selectedPracticeRating.bars.length > 15 ? "overflow-x-auto" : "overflow-hidden"
                  }`}
                  role="img"
                  aria-label={`Accuracy by bar: ${selectedPracticeRating.bars
                    .map((bar) => `Bar ${bar.barIndex + 1}, ${bar.score}%`)
                    .join("; ")}`}
                >
                  {(() => {
                    const bars = selectedPracticeRating.bars;
                    const chartWidth =
                      bars.length <= 15 ? 190 : Math.max(190, 18 + (bars.length - 1) * 16);
                    const left = 9;
                    const right = chartWidth - 9;
                    const step = bars.length > 1 ? (right - left) / (bars.length - 1) : 0;
                    const points = bars.map((bar, index) => {
                      const score = Math.max(0, Math.min(100, bar.score));
                      return {
                        ...bar,
                        score,
                        x: bars.length === 1 ? chartWidth / 2 : left + index * step,
                        y: 13 + ((100 - score) / 100) * 45,
                      };
                    });
                    return (
                      <svg
                        viewBox={`0 0 ${chartWidth} 76`}
                        className="block h-[76px] max-w-none"
                        style={{ width: bars.length <= 15 ? "100%" : `${chartWidth}px` }}
                        aria-hidden="true"
                      >
                        {[13, 35.5, 58].map((y) => (
                          <line
                            key={`accuracy-grid-${y}`}
                            x1={left}
                            x2={right}
                            y1={y}
                            y2={y}
                            stroke="#e2e8f0"
                            strokeWidth="0.7"
                          />
                        ))}
                        <polyline
                          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                          fill="none"
                          stroke="#0f766e"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        {points.map((point) => {
                          const fill =
                            point.score >= 85
                              ? "#10b981"
                              : point.score >= 60
                              ? "#f59e0b"
                              : "#f43f5e";
                          return (
                            <g key={`${selectedPracticeRating.id}-bar-${point.barIndex}`}>
                              <title>{`Bar ${point.barIndex + 1}: ${point.score}% accuracy`}</title>
                              <circle cx={point.x} cy={point.y} r="2.4" fill={fill} stroke="white" strokeWidth="0.8" />
                              <text
                                x={point.x}
                                y={Math.max(7, point.y - 4)}
                                textAnchor="middle"
                                fontSize="5.5"
                                fontWeight="700"
                                fill="#334155"
                              >
                                {point.score}%
                              </text>
                              <text
                                x={point.x}
                                y="70"
                                textAnchor="middle"
                                fontSize="5.5"
                                fontWeight="600"
                                fill="#64748b"
                              >
                                B{point.barIndex + 1}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
          <label className="flex h-9 items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700">
            <span>Speed</span>
            <select
              value={normalizedPlaybackSpeed}
              onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
              disabled={speedTrainerSessionActive}
              className="bg-transparent text-xs font-semibold text-slate-900 outline-none disabled:cursor-not-allowed"
              aria-label="Practice playback speed"
            >
              {!PLAYBACK_SPEED_OPTIONS.some((speed) => speed === normalizedPlaybackSpeed) && (
                <option value={normalizedPlaybackSpeed}>
                  {Math.round(normalizedPlaybackSpeed * 100)}%
                </option>
              )}
              {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                <option key={speed} value={speed}>{Math.round(speed * 100)}%</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setPracticeLoopEnabled((enabled) => !enabled)}
            disabled={!globalPracticeLoopRange}
            aria-pressed={practiceLoopEnabled}
            className={`h-9 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
              practiceLoopEnabled
                ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
            }`}
          >
            Loop {practiceLoopEnabled ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => setMetronomeEnabled((enabled) => !enabled)}
            aria-pressed={metronomeEnabled}
            className={`h-9 rounded-lg border px-2.5 text-xs font-semibold transition ${
              metronomeEnabled
                ? "border-sky-300 bg-sky-100 text-sky-900"
                : "border-slate-200 bg-white text-slate-700 hover:border-sky-300"
            }`}
          >
            Metronome {metronomeEnabled ? "on" : "off"}
          </button>
          <button
            type="button"
            disabled={!barSelection?.barIndices.length}
            onClick={() => {
              setPracticeFocusEnabled((enabled) => {
                const next = !enabled;
                if (next) setPracticeLoopEnabled(true);
                return next;
              });
            }}
            aria-pressed={practiceFocusEnabled}
            className={`h-9 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
              practiceFocusEnabled
                ? "border-violet-300 bg-violet-100 text-violet-900"
                : "border-slate-200 bg-white text-slate-700 hover:border-violet-300"
            }`}
          >
            Focus {practiceFocusEnabled ? "on" : "selection"}
          </button>
          {practiceViewedLaneIsChord && (
            <button
              type="button"
              onClick={() => setPracticeChordFingeringsVisible((visible) => !visible)}
              aria-pressed={practiceChordFingeringsVisible}
              className={`h-9 rounded-lg border px-2.5 text-xs font-semibold transition ${
                practiceChordFingeringsVisible
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              Fingerings {practiceChordFingeringsVisible ? "on" : "off"}
            </button>
          )}
          {practiceSoundLaneId && (
            <details className="group relative">
              <summary className="flex h-9 cursor-pointer list-none items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Sound
                <span className="truncate text-[10px] font-medium text-slate-500">
                  {trackInstrumentOptions.find((option) => option.id === practiceInstrumentValue)?.label || "Guitar"}
                </span>
              </summary>
              <div className="absolute right-0 top-11 z-50 w-64 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xl min-[1400px]:static min-[1400px]:mt-2 min-[1400px]:w-full min-[1400px]:shadow-sm">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Instrument
                  <select
                    value={practiceInstrumentValue}
                    onChange={(event) =>
                      handleLaneInstrumentChange(practiceSoundLaneId, event.target.value)
                    }
                    className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                    aria-label="Practice instrument"
                  >
                    {trackInstrumentOptions.map((option) => (
                      <option key={`practice-instrument-${option.id}`} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleTrackMute(practiceSoundLaneId)}
                    aria-pressed={Boolean(trackMuteById[practiceSoundLaneId])}
                    className={`h-9 rounded-lg border text-xs font-semibold ${
                      trackMuteById[practiceSoundLaneId]
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    {trackMuteById[practiceSoundLaneId] ? "Muted" : "Mute"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleTrackIsolation(practiceSoundLaneId)}
                    aria-pressed={isolatedTrackId === practiceSoundLaneId}
                    className={`h-9 rounded-lg border text-xs font-semibold ${
                      isolatedTrackId === practiceSoundLaneId
                        ? "border-sky-300 bg-sky-50 text-sky-800"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    {isolatedTrackId === practiceSoundLaneId ? "Soloed" : "Solo"}
                  </button>
                </div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Volume
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={normalizeTrackVolume(trackVolumeById[practiceSoundLaneId] ?? 1)}
                    onChange={(event) =>
                      handleTrackVolumePreview(practiceSoundLaneId, Number(event.target.value))
                    }
                    onPointerUp={() => commitTrackVolume(practiceSoundLaneId)}
                    onPointerCancel={() => commitTrackVolume(practiceSoundLaneId)}
                    onBlur={() => commitTrackVolume(practiceSoundLaneId)}
                    className="mt-1.5 w-full accent-slate-700"
                    aria-label="Practice track volume"
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Pan
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={normalizeTrackPan(trackPanById[practiceSoundLaneId] ?? 0)}
                    onChange={(event) =>
                      handleTrackPanChange(practiceSoundLaneId, Number(event.target.value))
                    }
                    className="mt-1.5 w-full accent-slate-700"
                  />
                </label>
              </div>
            </details>
          )}
          <details className="group relative">
            <summary className="flex h-9 cursor-pointer list-none items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              More
              {(countInEnabled || speedTrainerEnabled) && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="Additional practice settings active" />
              )}
              <span className="text-[10px] text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="absolute right-0 top-11 z-50 w-64 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xl min-[1400px]:static min-[1400px]:mt-2 min-[1400px]:w-full min-[1400px]:shadow-sm">
              <button
                type="button"
                onClick={() => setCountInEnabled((enabled) => !enabled)}
                aria-pressed={countInEnabled}
                className={`flex h-9 w-full items-center justify-between rounded-lg border px-3 text-xs font-semibold transition ${
                  countInEnabled
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>Count-in</span>
                <span>{countInEnabled ? "On" : "Off"}</span>
              </button>
              {countInEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Length
                    <select
                      value={countInBars}
                      onChange={(event) => setCountInBars(Number(event.target.value))}
                      className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs normal-case text-slate-700"
                      aria-label="Count-in bars"
                    >
                      {[1, 2, 3].map((bars) => <option key={bars} value={bars}>{bars} bar{bars === 1 ? "" : "s"}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCountInEveryLoop((enabled) => !enabled)}
                    aria-pressed={countInEveryLoop}
                    className={`mt-4 h-8 rounded-lg border px-2 text-[10px] font-semibold ${
                      countInEveryLoop ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"
                    }`}
                  >
                    Every loop {countInEveryLoop ? "on" : "off"}
                  </button>
                </div>
              )}
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Metronome volume
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={metronomeVolume}
                  onChange={(event) => setMetronomeVolume(Number(event.target.value))}
                  className="mt-1 w-full accent-sky-600"
                />
              </label>
              <button
                type="button"
                onClick={async () => {
                  if (document.fullscreenElement) await document.exitFullscreen();
                  else await practiceRootRef.current?.requestFullscreen();
                }}
                className="flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <span>Fullscreen</span>
                <span>{practiceFullscreen ? "Exit" : "Open"}</span>
              </button>
              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={toggleSpeedTrainer}
                  aria-pressed={speedTrainerEnabled}
                  className={`flex h-9 w-full items-center justify-between rounded-lg border px-3 text-xs font-semibold transition ${
                    speedTrainerEnabled
                      ? "border-violet-300 bg-violet-50 text-violet-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>Speed trainer</span>
                  <span>{speedTrainerSessionActive ? "Running" : speedTrainerEnabled ? "On" : "Off"}</span>
                </button>
              </div>
              {speedTrainerEnabled && (
                <div className="grid grid-cols-1 gap-1.5">
                  <label className="flex h-8 w-full items-center justify-between rounded-lg border border-violet-200 bg-white px-2 text-[11px] font-semibold text-violet-900">
                    <span>Start</span>
                    <select
                      value={speedTrainerStart}
                      onChange={(event) => setSpeedTrainerStart(Number(event.target.value))}
                      disabled={speedTrainerSessionActive}
                      className="min-w-0 bg-transparent text-right text-[11px] font-semibold outline-none disabled:cursor-not-allowed"
                      aria-label="Speed trainer start"
                    >
                      {SPEED_TRAINER_START_OPTIONS.filter(
                        (speed) => speed <= speedTrainerTarget
                      ).map((speed) => (
                        <option key={speed} value={speed}>{Math.round(speed * 100)}%</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex h-8 w-full items-center justify-between rounded-lg border border-violet-200 bg-white px-2 text-[11px] font-semibold text-violet-900">
                    <span>Target</span>
                    <select
                      value={speedTrainerTarget}
                      onChange={(event) => {
                        const target = Number(event.target.value);
                        setSpeedTrainerTarget(target);
                        setSpeedTrainerStart((start) => Math.min(start, target));
                      }}
                      disabled={speedTrainerSessionActive}
                      className="min-w-0 bg-transparent text-right text-[11px] font-semibold outline-none disabled:cursor-not-allowed"
                      aria-label="Speed trainer target"
                    >
                      {SPEED_TRAINER_TARGET_OPTIONS.map((speed) => (
                        <option key={speed} value={speed}>{Math.round(speed * 100)}%</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex h-8 w-full items-center justify-between rounded-lg border border-violet-200 bg-white px-2 text-[11px] font-semibold text-violet-900">
                    <span>Step</span>
                    <select
                      value={speedTrainerStep}
                      onChange={(event) => setSpeedTrainerStep(Number(event.target.value))}
                      disabled={speedTrainerSessionActive}
                      className="min-w-0 bg-transparent text-right text-[11px] font-semibold outline-none disabled:cursor-not-allowed"
                      aria-label="Speed trainer increase"
                    >
                      {SPEED_TRAINER_STEP_OPTIONS.map((step) => (
                        <option key={step} value={step}>+{Math.round(step * 100)}%</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          </details>
          {PRACTICE_RATING_UI_ENABLED && practiceRatingError && (
            <p className="order-[2] w-full rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-700" role="alert">
              {practiceRatingError}
            </p>
          )}
          {PRACTICE_RATING_UI_ENABLED && (
            <>
          <button
            type="button"
            onClick={() => void startPracticeRating()}
            disabled={practiceRatingBusy || !practiceLaneId}
            className="order-[3] h-9 rounded-lg border border-emerald-400 bg-emerald-600 px-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {practiceRatingState === "countdown"
              ? `Starting in ${practiceRatingCountdown}`
              : practiceRatingState === "permission"
              ? "Allow microphone…"
              : practiceRatingState === "recording"
              ? "Listening…"
              : practiceRatingState === "scoring"
              ? "Rating…"
              : "Play & rate"}
          </button>
          <p className="order-[4] px-1 text-[9px] leading-3 text-slate-400">
            Rating playback is silent so the microphone records only your instrument.
          </p>
            </>
          )}
        </div>
      </div>
    </section>
  );

  const renderPracticeHelp = () => (
    <aside className="mx-auto w-full max-w-[900px] rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-4 text-slate-500 shadow-sm min-[1400px]:fixed min-[1400px]:right-[max(1rem,calc(50vw-700px))] min-[1400px]:top-28 min-[1400px]:z-40 min-[1400px]:w-56 min-[1400px]:max-w-none">
      <h2 className="text-xs font-semibold text-slate-800">Practice shortcuts</h2>
      <div className="mt-2 space-y-1">
        <p><span className="font-semibold text-slate-700">Space</span> Play or pause</p>
        <p><span className="font-semibold text-slate-700">← / →</span> Previous or next bar</p>
        <p><span className="font-semibold text-slate-700">L</span> Toggle loop</p>
        <p><span className="font-semibold text-slate-700">M</span> Toggle metronome</p>
        <p><span className="font-semibold text-slate-700">[ / ]</span> Change speed</p>
      </div>
      <p className="mt-3 border-t border-slate-100 pt-3">
        {barSelection?.barIndices.length
          ? `${barSelection.barIndices.length} bar${barSelection.barIndices.length === 1 ? "" : "s"} selected for playback.`
          : "Select one or more bars for playback. Shift-click another bar to select everything in between."}
      </p>
      <p className="mt-2">Bluetooth pedals that send arrow or Page keys work automatically.</p>
    </aside>
  );

  const bootstrapEditorPath = `${
    isGuestMode ? "/api/gte-guest" : "/api/gte"
  }/editors/${encodeURIComponent(editorId)}`;
  const bootstrapEditorScript = `(()=>{const editorId=${serializeForInlineScript(
    editorId
  )};if(window.__note2tabsEditorBootstrap?.editorId===editorId)return;window.__note2tabsEditorBootstrap={editorId,promise:fetch(${serializeForInlineScript(
    bootstrapEditorPath
  )},{credentials:"same-origin"}).then(async response=>({ok:response.ok,status:response.status,text:await response.text()})).catch(error=>({ok:false,status:0,text:error instanceof Error?error.message:"Request failed"}))};})();`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: bootstrapEditorScript }} />
      <NoIndexHead title="Guitar Tab Editor Workspace | Note2Tabs" canonicalPath={`/gte/${editorId}`} />
      <main
        ref={practiceRootRef}
        className={`page page-tight ${
          isMobileEditMode ? "h-[100dvh] overflow-hidden overscroll-none py-3" : ""
        } ${practiceFullscreen ? "gte-practice-fullscreen overflow-y-auto" : ""}`}
  style={
    !isMobileEditMode
      ? { paddingTop: isMobileViewport ? 76 : 12 }
      : undefined
        }
        onMouseDownCapture={handleMainMouseDownCapture}
      >
      {PRACTICE_RATING_UI_ENABLED && practiceRatingState === "countdown" && (
        <div
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
          role="status"
          aria-live="assertive"
        >
          <span className="text-7xl font-black text-slate-950 drop-shadow-[0_2px_2px_rgba(255,255,255,0.95)]">
            {practiceRatingCountdown}
          </span>
        </div>
      )}
      <div
        className={`container gte-wide ${
          isMobileEditMode
            ? "flex h-full min-h-0 flex-col gap-3 overflow-hidden overscroll-none pb-0"
            : `stack ${isMobileCanvasMode ? "pb-24" : "pb-28"}`
        }`}
      >
        {isMobileCanvasMode && (
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
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
                            <GteFileImportButton
                              editorId={editorId}
                              onImported={async () => {
                                await loadEditor();
                              }}
                              onError={(message) => setError(message || null)}
                              className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700"
                              busyLabel="Importing..."
                              title="Import a tab file"
                            >
                              Import tabs
                            </GteFileImportButton>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setExportMenuOpen((prev) => !prev)}
                          className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                          disabled={exportingTrack || !canvas?.editors.length}
                          aria-expanded={exportMenuOpen}
                        >
                          <span>{exportingTrack ? "Exporting..." : "Export"}</span>
                          <span className="text-slate-400" aria-hidden="true">⌄</span>
                        </button>
                        {exportMenuOpen && (
                          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                            {GTE_EXPORT_FORMAT_OPTIONS.map((option) => (
                              <button
                                key={`mobile-export-${option.value}`}
                                type="button"
                                onClick={() => handleExportTrack(option.value)}
                                className="rounded-lg bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm hover:bg-slate-50"
                                disabled={exportingTrack}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => void commitCanvasToBackend({ force: true })}
                          className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                          disabled={savingCanvas || isGuestMode}
                        >
                          {savingCanvas ? "Saving..." : "Save"}
                        </button>
                      </div>
                      <div className="mt-3 text-xs text-slate-600" role="status" aria-live="polite">
                        {saveStatus}
                      </div>
                      {isGuestMode && (
                        <div className="mt-2 text-xs text-slate-600">
                          This draft stays in this browser until you save it to your account.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {renderMobileHistoryControls()}
              </div>
              {renderViewModeSwitch(true)}
            </div>
            <div className={practiceModeEnabled ? "hidden" : "rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"}>
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
                      Key
                      <select
                        value={normalizeKeyBase(canvas?.keyBase)}
                        onChange={(event) => {
                          commitCanvasKey(
                            Number(event.target.value),
                            normalizeKeyType(canvas?.keyType)
                          );
                          event.currentTarget.blur();
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700"
                        aria-label="Key root"
                      >
                        {KEY_BASE_OPTIONS.map((label, index) => (
                          <option key={label} value={index}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Scale
                      <select
                        value={normalizeKeyType(canvas?.keyType)}
                        onChange={(event) => {
                          commitCanvasKey(
                            normalizeKeyBase(canvas?.keyBase),
                            Number(event.target.value)
                          );
                          event.currentTarget.blur();
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700"
                        aria-label="Key scale"
                      >
                        {KEY_TYPE_OPTIONS.map((label, index) => (
                          <option key={label} value={index}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
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
                            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                              event.preventDefault();
                              event.currentTarget.blur();
                              return;
                            }
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            event.currentTarget.blur();
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
                            className="flex h-6 w-8 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-600"
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
                            className="flex h-6 w-8 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-600"
                            aria-label="Decrease BPM"
                          >
                            &#9660;
                          </button>
                        </span>
                      </span>
                    </label>
                    <label className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Time signature
                      <span className="mt-2 flex items-center gap-2">
                        <select
                          value={normalizeTimeSignature(timeSignatureDraft) ?? 8}
                          onChange={(event) => {
                            setTimeSignatureDraft(event.target.value);
                            scheduleTimeSignatureCommit(Number(event.target.value));
                            event.currentTarget.blur();
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                          aria-label="Time signature top number"
                        >
                          {TIME_SIGNATURE_TOP_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <span className="text-slate-400">/</span>
                        <select
                          value={normalizeTimeSignatureBottom(timeSignatureBottomDraft) ?? 4}
                          onChange={(event) => {
                            void commitTimeSignatureBottom(Number(event.target.value));
                            event.currentTarget.blur();
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                          aria-label="Time signature bottom number"
                        >
                          {TIME_SIGNATURE_BOTTOM_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </span>
                    </label>
                  </div>
                  <details className="rounded-xl border border-slate-200 bg-slate-50">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-700">
                      Editing behavior
                      <span className="text-xs font-normal text-slate-500">
                        Notes, cursor & snapping
                      </span>
                    </summary>
                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-2">
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Add note size
                        <select
                          value={chordOnlyDefaultNoteLengthDenominator}
                          onKeyDown={blockSizeSelectKeyboardChange}
                          onChange={(event) =>
                            setChordOnlyDefaultNoteLengthDenominator(Number(event.target.value))
                          }
                          className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        >
                          {NOTE_LENGTH_FRACTION_DENOMINATORS.map((denominator) => (
                            <option key={`mobile-note-size-${denominator}`} value={denominator}>
                              {formatNoteLengthOption(denominator)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Cursor size
                        <select
                          value={chordOnlyCursorSizeDenominator}
                          onKeyDown={blockSizeSelectKeyboardChange}
                          onChange={(event) =>
                            setChordOnlyCursorSizeDenominator(
                              getNearestCursorSizeDenominator(event.target.value)
                            )
                          }
                          className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        >
                          {CURSOR_SIZE_FRACTION_DENOMINATORS.map((denominator) => (
                            <option key={`mobile-cursor-size-${denominator}`} value={denominator}>
                              1/{denominator}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setGlobalSnapToGridEnabled((enabled) => !enabled)}
                        aria-pressed={globalSnapToGridEnabled}
                        className="flex min-h-11 items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-700"
                      >
                        <span>Snap to grid</span>
                        <span className="text-xs text-slate-500">{globalSnapToGridEnabled ? "On" : "Off"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGlobalSnapToKeyEnabled((enabled) => !enabled)}
                        aria-pressed={globalSnapToKeyEnabled}
                        className="flex min-h-11 items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-700"
                      >
                        <span>Snap to key</span>
                        <span className="text-xs text-slate-500">{globalSnapToKeyEnabled ? "On" : "Off"}</span>
                      </button>
                    </div>
                  </details>
                  <details className="rounded-xl border border-slate-200 bg-slate-50">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-700">
                      Display
                      <span className="text-xs font-normal text-slate-500">
                        Timeline labels & counter
                      </span>
                    </summary>
                    <div className="grid gap-1 border-t border-slate-200 p-2">
                      {([
                        ["showBarNumbers", "Bar numbers"],
                        ["showTimeRuler", "Time ruler"],
                        ["showPlaybackCounter", "Playback counter"],
                      ] as const).map(([key, label]) => (
                        <button
                          key={`mobile-display-${key}`}
                          type="button"
                          onClick={() => updateDisplayPreference(key, !displayPreferences[key])}
                          aria-pressed={displayPreferences[key]}
                          className="flex min-h-11 items-center justify-between rounded-lg bg-white px-3 text-left text-sm text-slate-700"
                        >
                          <span>{label}</span>
                          <span className="text-xs text-slate-500">
                            {displayPreferences[key] ? "On" : "Off"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </details>
                  <div className="flex min-h-[1.25rem] flex-wrap items-center gap-3 text-xs">
                    <span className="text-slate-600" role="status" aria-live="polite">{saveStatus}</span>
                    {(nameSaving || bpmSaving) && !isGuestMode && <span className="muted">Saving draft...</span>}
                    {(nameError || bpmError) && <span className="error">{nameError || bpmError}</span>}
                    {(timeSignatureSaving || timeSignatureError) && (
                      <span className={timeSignatureError ? "error" : "muted"}>
                        {timeSignatureError || "Saving time signature..."}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {isMobileEditMode && (
          <div
            className="flex shrink-0 items-center gap-2 overflow-x-auto pb-1"
            role="toolbar"
            aria-label="Editor controls"
          >
            <button
              type="button"
              onClick={exitMobileEditMode}
              className="h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm"
            >
              Back
            </button>
            {renderMobileHistoryControls()}
            <div className="shrink-0">{renderViewModeSwitch(true)}</div>
            <details className="relative shrink-0">
              <summary className="flex h-11 cursor-pointer list-none items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm">
                Tools
              </summary>
              <div className="absolute left-0 top-[calc(100%+4px)] z-[10000] min-w-60 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => setFindKeyDialogOpen(true)}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  Detect song key
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGeneratePlayingCoordinatesRequest((request) => request + 1)
                  }
                  disabled={!activeLaneId}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Generate playing coordinates
                </button>
              </div>
            </details>
            <details className="relative shrink-0">
              <summary className="flex h-11 cursor-pointer list-none items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm">
                Edit settings
              </summary>
              <div className="absolute right-0 top-[calc(100%+4px)] z-[10000] w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                <label className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm text-slate-700">
                  <span>Add note size</span>
                  <select
                    value={chordOnlyDefaultNoteLengthDenominator}
                    onKeyDown={blockSizeSelectKeyboardChange}
                    onChange={(event) =>
                      setChordOnlyDefaultNoteLengthDenominator(Number(event.target.value))
                    }
                    className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold"
                    aria-label="Add note size"
                  >
                    {NOTE_LENGTH_FRACTION_DENOMINATORS.map((denominator) => (
                      <option key={denominator} value={denominator}>
                        {formatNoteLengthOption(denominator)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm text-slate-700">
                  <span>Cursor size</span>
                  <select
                    value={chordOnlyCursorSizeDenominator}
                    onKeyDown={blockSizeSelectKeyboardChange}
                    onChange={(event) =>
                      setChordOnlyCursorSizeDenominator(
                        getNearestCursorSizeDenominator(event.target.value)
                      )
                    }
                    className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold"
                    aria-label="Cursor size"
                  >
                    {CURSOR_SIZE_FRACTION_DENOMINATORS.map((denominator) => (
                      <option key={denominator} value={denominator}>
                        1/{denominator}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setGlobalSnapToGridEnabled((enabled) => !enabled)}
                  aria-pressed={globalSnapToGridEnabled}
                  className="flex min-h-11 w-full items-center justify-between rounded-md px-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  <span>Snap to grid</span>
                  <span className="text-xs">{globalSnapToGridEnabled ? "On" : "Off"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalSnapToKeyEnabled((enabled) => !enabled)}
                  aria-pressed={globalSnapToKeyEnabled}
                  className="flex min-h-11 w-full items-center justify-between rounded-md px-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  <span>Snap to key</span>
                  <span className="text-xs">{globalSnapToKeyEnabled ? "On" : "Off"}</span>
                </button>
              </div>
            </details>
            <details className="relative shrink-0">
              <summary className="flex h-11 cursor-pointer list-none items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm">
                View · {timelineZoomPercent}%
              </summary>
              <div className="absolute right-0 top-[calc(100%+4px)] z-[10000] grid w-64 gap-1 rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-xl">
                {([
                  ["showBarNumbers", "Bar numbers"],
                  ["showTimeRuler", "Time ruler"],
                  ["showPlaybackCounter", "Playback counter"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateDisplayPreference(key, !displayPreferences[key])}
                    aria-pressed={displayPreferences[key]}
                    className="flex min-h-10 items-center justify-between rounded-md px-2 text-left hover:bg-slate-100"
                  >
                    <span>{label}</span>
                    <span className="text-xs">{displayPreferences[key] ? "On" : "Off"}</span>
                  </button>
                ))}
                <label className="mt-1 grid gap-2 border-t border-slate-100 px-2 pt-2">
                  <span className="flex justify-between">
                    <span>Timeline zoom</span>
                    <span>{timelineZoomPercent}%</span>
                  </span>
                  <input
                    type="range"
                    min={TIMELINE_ZOOM_MIN}
                    max={TIMELINE_ZOOM_MAX}
                    step={1}
                    value={timelineZoomPercent}
                    onChange={(event) => setTimelineZoomPercent(Number(event.target.value))}
                    aria-label="Timeline zoom"
                  />
                </label>
              </div>
            </details>
          </div>
        )}
        {!isMobileViewport && (
        <div
          className="page-header gte-editor-sticky-banner"
          style={
            isMobileViewport
              ? { position: "relative", paddingRight: 152 }
              : { alignItems: "flex-start" }
          }
        >
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div
              className="page-title"
              style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}
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
                      paddingLeft: isMobileViewport ? 0 : 4,
                      fontSize: isMobileViewport ? "1.35rem" : "1.45rem",
                      lineHeight: 1.15,
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
              <div className="mt-1 space-y-1">
                <div
                  data-gte-floating-ui="true"
                  className={`gte-top-menu-bar relative flex flex-wrap items-center gap-0.5 border-y border-slate-200 py-0.5 ${
                    practiceModeEnabled ? "[&>details]:hidden" : ""
                  }`}
                >
                  <details
                    className="group relative order-1"
                    open={openTopMenu === "file"}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenTopMenu((current) => (isOpen ? "file" : current === "file" ? null : current));
                    }}
                    onMouseLeave={() => setOpenTopMenu(null)}
                  >
                    <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                      File
                    </summary>
                    <div className="absolute left-0 top-full z-[10000] min-w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                      {!isGuestMode && (
                        <button
                          type="button"
                          onClick={() => void commitCanvasToBackend({ force: true })}
                          className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
                          title="Save editor now"
                          disabled={savingCanvas}
                        >
                          {savingCanvas ? "Saving..." : "Save"}
                        </button>
                      )}
                      {!isGuestMode && (
                        <GteFileImportButton
                          editorId={editorId}
                          onImported={async () => {
                            await loadEditor();
                          }}
                          onError={(message) => setError(message || null)}
                          className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                          busyLabel="Importing..."
                          title="Import a tab file"
                        >
                          Import tabs
                        </GteFileImportButton>
                      )}
                      <details className="group/export relative">
                        <summary
                          className={`flex list-none items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-slate-100 ${
                            exportingTrack || !canvas?.editors.length
                              ? "pointer-events-none text-slate-400"
                              : "cursor-pointer text-slate-700"
                          }`}
                        >
                          <span>{exportingTrack ? "Exporting..." : "Export"}</span>
                          <span aria-hidden="true">›</span>
                        </summary>
                        <div className="absolute left-full top-0 z-[10001] min-w-44 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                          {GTE_EXPORT_FORMAT_OPTIONS.map((option) => (
                            <button
                              key={`top-export-${option.value}`}
                              type="button"
                              onClick={() => handleExportTrack(option.value)}
                              className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                              disabled={exportingTrack}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </details>
                    </div>
                  </details>

                  <details
                    className="group relative order-2"
                    open={openTopMenu === "edit"}
                    onMouseEnter={cancelEditMenuClose}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenTopMenu((current) =>
                        isOpen ? "edit" : current === "edit" ? null : current
                      );
                    }}
                    onMouseLeave={scheduleEditMenuClose}
                  >
                    <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                      Tools
                    </summary>
                    <div className="absolute left-0 top-full z-[10000] max-h-[calc(100vh-10rem)] w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                      <div ref={setEditMenuPortalTarget}>
                        {!editMenuOwnerLaneId && (
                          <div className="opacity-50">
                            {[
                              {
                                title: "Notes & chords",
                                items: [
                                  ["Merge to Chord", "C"],
                                  ["Disband Chord", "Shift+L"],
                                  ["Optimize Notes", "O"],
                                  ["Snap to Key", ""],
                                  ["Quantize", ""],
                                  ["Merge Notes", "J"],
                                  ["Length scaling", "D"],
                                  ["Scale", "S"],
                                  ["Slicing Tool", "Shift+S"],
                                  ["Move", "M"],
                                ],
                              },
                              {
                                title: "Effects",
                                items: [
                                  ["Hammer/Pull", "H"],
                                  ["Slide", "L"],
                                  ["Bend", "B"],
                                ],
                              },
                              {
                                title: "Playing Coordinates",
                                items: [
                                  ["Clean Playing-Coordinates", ""],
                                  ["Cut", "K"],
                                  ["Merge", ""],
                                  ["Generate Playing-Coordinates", ""],
                                ],
                              },
                            ].map((section) => (
                              <div
                                key={`disabled-edit-${section.title}`}
                                className="border-b border-slate-200 py-1 last:border-b-0"
                              >
                                <div className="px-2 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                  {section.title}
                                </div>
                                {section.items.map(([label, shortcut]) => (
                                  <div
                                    key={`disabled-edit-${section.title}-${label}`}
                                    className="flex h-7 items-center gap-2 rounded-md px-2 text-[11px] text-slate-400"
                                  >
                                    <span>{label}</span>
                                    {shortcut && (
                                      <span className="ml-auto text-[10px] opacity-60">{shortcut}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 border-t border-slate-200 pt-1">
                        <button
                          type="button"
                          onClick={openTimingEditor}
                          disabled={!canvas?.editors.length}
                          className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                          title="Edit BPM for selected bars or the full song"
                        >
                          Bar tempo…
                        </button>
                        <button
                          type="button"
                          onClick={openTrackMerge}
                          disabled={isGuestMode || (canvas?.editors.length || 0) < 2}
                          className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                          title={isGuestMode ? "Save this draft before merging tracks" : "Combine notes and chords into a new optimized track"}
                        >
                          Merge tracks…
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGeneratePlayingCoordinatesRequest((request) => request + 1);
                            setOpenTopMenu(null);
                          }}
                          disabled={!activeLaneId}
                          className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                          title={activeLaneId ? "Generate playing coordinates for the active track" : "Select a track first"}
                        >
                          Generate playing coordinates
                        </button>
                      </div>
                    </div>
                  </details>

                  <details
                    className="group relative order-6"
                    open={openTopMenu === "help"}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenTopMenu((current) =>
                        isOpen ? "help" : current === "help" ? null : current
                      );
                    }}
                    onMouseLeave={() => setOpenTopMenu(null)}
                  >
                    <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                      Help
                    </summary>
                    <div className="absolute left-0 top-full z-[10000] max-h-[calc(100vh-10rem)] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                      <div className="px-2 pb-1.5 pt-1 text-xs font-semibold text-slate-700">
                        Keyboard shortcut help
                      </div>
                      {SHORTCUT_HELP_SECTIONS.map(([title, shortcuts]) => (
                        <section
                          key={`shortcut-help-${title}`}
                          className="border-t border-slate-200 py-1"
                        >
                          <h3 className="px-2 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            {title}
                          </h3>
                          {shortcuts.map(([label, shortcut]) => (
                            <div
                              key={`shortcut-help-${title}-${label}`}
                              className="flex min-h-7 items-center gap-3 rounded-md px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                            >
                              <span>{label}</span>
                              <span className="ml-auto shrink-0 text-[10px] text-slate-500">
                                {shortcut}
                              </span>
                            </div>
                          ))}
                        </section>
                      ))}
                    </div>
                  </details>

                  <details
                    className="group relative order-3"
                    open={openTopMenu === "view"}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenTopMenu((current) =>
                        isOpen ? "view" : current === "view" ? null : current
                      );
                    }}
                    onMouseLeave={() => setOpenTopMenu(null)}
                  >
                    <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                      View
                    </summary>
                    <div className="absolute left-0 top-full z-[10000] w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={() => setLeftHandedChordDiagrams((leftHanded) => !leftHanded)}
                        aria-pressed={leftHandedChordDiagrams}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        title="Mirror chord diagrams for left- or right-handed playing"
                      >
                        <span>Chord diagrams</span>
                        <span className="text-xs">
                          {leftHandedChordDiagrams ? "Left-handed" : "Right-handed"}
                        </span>
                      </button>
                      {([
                        ["showBarNumbers", "Bar numbers"],
                        ["showTimeRuler", "Time ruler"],
                        ["showPlaybackCounter", "Playback counter"],
                      ] as const).map(([key, label]) => (
                        <button
                          key={`view-${key}`}
                          type="button"
                          onClick={() => updateDisplayPreference(key, !displayPreferences[key])}
                          aria-pressed={displayPreferences[key]}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <span>{label}</span>
                          <span className="text-xs">{displayPreferences[key] ? "On" : "Off"}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => void router.push(`/gte/${editorId}/tabs`)}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        title="Open the current project as readable ASCII tabs"
                      >
                        <span>Readable tab preview</span>
                        <span aria-hidden="true">↗</span>
                      </button>
                      <label className="mt-1 grid gap-1 border-t border-slate-100 px-3 py-2 text-sm text-slate-700">
                        <span className="flex items-center justify-between">
                          <span>Time scale</span>
                          <span className="text-xs text-slate-500">{timelineZoomPercent}%</span>
                        </span>
                        <input
                          type="range"
                          min={TIMELINE_ZOOM_MIN}
                          max={TIMELINE_ZOOM_MAX}
                          step={1}
                          value={timelineZoomPercent}
                          onChange={(event) =>
                            setTimelineZoomPercent(
                              Math.max(
                                TIMELINE_ZOOM_MIN,
                                Math.min(TIMELINE_ZOOM_MAX, Number(event.target.value))
                              )
                            )
                          }
                          aria-label="Time scale"
                        />
                      </label>
                    </div>
                  </details>

                  <div className="order-7 ml-auto mr-2 shrink-0 xl:absolute xl:left-1/2 xl:top-1/2 xl:z-10 xl:m-0 xl:-translate-x-1/2 xl:-translate-y-1/2">
                    {renderViewModeSwitch()}
                  </div>

                  <details
                    className="hidden"
                    open={openTopMenu === "cursor"}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenTopMenu((current) =>
                        isOpen ? "cursor" : current === "cursor" ? null : current
                      );
                    }}
                    onMouseLeave={() => setOpenTopMenu(null)}
                  >
                    <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                      Cursor
                    </summary>
                    <div className="absolute left-0 top-full z-[10000] w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                      <label className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-slate-700">
                        <span>Add note size</span>
                        <select
                          value={chordOnlyDefaultNoteLengthDenominator}
                          onKeyDown={blockSizeSelectKeyboardChange}
                          onChange={(event) =>
                            setChordOnlyDefaultNoteLengthDenominator(Number(event.target.value))
                          }
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                          title="Add note size"
                          aria-label="Add note size"
                        >
                          {NOTE_LENGTH_FRACTION_DENOMINATORS.map((denominator) => (
                            <option key={denominator} value={denominator}>
                              {formatNoteLengthOption(denominator)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-slate-700">
                        <span>Cursor size</span>
                        <select
                          value={chordOnlyCursorSizeDenominator}
                          onKeyDown={blockSizeSelectKeyboardChange}
                          onChange={(event) =>
                            setChordOnlyCursorSizeDenominator(
                              getNearestCursorSizeDenominator(event.target.value)
                            )
                          }
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                          title="Cursor size"
                          aria-label="Cursor size"
                        >
                          {CURSOR_SIZE_FRACTION_DENOMINATORS.map((denominator) => (
                            <option key={denominator} value={denominator}>
                              1/{denominator}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </details>

                  <details
                    className="hidden"
                    open={openTopMenu === "generate"}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenTopMenu((current) =>
                        isOpen ? "generate" : current === "generate" ? null : current
                      );
                    }}
                    onMouseLeave={() => setOpenTopMenu(null)}
                  >
                    <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                      Generate
                    </summary>
                    <div className="absolute left-0 top-full z-[10000] min-w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                      {!isGuestMode && (
                        <button
                          type="button"
                          onClick={() => void router.push(transcriberHref)}
                          className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                          title="Open the standalone transcriber"
                        >
                          Generate tabs
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void router.push(`/gte/${editorId}/tabs`)}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        title="View current editor as ASCII tabs"
                      >
                        View as tabs
                      </button>
                      <button
                        type="button"
                        onClick={() => setFindKeyDialogOpen(true)}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        title="Detect the key from all notes and chords"
                      >
                        Find key
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGeneratePlayingCoordinatesRequest((request) => request + 1);
                          setOpenTopMenu(null);
                        }}
                        disabled={!activeLaneId}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                        title={
                          activeLaneId
                            ? "Generate playing coordinates for the active track"
                            : "Select a track first"
                        }
                      >
                        Generate playing coordinates
                      </button>
                    </div>
                  </details>

                  <details
                    className="hidden"
                    open={openTopMenu === "snapping"}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenTopMenu((current) =>
                        isOpen ? "snapping" : current === "snapping" ? null : current
                      );
                    }}
                    onMouseLeave={() => setOpenTopMenu(null)}
                  >
                    <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                      Snapping
                    </summary>
                    <div className="absolute left-0 top-full z-[10000] w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={() => setGlobalSnapToGridEnabled((enabled) => !enabled)}
                        aria-pressed={globalSnapToGridEnabled}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                      >
                        <span>Snap to grid</span>
                        <span className="text-xs">{globalSnapToGridEnabled ? "On" : "Off"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGlobalSnapToKeyEnabled((enabled) => !enabled)}
                        aria-pressed={globalSnapToKeyEnabled}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                      >
                        <span>Snap to key</span>
                        <span className="text-xs">{globalSnapToKeyEnabled ? "On" : "Off"}</span>
                      </button>
                      <label className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2 text-sm text-slate-700">
                        <span>Snapping accuracy</span>
                        <select
                          value={globalSnapSubdivisionsPerBeat}
                          onChange={(event) =>
                            setGlobalSnapSubdivisionsPerBeat(Number(event.target.value))
                          }
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                          title="Snap subdivisions per beat"
                          aria-label="Snapping accuracy"
                        >
                          {SNAP_SUBDIVISION_OPTIONS.map((subdivision) => (
                            <option key={subdivision} value={subdivision}>
                              {subdivision === 1 ? "1" : `1/${subdivision}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </details>

                  <details
                    className="hidden"
                    open={openTopMenu === "playback"}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenTopMenu((current) =>
                        isOpen ? "playback" : current === "playback" ? null : current
                      );
                    }}
                    onMouseLeave={() => setOpenTopMenu(null)}
                  >
                    <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                      Playback
                    </summary>
                    <div className="absolute left-0 top-full z-[10000] w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={() => setPracticeLoopEnabled((enabled) => !enabled)}
                        disabled={!globalPracticeLoopRange}
                        aria-pressed={practiceLoopEnabled}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        <span>Loop</span>
                        <span className="text-xs">{practiceLoopEnabled ? "On" : "Off"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetronomeEnabled((enabled) => !enabled)}
                        aria-pressed={metronomeEnabled}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                      >
                        <span>Metronome</span>
                        <span className="text-xs">{metronomeEnabled ? "On" : "Off"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCountInEnabled((enabled) => !enabled)}
                        aria-pressed={countInEnabled}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                      >
                        <span>Count-in</span>
                        <span className="text-xs">{countInEnabled ? "On" : "Off"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={toggleSpeedTrainer}
                        aria-pressed={speedTrainerEnabled}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                      >
                        <span>Speed trainer</span>
                        <span className="text-xs">{speedTrainerEnabled ? "On" : "Off"}</span>
                      </button>
                      <label className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2 text-sm text-slate-700">
                        <span>Playback speed</span>
                        <select
                          value={normalizedPlaybackSpeed}
                          onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                          title="Playback speed"
                        >
                          {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                            <option key={speed} value={speed}>
                              {Math.round(speed * 100)}%
                            </option>
                          ))}
                        </select>
                      </label>
                      {speedTrainerEnabled && (
                        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-2">
                          <select
                            value={speedTrainerTarget}
                            onChange={(event) => setSpeedTrainerTarget(Number(event.target.value))}
                            className="h-8 rounded-md border border-violet-200 bg-white px-2 text-xs font-semibold text-violet-800"
                            title="Speed trainer target"
                          >
                            {SPEED_TRAINER_TARGET_OPTIONS.map((speed) => (
                              <option key={speed} value={speed}>
                                to {Math.round(speed * 100)}%
                              </option>
                            ))}
                          </select>
                          <select
                            value={speedTrainerStep}
                            onChange={(event) => setSpeedTrainerStep(Number(event.target.value))}
                            className="h-8 rounded-md border border-violet-200 bg-white px-2 text-xs font-semibold text-violet-800"
                            title="Speed trainer step"
                          >
                            {SPEED_TRAINER_STEP_OPTIONS.map((step) => (
                              <option key={step} value={step}>
                                +{Math.round(step * 100)}%
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </details>

                  <div className={`order-7 shrink-0 items-center gap-2 xl:ml-auto ${
                    practiceModeEnabled ? "hidden" : "flex"
                  }`}>
                    <button
                      type="button"
                      onClick={handleCanvasUndo}
                      disabled={canvasUndoCount === 0 || mobileHistoryBusy}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                      title="Undo"
                      aria-label="Undo"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                        <path d="M7 7H3v4h2V9h7a5 5 0 1 1 0 10h-4v2h4a7 7 0 1 0 0-14H7z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleCanvasRedo}
                      disabled={canvasRedoCount === 0 || mobileHistoryBusy}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                      title="Redo"
                      aria-label="Redo"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                        <path d="M17 7h4v4h-2V9h-7a5 5 0 1 0 0 10h4v2h-4a7 7 0 1 1 0-14h5z" />
                      </svg>
                    </button>
                    <span className="text-xs text-slate-600" role="status" aria-live="polite">
                      {saveStatus}
                    </span>
                    {isGuestMode ? (
                      <Link href="/" className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                        Back home
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => router.push("/gte")}
                        className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                      >
                        Back to editors
                      </button>
                    )}
                  </div>
                </div>

                {!practiceModeEnabled && (
                <details className="group w-fit max-w-full rounded-lg border border-slate-200 bg-white shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-1.5 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Song settings</span>
                    <span className="truncate">
                      {KEY_BASE_OPTIONS[normalizeKeyBase(canvas?.keyBase)]} {KEY_TYPE_OPTIONS[normalizeKeyType(canvas?.keyType)]}
                      {" · "}{bpmDraft} BPM
                      {" · "}{normalizeTimeSignature(timeSignatureDraft) ?? 8}/{normalizeTimeSignatureBottom(timeSignatureBottomDraft) ?? 4}
                    </span>
                    <span className="transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
                  </summary>
                  <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-3">
                    <label className="text-xs font-medium text-slate-600">
                      <span className="mb-1 block">Key</span>
                      <span className="flex items-center gap-1">
                        <select
                          value={normalizeKeyBase(canvas?.keyBase)}
                          onChange={(event) => {
                            commitCanvasKey(Number(event.target.value), normalizeKeyType(canvas?.keyType));
                            event.currentTarget.blur();
                          }}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
                          aria-label="Base note"
                        >
                          {KEY_BASE_OPTIONS.map((label, index) => (
                            <option key={label} value={index}>{label}</option>
                          ))}
                        </select>
                        <select
                          value={normalizeKeyType(canvas?.keyType)}
                          onChange={(event) => {
                            commitCanvasKey(normalizeKeyBase(canvas?.keyBase), Number(event.target.value));
                            event.currentTarget.blur();
                          }}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
                          aria-label="Key extension"
                        >
                          {KEY_TYPE_OPTIONS.map((label, index) => (
                            <option key={label} value={index}>{label}</option>
                          ))}
                        </select>
                      </span>
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      <span className="mb-1 block">BPM</span>
                      <span className="flex items-center gap-1">
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
                            if (event.key === "Enter" || event.key === "ArrowUp" || event.key === "ArrowDown") {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                          }}
                          className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-sm"
                        />
                        <span className="inline-flex flex-col gap-0.5">
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
                            className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[9px] leading-none text-slate-600 hover:bg-slate-50"
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
                            className="flex h-5 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[9px] leading-none text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Decrease BPM"
                            aria-label="Decrease BPM"
                            disabled={(normalizeBpm(bpmDraft) ?? 1) <= 1}
                          >
                            &#9660;
                          </button>
                        </span>
                      </span>
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      <span className="mb-1 block">Time signature</span>
                      <span className="flex items-center gap-1">
                        <select
                          value={normalizeTimeSignature(timeSignatureDraft) ?? 8}
                          onChange={(event) => {
                            setTimeSignatureDraft(event.target.value);
                            scheduleTimeSignatureCommit(Number(event.target.value));
                            event.currentTarget.blur();
                          }}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
                          aria-label="Time signature top number"
                        >
                          {TIME_SIGNATURE_TOP_OPTIONS.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                        <span>/</span>
                        <select
                          value={normalizeTimeSignatureBottom(timeSignatureBottomDraft) ?? 4}
                          onChange={(event) => {
                            void commitTimeSignatureBottom(Number(event.target.value));
                            event.currentTarget.blur();
                          }}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
                          aria-label="Time signature bottom number"
                        >
                          {TIME_SIGNATURE_BOTTOM_OPTIONS.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setFindKeyDialogOpen(true)}
                      className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      title="Detect the most likely key from all notes and chords"
                    >
                      Detect key…
                    </button>
                  </div>
                </details>
                )}
                {!practiceModeEnabled && (
                <details className="group w-fit max-w-full rounded-lg border border-slate-200 bg-white shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-1.5 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Editing settings</span>
                    <span className="truncate">
                      Note {formatNoteLengthOption(chordOnlyDefaultNoteLengthDenominator)}
                      {" · "}Cursor 1/{chordOnlyCursorSizeDenominator}
                      {" · "}Grid {globalSnapToGridEnabled ? "on" : "off"}
                    </span>
                    <span className="transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
                  </summary>
                  <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-3">
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Add note size
                      <select
                        value={chordOnlyDefaultNoteLengthDenominator}
                        onKeyDown={blockSizeSelectKeyboardChange}
                        onChange={(event) =>
                          setChordOnlyDefaultNoteLengthDenominator(Number(event.target.value))
                        }
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                      >
                        {NOTE_LENGTH_FRACTION_DENOMINATORS.map((denominator) => (
                          <option key={`desktop-note-size-${denominator}`} value={denominator}>
                            {formatNoteLengthOption(denominator)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Cursor size
                      <select
                        value={chordOnlyCursorSizeDenominator}
                        onKeyDown={blockSizeSelectKeyboardChange}
                        onChange={(event) =>
                          setChordOnlyCursorSizeDenominator(
                            getNearestCursorSizeDenominator(event.target.value)
                          )
                        }
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                      >
                        {CURSOR_SIZE_FRACTION_DENOMINATORS.map((denominator) => (
                          <option key={`desktop-cursor-size-${denominator}`} value={denominator}>
                            1/{denominator}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => setGlobalSnapToGridEnabled((enabled) => !enabled)}
                      aria-pressed={globalSnapToGridEnabled}
                      className="flex h-8 min-w-28 items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <span>Grid</span>
                      <span>{globalSnapToGridEnabled ? "On" : "Off"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGlobalSnapToKeyEnabled((enabled) => !enabled)}
                      aria-pressed={globalSnapToKeyEnabled}
                      className="flex h-8 min-w-28 items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <span>Key</span>
                      <span>{globalSnapToKeyEnabled ? "On" : "Off"}</span>
                    </button>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Grid division
                      <select
                        value={globalSnapSubdivisionsPerBeat}
                        onChange={(event) =>
                          setGlobalSnapSubdivisionsPerBeat(Number(event.target.value))
                        }
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                      >
                        {SNAP_SUBDIVISION_OPTIONS.map((subdivision) => (
                          <option key={`desktop-grid-${subdivision}`} value={subdivision}>
                            {subdivision === 1 ? "Beat" : `1/${subdivision}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </details>
                )}
                {(((nameSaving || bpmSaving) && !isGuestMode) ||
                  nameError ||
                  bpmError ||
                  timeSignatureSaving ||
                  timeSignatureError) && (
                  <div className="text-xs">
                    {(nameSaving || bpmSaving) && !isGuestMode && (
                      <span className="muted">Saving draft...</span>
                    )}
                    {(nameError || bpmError) && <span className="error">{nameError || bpmError}</span>}
                    {(timeSignatureSaving || timeSignatureError) && (
                      <span className={timeSignatureError ? "error" : "muted"}>
                        {timeSignatureError || "Saving time signature..."}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            {false && !isMobileViewport && (
            <>
            <div
              className="page-subtitle"
              style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}
            >
              <div
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <span className="text-small muted">Key</span>
                <select
                  value={normalizeKeyBase(canvas?.keyBase)}
                  onChange={(event) => {
                    commitCanvasKey(Number(event.target.value), normalizeKeyType(canvas?.keyType));
                    event.currentTarget.blur();
                  }}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                  title="Base note"
                  aria-label="Base note"
                >
                  {KEY_BASE_OPTIONS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={normalizeKeyType(canvas?.keyType)}
                  onChange={(event) => {
                    commitCanvasKey(normalizeKeyBase(canvas?.keyBase), Number(event.target.value));
                    event.currentTarget.blur();
                  }}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                  title="Key extension"
                  aria-label="Key extension"
                >
                  {KEY_TYPE_OPTIONS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
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
                        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                          event.preventDefault();
                          event.currentTarget.blur();
                          return;
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
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
                Time signature
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <select
                    value={normalizeTimeSignature(timeSignatureDraft) ?? 8}
                    onChange={(event) => {
                      setTimeSignatureDraft(event.target.value);
                      scheduleTimeSignatureCommit(Number(event.target.value));
                      event.currentTarget.blur();
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    aria-label="Time signature top number"
                  >
                    {TIME_SIGNATURE_TOP_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <span>/</span>
                  <select
                    value={normalizeTimeSignatureBottom(timeSignatureBottomDraft) ?? 4}
                    onChange={(event) => {
                      void commitTimeSignatureBottom(Number(event.target.value));
                      event.currentTarget.blur();
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    aria-label="Time signature bottom number"
                  >
                    {TIME_SIGNATURE_BOTTOM_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <div className="ml-auto flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white/55 p-1 shadow-sm">
                {!isGuestMode && (
                  <button
                    type="button"
                    onClick={() => void router.push(transcriberHref)}
                    className="button-secondary button-small min-h-[34px]"
                    title="Open the standalone transcriber"
                  >
                    Generate tabs
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void router.push(`/gte/${editorId}/tabs`)}
                  className="button-secondary button-small min-h-[34px]"
                  title="View current editor as ASCII tabs"
                >
                  View as tabs
                </button>
                {!isGuestMode && (
                  <GteFileImportButton
                    editorId={editorId}
                    onImported={async () => {
                      await loadEditor();
                    }}
                    onError={(message) => setError(message || null)}
                    className="button-secondary button-small min-h-[34px]"
                    busyLabel="Importing..."
                    title="Import a tab file"
                  >
                    Import tabs
                  </GteFileImportButton>
                )}
                {!isGuestMode && (
                  <button
                    type="button"
                    onClick={() => void commitCanvasToBackend({ force: true })}
                    className="button-secondary button-small min-h-[34px]"
                    title="Save editor now"
                    disabled={savingCanvas}
                  >
                    {savingCanvas ? "Saving..." : "Save"}
                  </button>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((prev) => !prev)}
                    className="button-secondary button-small min-h-[34px]"
                    title="Export selected track"
                    disabled={exportingTrack || !canvas?.editors.length}
                    aria-expanded={exportMenuOpen}
                  >
                    {exportingTrack ? "Exporting..." : "Export"}
                  </button>
                  {exportMenuOpen && (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-[10000] grid min-w-44 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      {GTE_EXPORT_FORMAT_OPTIONS.map((option) => (
                        <button
                          key={`export-${option.value}`}
                          type="button"
                          onClick={() => handleExportTrack(option.value)}
                          className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                          disabled={exportingTrack}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="button-row shrink-0 rounded-xl border border-slate-200 bg-white/55 p-1 shadow-sm">
                {isGuestMode ? (
                  <>
                    <Link href="/" className="button-secondary button-small min-h-[34px]">
                      Back home
                    </Link>
                    {session?.user?.id ? (
                      <button
                        type="button"
                        onClick={() => void router.push(saveToAccountPath)}
                        className="button-primary button-small min-h-[34px]"
                      >
                        Save draft to account
                      </button>
                    ) : (
                      <>
                        <Link href={loginSaveHref} className="button-secondary button-small min-h-[34px]">
                          Log in to save
                        </Link>
                        <Link href={signupSaveHref} className="button-primary button-small min-h-[34px]">
                          Create account
                        </Link>
                      </>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push("/gte")}
                    className="button-secondary button-small min-h-[34px]"
                  >
                    Back to editors
                  </button>
                )}
              </div>
            </div>
            <div
              className="text-small"
              style={{ minHeight: "1.25rem", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}
            >
              <span className="text-slate-600">{saveStatus}</span>
              {(nameSaving || bpmSaving) && !isGuestMode && <span className="muted">Saving draft...</span>}
              {(nameError || bpmError) && <span className="error">{nameError || bpmError}</span>}
              {(timeSignatureSaving || timeSignatureError) && (
                <span className={timeSignatureError ? "error" : "muted"}>
                  {timeSignatureError || "Saving time signature..."}
                </span>
              )}
            </div>
            </>
            )}
            {isMobileViewport && !practiceModeEnabled && (
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
                              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                event.preventDefault();
                                event.currentTarget.blur();
                                return;
                              }
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
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
                        <span className="mb-1 block">Time signature</span>
                        <span className="flex items-center gap-2">
                          <select
                            value={normalizeTimeSignature(timeSignatureDraft) ?? 8}
                            onChange={(event) => {
                              setTimeSignatureDraft(event.target.value);
                              scheduleTimeSignatureCommit(Number(event.target.value));
                              event.currentTarget.blur();
                            }}
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                            aria-label="Time signature top number"
                          >
                            {TIME_SIGNATURE_TOP_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                          <span className="text-slate-400">/</span>
                          <select
                            value={normalizeTimeSignatureBottom(timeSignatureBottomDraft) ?? 4}
                            onChange={(event) => {
                              void commitTimeSignatureBottom(Number(event.target.value));
                              event.currentTarget.blur();
                            }}
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                            aria-label="Time signature bottom number"
                          >
                            {TIME_SIGNATURE_BOTTOM_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </span>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <details className="relative">
                        <summary className="cursor-pointer list-none rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                          Snapping
                        </summary>
                        <div className="absolute left-0 top-[calc(100%+4px)] z-[10000] w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                          <button
                            type="button"
                            onClick={() => setGlobalSnapToGridEnabled((enabled) => !enabled)}
                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <span>Snap to grid</span>
                            <span className="text-xs">{globalSnapToGridEnabled ? "On" : "Off"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setGlobalSnapToKeyEnabled((enabled) => !enabled)}
                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            <span>Snap to key</span>
                            <span className="text-xs">{globalSnapToKeyEnabled ? "On" : "Off"}</span>
                          </button>
                        </div>
                      </details>
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
                  <span className="text-slate-600">{saveStatus}</span>
                  {(nameSaving || bpmSaving) && !isGuestMode && <span className="muted">Saving draft...</span>}
                  {(nameError || bpmError) && <span className="error">{nameError || bpmError}</span>}
                  {(timeSignatureSaving || timeSignatureError) && (
                    <span className={timeSignatureError ? "error" : "muted"}>
                      {timeSignatureError || "Saving time signature..."}
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
        </div>
        )}
        {isGuestMode && !isMobileEditMode && !practiceModeEnabled && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">Keep your work safe</div>
              <div className="mt-0.5 text-xs leading-5 text-slate-500">
                Create a free account to save this draft and continue on any device.
              </div>
            </div>
            {session?.user?.id ? (
              <button
                type="button"
                onClick={() => void router.push(saveToAccountPath)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                Save this draft
              </button>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={loginSaveHref}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Sign in
                </Link>
                <Link
                  href={signupSaveHref}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                >
                  Create free account
                </Link>
              </div>
            )}
          </div>
        )}
        {practiceModeEnabled && !isMobileEditMode && (
          <>
            {renderPracticeControls()}
            {renderPracticeHelp()}
          </>
        )}
        {loading && !canvas && (
          <EditorLoadingState />
        )}
        {error && (
          <div className="error flex flex-wrap items-center justify-between gap-3" role="alert">
            <span>{error}</span>
            {!canvas && !loading && (
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => {
                  if (isGuestMode) {
                    router.reload();
                  } else {
                    void loadEditor();
                  }
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
        {saveError && <div className="error" role="alert">{saveError}</div>}
        {canvas && (
          <div
            className={`gte-editor-stage stack min-w-0 content-start overflow-x-hidden ${
              isMobileEditMode
                ? "gte-editor-stage--mobile-edit flex-1 min-h-0 space-y-0"
                : practiceModeEnabled
                ? "mx-auto min-h-[1050px] w-full max-w-[900px] space-y-5 rounded-[3px] border border-slate-200 bg-white px-8 py-10 shadow-[0_20px_60px_rgba(15,23,42,0.12)] max-sm:min-h-0 max-sm:px-3 max-sm:py-5"
                : "space-y-2"
            }`}
          >
            {canvas.editors.map((lane, index) => {
              const laneId = lane.id || `ed-${index + 1}`;
              if (practiceModeEnabled && laneId !== globalControlsLaneId) {
                return null;
              }
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
              const drumLane = isDrumLane(lane);
              const laneTypeLabel = isChordLane(lane)
                ? "Chords"
                : drumLane
                  ? "Drums"
                  : "Tab";
              const instrumentValue = trackInstrumentOptions.some(
                (option) => option.id === normalizeTrackInstrumentId(lane.instrumentId)
              )
                ? normalizeTrackInstrumentId(lane.instrumentId)
                : DEFAULT_TRACK_INSTRUMENT_ID;
              const instrumentLabel = drumLane
                ? "Drum kit"
                : trackInstrumentOptions.find((option) => option.id === instrumentValue)?.label ||
                  "Built-in synth";
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
                      !isActive && !isMobileViewport && !practiceModeEnabled
                        ? "gte-editor-track--deferred "
                        : ""
                    }${
                      isMobileEditMode
                        ? "flex min-h-0 flex-1 flex-col"
                        : isMobileViewport
                        ? "rounded-lg"
                        : ""
                    }`}
                    style={mobileEditing ? { backgroundColor: "var(--bg)", minHeight: 0 } : undefined}
                    onContextMenuCapture={(event) => {
                      const target = event.target as HTMLElement | null;
                      if (!target?.closest("[data-track-offset-blank='true']")) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setOpenTrackMenuId(null);
                      setTrackContextMenu({ laneId, x: event.clientX, y: event.clientY });
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setOpenTrackMenuId(null);
                      setTrackContextMenu({ laneId, x: event.clientX, y: event.clientY });
                    }}
                    onMouseDownCapture={(event) => {
                      const target = event.target as HTMLElement | null;
                      if (practiceModeEnabled) {
                        setPendingTrackReorder(null);
                        return;
                      }
                      const clickedBarSelector = Boolean(target?.closest("[data-bar-select='true']"));
                      const clickedEditorControl = Boolean(
                        target?.closest("[data-gte-editor-control='true']")
                      );
                      const clickedToolbarUi = Boolean(target?.closest("[data-gte-toolbar-ui='true']"));

                      if (activeLaneId !== laneId && clickedBarSelector) {
                        setBarSelectionClearExemptEditorId(laneEditorRef);
                        setBarSelectionClearEpoch((prev) => prev + 1);
                      }
                      if (
                        activeLaneId !== laneId &&
                        !clickedEditorControl &&
                        (!event.shiftKey || clickedBarSelector)
                      ) {
                        setSelectionClearExemptEditorId(laneEditorRef);
                        setSelectionClearEpoch((prev) => prev + 1);
                      }
                      if (clickedToolbarUi) {
                        setPendingTrackReorder(null);
                        return;
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
                      if (practiceModeEnabled) {
                        setPendingTrackReorder(null);
                        return;
                      }
                      const clickedBarSelector = Boolean(target?.closest("[data-bar-select='true']"));
                      const clickedEditorControl = Boolean(
                        target?.closest("[data-gte-editor-control='true']")
                      );
                      const clickedToolbarUi = Boolean(target?.closest("[data-gte-toolbar-ui='true']"));
                      if (activeLaneId !== laneId && clickedBarSelector) {
                        setBarSelectionClearExemptEditorId(laneEditorRef);
                        setBarSelectionClearEpoch((prev) => prev + 1);
                        setOpenMobileBarMenuLaneId(null);
                      }
                      if (activeLaneId !== laneId && !clickedEditorControl) {
                        setSelectionClearExemptEditorId(laneEditorRef);
                        setSelectionClearEpoch((prev) => prev + 1);
                      }
                      if (clickedToolbarUi) {
                        setPendingTrackReorder(null);
                        return;
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
                    {isMobileViewport && !practiceModeEnabled ? (
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
                              timingMap={canvas.timingMap}
                              onSnapshotChange={(nextSnapshot, options) =>
                                handleLaneSnapshotChange(laneId, nextSnapshot, options)
                              }
                              allowBackend
                              embedded
                              isActive
                              mobileViewport
                              mobileMode="edit"
                              playbackUiVisible
                              onFocusWorkspace={() => setActiveLaneId(laneId)}
                              tabViewEnabled={tabViewEnabled}
                              globalSnapToGridEnabled={globalSnapToGridEnabled}
                              onGlobalSnapToGridEnabledChange={setGlobalSnapToGridEnabled}
                              snapSubdivisionsPerBeat={globalSnapSubdivisionsPerBeat}
                              showBarNumbers={displayPreferences.showBarNumbers}
                              showTimeRuler={displayPreferences.showTimeRuler}
                              showPlaybackCounter={displayPreferences.showPlaybackCounter}
                              globalSnapToKeyEnabled={globalSnapToKeyEnabled}
                              onGlobalSnapToKeyEnabledChange={setGlobalSnapToKeyEnabled}
                              generatePlayingCoordinatesRequest={generatePlayingCoordinatesRequest}
                              defaultNoteLengthDenominator={chordOnlyDefaultNoteLengthDenominator}
                              onDefaultNoteLengthDenominatorChange={
                                setChordOnlyDefaultNoteLengthDenominator
                              }
                              cursorSizeDenominator={chordOnlyCursorSizeDenominator}
                              onCursorSizeDenominatorChange={setChordOnlyCursorSizeDenominator}
                              leftHandedChordDiagrams={leftHandedChordDiagrams}
                              editMenuPortalTarget={
                                laneId === editMenuOwnerLaneId ? editMenuPortalTarget : null
                              }
                              editMenuDisabled={editMenuDisabled}
                              onEditMenuPointerEnter={cancelEditMenuClose}
                              onEditMenuPointerLeave={scheduleEditMenuClose}
                              canvasKeyBase={normalizeKeyBase(canvas.keyBase)}
                              canvasKeyType={normalizeKeyType(canvas.keyType)}
                              sharedTimeSignature={normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8}
                              sharedTimeSignatureBottom={normalizeTimeSignatureBottom(canvas.editors[0]?.timeSignatureBottom) ?? 4}
                              sharedViewportBarCount={sharedViewportBarCount}
                              onSharedTimelineScrollRatioChange={handleSharedTimelineScrollRatioChange}
                              timelineZoomFactor={
                                practiceModeEnabled
                                  ? Math.min(timelineZoomPercent / 100, 0.5)
                                  : timelineZoomPercent / 100
                              }
                              historyUndoCount={canvasUndoCount}
                              historyRedoCount={canvasRedoCount}
                              onRequestUndo={handleCanvasUndo}
                              onRequestRedo={handleCanvasRedo}
                              globalPlaybackFrame={globalPlaybackCounterFrame}
                              getGlobalPlaybackFrame={getGlobalPlaybackFrame}
                              globalPlaybackIsPlaying={globalPlaybackIsPlaying}
                              globalPlaybackIsPreparing={globalPlaybackIsPreparing}
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
                              practiceMode={practiceModeEnabled}
                              practiceFocusBarRange={
                                practiceFocusEnabled && barSelection?.laneId === laneId && barSelection.barIndices.length
                                  ? {
                                      startBar: Math.min(...barSelection.barIndices),
                                      endBar: Math.max(...barSelection.barIndices) + 1,
                                    }
                                  : null
                              }
                              practiceRatingReplay={
                                selectedPracticeRating?.laneId === laneId ? selectedPracticeRating : null
                              }
                              practiceControlsVisible={false}
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
                                <input
                                  key={`${laneId}:${lane.name || ""}`}
                                  defaultValue={lane.name || `Track ${index + 1}`}
                                  maxLength={80}
                                  aria-label={`Track ${index + 1} name`}
                                  title="Rename track"
                                  onClick={(event) => event.stopPropagation()}
                                  onBlur={(event) => void handleLaneNameCommit(laneId, event.currentTarget.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                    if (event.key === "Escape") {
                                      event.currentTarget.value = lane.name || `Track ${index + 1}`;
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-sm font-semibold text-slate-800 outline-none focus:ring-0"
                                />
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
                                aria-expanded={openTrackMenuId === laneId}
                              >
                                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                                  <circle cx="12" cy="5" r="1.8" />
                                  <circle cx="12" cy="12" r="1.8" />
                                  <circle cx="12" cy="19" r="1.8" />
                                </svg>
                              </button>
                              {openTrackMenuId === laneId && (
                                <div className="absolute right-0 top-11 z-30 w-60 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                                  {!drumLane && (
                                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                      Sound
                                      <select
                                        value={instrumentValue}
                                        onChange={(event) => {
                                          handleLaneInstrumentChange(laneId, event.target.value);
                                          event.currentTarget.blur();
                                        }}
                                        className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                                      >
                                        {trackInstrumentOptions.map((option) => (
                                          <option key={`${laneId}-mobile-instrument-${option.id}`} value={option.id}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}
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
                                        onChange={(event) => handleTrackVolumePreview(laneId, Number(event.target.value))}
                                        onPointerUp={() => commitTrackVolume(laneId)}
                                        onPointerCancel={() => commitTrackVolume(laneId)}
                                        onBlur={() => commitTrackVolume(laneId)}
                                        className="flex-1 accent-slate-700"
                                        aria-label={`Volume for ${lane.name || `Track ${index + 1}`}`}
                                      />
                                      <span className="w-10 text-right text-xs text-slate-500">
                                        {Math.round(trackVolume * 100)}%
                                      </span>
                                    </div>
                                  </label>
                                  <div className="mt-3 border-t border-slate-100 pt-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                      Timeline position
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => beginTrackOffset(laneId)}
                                      disabled={shiftingLaneId === laneId}
                                      className="mt-2 w-full rounded-md bg-slate-900 px-2 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                                    >
                                      Offset track…
                                    </button>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleShiftTrack(laneId, -1)}
                                        disabled={shiftingLaneId === laneId || Math.max(0, Number(lane.timelineOffsetFrames) || 0) === 0}
                                        className="rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300"
                                      >
                                        Move 1 bar left
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleShiftTrack(laneId, 1)}
                                        disabled={shiftingLaneId === laneId}
                                        className="rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300"
                                      >
                                        Move 1 bar right
                                      </button>
                                    </div>
                                    <p className="mt-2 text-[10px] leading-4 text-slate-400">
                                      {`Starts at bar ${Math.floor(Math.max(0, Number(lane.timelineOffsetFrames) || 0) / FIXED_FRAMES_PER_BAR) + 1}.`}
                                    </p>
                                  </div>
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
                              timingMap={canvas.timingMap}
                              onSnapshotChange={(nextSnapshot, options) =>
                                handleLaneSnapshotChange(laneId, nextSnapshot, options)
                              }
                              allowBackend
                              embedded
                              isActive={isActive}
                              mobileViewport
                              mobileMode="canvas"
                              playbackUiVisible={laneId === globalControlsLaneId}
                              onFocusWorkspace={() => setActiveLaneId(laneId)}
                              tabViewEnabled={tabViewEnabled}
                              globalSnapToGridEnabled={globalSnapToGridEnabled}
                              onGlobalSnapToGridEnabledChange={setGlobalSnapToGridEnabled}
                              snapSubdivisionsPerBeat={globalSnapSubdivisionsPerBeat}
                              showBarNumbers={displayPreferences.showBarNumbers}
                              showTimeRuler={displayPreferences.showTimeRuler}
                              showPlaybackCounter={displayPreferences.showPlaybackCounter}
                              globalSnapToKeyEnabled={globalSnapToKeyEnabled}
                              onGlobalSnapToKeyEnabledChange={setGlobalSnapToKeyEnabled}
                              generatePlayingCoordinatesRequest={generatePlayingCoordinatesRequest}
                              defaultNoteLengthDenominator={chordOnlyDefaultNoteLengthDenominator}
                              onDefaultNoteLengthDenominatorChange={
                                setChordOnlyDefaultNoteLengthDenominator
                              }
                              cursorSizeDenominator={chordOnlyCursorSizeDenominator}
                              onCursorSizeDenominatorChange={setChordOnlyCursorSizeDenominator}
                              leftHandedChordDiagrams={leftHandedChordDiagrams}
                              editMenuPortalTarget={
                                laneId === editMenuOwnerLaneId ? editMenuPortalTarget : null
                              }
                              editMenuDisabled={editMenuDisabled}
                              onEditMenuPointerEnter={cancelEditMenuClose}
                              onEditMenuPointerLeave={scheduleEditMenuClose}
                              canvasKeyBase={normalizeKeyBase(canvas.keyBase)}
                              canvasKeyType={normalizeKeyType(canvas.keyType)}
                              sharedTimeSignature={normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8}
                              sharedTimeSignatureBottom={normalizeTimeSignatureBottom(canvas.editors[0]?.timeSignatureBottom) ?? 4}
                              sharedViewportBarCount={sharedViewportBarCount}
                              onSharedTimelineScrollRatioChange={handleSharedTimelineScrollRatioChange}
                              timelineZoomFactor={
                                practiceModeEnabled
                                  ? Math.min(timelineZoomPercent / 100, 0.5)
                                  : timelineZoomPercent / 100
                              }
                              historyUndoCount={canvasUndoCount}
                              historyRedoCount={canvasRedoCount}
                              onRequestUndo={handleCanvasUndo}
                              onRequestRedo={handleCanvasRedo}
                              globalPlaybackFrame={globalPlaybackCounterFrame}
                              getGlobalPlaybackFrame={getGlobalPlaybackFrame}
                              globalPlaybackIsPlaying={globalPlaybackIsPlaying}
                              globalPlaybackIsPreparing={globalPlaybackIsPreparing}
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
                              practiceMode={practiceModeEnabled}
                              practiceFocusBarRange={
                                practiceFocusEnabled && barSelection?.laneId === laneId && barSelection.barIndices.length
                                  ? {
                                      startBar: Math.min(...barSelection.barIndices),
                                      endBar: Math.max(...barSelection.barIndices) + 1,
                                    }
                                  : null
                              }
                              practiceRatingReplay={
                                selectedPracticeRating?.laneId === laneId ? selectedPracticeRating : null
                              }
                              practiceControlsVisible={false}
                              showToolbarWhenInactive={laneId === globalControlsLaneId}
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
                    <div className={practiceModeEnabled ? "block" : "flex flex-col gap-3 lg:flex-row"}>
                      {!practiceModeEnabled && (
                      <aside
                        className="flex w-full shrink-0 flex-col rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm lg:w-36 lg:self-stretch"
                        data-track-reorder-block="true"
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setOpenTrackMenuId(null);
                          setTrackContextMenu({ laneId, x: event.clientX, y: event.clientY });
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            key={`${laneId}:${lane.name || ""}`}
                            defaultValue={lane.name || `Track ${index + 1}`}
                            maxLength={80}
                            aria-label={`Track ${index + 1} name`}
                            title="Rename track"
                            onClick={(event) => event.stopPropagation()}
                            onBlur={(event) => void handleLaneNameCommit(laneId, event.currentTarget.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                              if (event.key === "Escape") {
                                event.currentTarget.value = lane.name || `Track ${index + 1}`;
                                event.currentTarget.blur();
                              }
                            }}
                            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-semibold text-slate-700 outline-none focus:ring-0"
                          />
                          <span className="text-[10px] font-medium text-slate-500">
                            {laneTypeLabel} · {laneBarCount} bars
                          </span>
                        </div>
                        {!drumLane && <div className="mt-2 min-w-0">
                          <select
                            value={instrumentValue}
                            onChange={(event) => {
                              handleLaneInstrumentChange(laneId, event.target.value);
                              event.currentTarget.blur();
                            }}
                            onClick={(event) => event.stopPropagation()}
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm"
                            title="Track sound"
                            aria-label="Track sound"
                          >
                            {trackInstrumentOptions.map((option) => (
                              <option key={`${laneId}-instrument-${option.id}`} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>}
                        {!isChordLane(lane) && !drumLane && (
                          <div className="mt-2 min-w-0 space-y-1.5">
                            <select
                              value={tuning.presetId}
                              onChange={(event) =>
                                handleLaneTuningChange(laneId, event.target.value, tuning.capo)
                              }
                              onClick={(event) => event.stopPropagation()}
                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm"
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
                                value={trackCapoDraftById[laneId] ?? String(tuning.capo)}
                                onChange={(event) =>
                                  handleLaneCapoDraftChange(laneId, event.target.value)
                                }
                                onBlur={() =>
                                  commitLaneCapoDraft(laneId, tuning.presetId, tuning.capo)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                  }
                                  if (event.key === "Escape") {
                                    setTrackCapoDraftById((prev) => ({
                                      ...prev,
                                      [laneId]: String(tuning.capo),
                                    }));
                                    event.currentTarget.blur();
                                  }
                                }}
                                onClick={(event) => event.stopPropagation()}
                                className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700 shadow-sm"
                                title="Track capo"
                                aria-label="Track capo"
                              />
                            </label>
                          </div>
                        )}
                        <div className="mt-2 flex w-full flex-1 flex-col gap-2">
                          <div className="flex w-full min-w-0 items-center gap-1">
                            <span className="w-6 shrink-0 text-[10px] font-medium text-slate-500">Vol</span>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={trackVolume}
                              onChange={(event) => handleTrackVolumePreview(laneId, Number(event.target.value))}
                              onPointerUp={() => commitTrackVolume(laneId)}
                              onPointerCancel={() => commitTrackVolume(laneId)}
                              onBlur={() => commitTrackVolume(laneId)}
                              onClick={(event) => event.stopPropagation()}
                              className="h-2 min-w-0 flex-1 accent-slate-700"
                              title="Track volume"
                              aria-label="Track volume"
                            />
                            <div className="w-7 shrink-0 text-right text-[10px] font-medium text-slate-500">
                              {Math.round(trackVolume * 100)}%
                            </div>
                          </div>
                          <div className="flex w-full min-w-0 items-center gap-1">
                            <span className="w-6 shrink-0 text-[10px] font-medium text-slate-500">Pan</span>
                            <input
                              type="range"
                              min={-1}
                              max={1}
                              step={0.01}
                              value={trackPan}
                              onChange={(event) => handleTrackPanChange(laneId, Number(event.target.value))}
                              onClick={(event) => event.stopPropagation()}
                              className="h-2 min-w-0 flex-1 accent-sky-700"
                              title="Track pan"
                              aria-label="headset direction (L/R)"
                            />
                            <div className="w-7 shrink-0 text-right text-[10px] font-medium text-slate-500">
                              {trackPan < -0.05
                                ? `L${Math.round(Math.abs(trackPan) * 100)}`
                                : trackPan > 0.05
                                ? `R${Math.round(trackPan * 100)}`
                                : "C"}
                            </div>
                          </div>
                          <div className="mt-auto flex flex-row items-center justify-center gap-1" data-track-menu="true">
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
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setOpenTrackMenuId((prev) => (prev === laneId ? null : laneId));
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                title="Track options"
                                aria-label="Track options"
                                aria-expanded={openTrackMenuId === laneId}
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
                                    onClick={() => beginTrackOffset(laneId)}
                                    className="block w-full px-3 py-1.5 text-left text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Offset track…
                                  </button>
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
                        </div>
                      </aside>
                      )}
                      <div ref={sharedTimelineMeasureRef} className="min-w-0 flex-1">
                        {practiceModeEnabled && (
                          <div className="mb-2 flex items-baseline justify-between border-b border-slate-200 pb-2">
                            {canvas.editors.length > 1 ? (
                              <details className="group relative">
                                <summary
                                  className="-ml-2 flex cursor-pointer list-none items-center gap-2 rounded-lg border border-transparent px-2 py-1 text-left transition hover:border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                  aria-label={`Switch practice track. Current track: ${lane.name || `Track ${index + 1}`}`}
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                                      Switch track
                                    </span>
                                    <span className="block max-w-56 truncate text-sm font-semibold text-slate-800">
                                      {lane.name || `Track ${index + 1}`}
                                    </span>
                                  </span>
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition group-open:rotate-180 group-open:bg-slate-200" aria-hidden="true">
                                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                                      <path d="M5.5 7.5 10 12l4.5-4.5 1.1 1.1L10 14.2 4.4 8.6z" />
                                    </svg>
                                  </span>
                                </summary>
                                <div
                                  className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                                  role="group"
                                  aria-label="Choose a track to practice"
                                >
                                  <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                                    Choose a track
                                  </div>
                                  {canvas.editors.map((candidate, candidateIndex) => {
                                      const candidateId =
                                        candidate.id || `ed-${candidateIndex + 1}`;
                                      const selected = candidateId === globalControlsLaneId;
                                      const candidateInstrument =
                                        trackInstrumentOptions.find(
                                          (option) =>
                                            option.id ===
                                            normalizeTrackInstrumentId(candidate.instrumentId)
                                        )?.label || "Guitar";
                                      // Drum tracks stay audible (mute/solo/volume) but cannot be viewed in practice mode.
                                      const candidateIsDrum = isDrumLane(candidate);
                                      const candidateMuted = Boolean(trackMuteById[candidateId]);
                                      const candidateIsolated = isolatedTrackId === candidateId;
                                      const candidateVolume = normalizeTrackVolume(
                                        trackVolumeById[candidateId] ?? 1
                                      );
                                      return (
                                        <div
                                          key={candidateId}
                                          className={`flex items-center gap-1 rounded-lg px-1 py-1 transition ${
                                            selected
                                              ? "bg-emerald-50 text-emerald-950"
                                              : "text-slate-700 hover:bg-slate-50"
                                          }`}
                                          role="group"
                                          aria-label={`Sound controls for ${candidate.name || `Track ${candidateIndex + 1}`}`}
                                        >
                                          <button
                                            type="button"
                                            aria-pressed={selected}
                                            disabled={candidateIsDrum}
                                            title={
                                              candidateIsDrum
                                                ? "Drum tracks can't be viewed in practice mode"
                                                : undefined
                                            }
                                            onClick={(event) => {
                                              if (candidateIsDrum) return;
                                              setActiveLaneId(candidateId);
                                              const picker = event.currentTarget.closest("details");
                                              if (picker) picker.open = false;
                                            }}
                                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left ${
                                              candidateIsDrum ? "cursor-default text-slate-400" : ""
                                            }`}
                                          >
                                            <span
                                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                                candidateIsDrum
                                                  ? "border-slate-200 bg-slate-100"
                                                  : selected
                                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                                  : "border-slate-300 bg-white"
                                              }`}
                                              aria-hidden="true"
                                            >
                                              {selected && !candidateIsDrum && (
                                                <svg viewBox="0 0 20 20" className="h-3 w-3 fill-current">
                                                  <path d="m7.8 13.7-3.4-3.4 1.2-1.2 2.2 2.2 6.6-6.6 1.2 1.2z" />
                                                </svg>
                                              )}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                              <span className="block truncate text-xs font-semibold">
                                                {candidate.name || `Track ${candidateIndex + 1}`}
                                              </span>
                                              <span className="block truncate text-[10px] text-slate-500">
                                                {candidateIsDrum
                                                  ? `Track ${candidateIndex + 1} · Drums (sound only)`
                                                  : isChordLane(candidate)
                                                  ? `Track ${candidateIndex + 1} · Chords`
                                                  : candidateInstrument}
                                              </span>
                                            </span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => toggleTrackMute(candidateId)}
                                            aria-pressed={candidateMuted}
                                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[9px] font-bold transition ${
                                              candidateMuted
                                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                            }`}
                                            title={candidateMuted ? "Unmute track" : "Mute track"}
                                            aria-label={`${candidateMuted ? "Unmute" : "Mute"} ${candidate.name || `Track ${candidateIndex + 1}`}`}
                                          >
                                            M
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => toggleTrackIsolation(candidateId)}
                                            aria-pressed={candidateIsolated}
                                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[9px] font-bold transition ${
                                              candidateIsolated
                                                ? "border-sky-300 bg-sky-50 text-sky-800"
                                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                            }`}
                                            title={candidateIsolated ? "Stop soloing track" : "Solo track"}
                                            aria-label={`${candidateIsolated ? "Stop soloing" : "Solo"} ${candidate.name || `Track ${candidateIndex + 1}`}`}
                                          >
                                            S
                                          </button>
                                          <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.01}
                                            value={candidateVolume}
                                            onChange={(event) =>
                                              handleTrackVolumePreview(candidateId, Number(event.target.value))
                                            }
                                            onPointerUp={() => commitTrackVolume(candidateId)}
                                            onPointerCancel={() => commitTrackVolume(candidateId)}
                                            onBlur={() => commitTrackVolume(candidateId)}
                                            className="w-12 shrink-0 accent-slate-700"
                                            title={`Volume ${Math.round(candidateVolume * 100)}%`}
                                            aria-label={`Volume for ${candidate.name || `Track ${candidateIndex + 1}`}`}
                                          />
                                        </div>
                                      );
                                    })}
                                </div>
                              </details>
                            ) : (
                              <h3 className="text-sm font-semibold text-slate-800">
                                {isChordLane(lane)
                                  ? `Track ${index + 1} · ${lane.name || "Chords"}`
                                  : lane.name || `Track ${index + 1}`}
                              </h3>
                            )}
                            <div className="flex items-center gap-2">
                              {!isChordLane(lane) && practiceChordLaneOptions.length > 0 && (
                                <label className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-500">
                                  <span>Chord overlay</span>
                                  <select
                                    value={practiceChordOverlayLaneId ?? ""}
                                    onChange={(event) =>
                                      setPracticeChordOverlayLaneId(event.target.value || null)
                                    }
                                    className="max-w-32 bg-transparent text-[10px] font-semibold text-slate-700 outline-none"
                                    aria-label="Chord overlay"
                                  >
                                    <option value="">None</option>
                                    {practiceChordLaneOptions.map(
                                      ({ lane: chordLane, laneId: chordLaneId, trackNumber }) => {
                                        return (
                                          <option key={chordLaneId} value={chordLaneId}>
                                            {`Track ${trackNumber} · ${chordLane.name || "Chords"}`}
                                          </option>
                                        );
                                      }
                                    )}
                                  </select>
                                </label>
                              )}
                              <span className="text-[11px] text-slate-500">
                                {isChordLane(lane) ? "Chords" : instrumentLabel} · {laneBarCount} bars
                              </span>
                            </div>
                          </div>
                        )}
                        <GteWorkspace
                          editorId={laneEditorRef}
                          snapshot={lane}
                          timingMap={canvas.timingMap}
                          onSnapshotChange={(nextSnapshot, options) =>
                            handleLaneSnapshotChange(laneId, nextSnapshot, options)
                          }
                          allowBackend
                          embedded
                          isActive={isActive}
                          mobileViewport={isMobileViewport}
                          playbackUiVisible={laneId === globalControlsLaneId}
                          onFocusWorkspace={
                            practiceModeEnabled ? undefined : () => activateLaneForEditing(laneId)
                          }
                          tabViewEnabled={tabViewEnabled}
                          globalSnapToGridEnabled={globalSnapToGridEnabled}
                          onGlobalSnapToGridEnabledChange={setGlobalSnapToGridEnabled}
                          snapSubdivisionsPerBeat={globalSnapSubdivisionsPerBeat}
                          showBarNumbers={displayPreferences.showBarNumbers}
                          showTimeRuler={displayPreferences.showTimeRuler}
                          showPlaybackCounter={displayPreferences.showPlaybackCounter}
                          globalSnapToKeyEnabled={globalSnapToKeyEnabled}
                          onGlobalSnapToKeyEnabledChange={setGlobalSnapToKeyEnabled}
                          generatePlayingCoordinatesRequest={generatePlayingCoordinatesRequest}
                          defaultNoteLengthDenominator={chordOnlyDefaultNoteLengthDenominator}
                          onDefaultNoteLengthDenominatorChange={setChordOnlyDefaultNoteLengthDenominator}
                          cursorSizeDenominator={chordOnlyCursorSizeDenominator}
                          onCursorSizeDenominatorChange={setChordOnlyCursorSizeDenominator}
                          leftHandedChordDiagrams={leftHandedChordDiagrams}
                          editMenuPortalTarget={
                            laneId === editMenuOwnerLaneId ? editMenuPortalTarget : null
                          }
                          editMenuDisabled={editMenuDisabled || practiceModeEnabled}
                          onEditMenuPointerEnter={cancelEditMenuClose}
                          onEditMenuPointerLeave={scheduleEditMenuClose}
                          canvasKeyBase={normalizeKeyBase(canvas.keyBase)}
                          canvasKeyType={normalizeKeyType(canvas.keyType)}
                          sharedTimeSignature={normalizeTimeSignature(canvas.editors[0]?.timeSignature) ?? 8}
                          sharedTimeSignatureBottom={normalizeTimeSignatureBottom(canvas.editors[0]?.timeSignatureBottom) ?? 4}
                          sharedViewportBarCount={sharedViewportBarCount}
                          sharedTimelineBaseScale={sharedTimelineBaseScale}
                          onSharedTimelineScrollRatioChange={handleSharedTimelineScrollRatioChange}
                          timelineZoomFactor={
                            practiceModeEnabled
                              ? Math.min(timelineZoomPercent / 100, 0.5)
                              : timelineZoomPercent / 100
                          }
                          historyUndoCount={canvasUndoCount}
                          historyRedoCount={canvasRedoCount}
                          onRequestUndo={handleCanvasUndo}
                          onRequestRedo={handleCanvasRedo}
                          globalPlaybackFrame={globalPlaybackCounterFrame}
                          getGlobalPlaybackFrame={getGlobalPlaybackFrame}
                          globalPlaybackIsPlaying={globalPlaybackIsPlaying}
                          globalPlaybackIsPreparing={globalPlaybackIsPreparing}
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
                          practiceMode={practiceModeEnabled}
                          practiceChordOverlay={
                            practiceModeEnabled && !isChordLane(lane)
                              ? practiceChordOverlay
                              : null
                          }
                          onPracticeNotePlay={
                            practiceModeEnabled ? playPracticeFromFrame : undefined
                          }
                          practiceFingeringsVisible={practiceChordFingeringsVisible}
                          practiceFocusBarRange={
                            practiceFocusEnabled && barSelection?.laneId === laneId && barSelection.barIndices.length
                              ? {
                                  startBar: Math.min(...barSelection.barIndices),
                                  endBar: Math.max(...barSelection.barIndices) + 1,
                                }
                              : null
                          }
                          practiceRatingReplay={
                            selectedPracticeRating?.laneId === laneId ? selectedPracticeRating : null
                          }
                          practiceControlsVisible={false}
                          showToolbarWhenInactive={!practiceModeEnabled && laneId === globalControlsLaneId}
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
            {!practiceModeEnabled && (!isMobileViewport || !mobileEditLaneId) && (
              <div className="relative flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setAddTrackMenuOpen((open) => !open)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={addingLane}
                  title={addingLane ? "Adding track..." : "Add track"}
                  aria-label={addingLane ? "Adding track" : "Add track"}
                  aria-expanded={addTrackMenuOpen}
                  aria-haspopup="menu"
                >
                  <span className="text-base leading-none" aria-hidden="true">+</span>
                  <span>{addingLane ? "Adding…" : "Add track"}</span>
                </button>
                {addTrackMenuOpen && (
                  <div
                    className="absolute bottom-11 z-30 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
                    role="menu"
                    aria-label="Add track"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                      onClick={() => void handleAddLane("tab")}
                      disabled={addingLane}
                    >
                      <span>Tab</span>
                      <span className="text-xs text-slate-400">Track</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                      onClick={() => void handleAddLane("chords")}
                      disabled={addingLane}
                    >
                      <span>Chords</span>
                      <span className="text-xs text-slate-400">Track</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                      onClick={() => void handleAddLane("drums")}
                      disabled={addingLane}
                    >
                      <span>Drums</span>
                      <span className="text-xs text-slate-400">Track</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {confirmDeleteTrackId && (
          <div
            className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/30 px-4"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !deletingLaneId) setConfirmDeleteTrackId(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="remove-track-dialog-title"
              aria-describedby="remove-track-dialog-description"
            >
              <h2 id="remove-track-dialog-title" className="text-base font-semibold text-slate-900">
                Remove track?
              </h2>
              <p id="remove-track-dialog-description" className="mt-2 text-sm text-slate-600">
                This will permanently delete the track and its notes/chords. You cannot undo this action.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() => setConfirmDeleteTrackId(null)}
                  disabled={Boolean(deletingLaneId)}
                  autoFocus
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

        {pendingLaneTuningChange && (
          <div
            className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/35 px-4"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeLaneTuningPrompt();
            }}
          >
            <div
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tuning-dialog-title"
              aria-describedby="tuning-dialog-description"
            >
              <h2 id="tuning-dialog-title" className="text-base font-semibold text-slate-900">
                Adjust notes/chords to keep the sound?
              </h2>
              <p id="tuning-dialog-description" className="mt-2 text-sm text-slate-600">
                Notes/Chords have different fingerings on different tunings. 
                Automatically adjust them to keep the same sound.
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={closeLaneTuningPrompt}
                  autoFocus
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() => resolveLaneTuningPrompt(false)}
                >
                  Change tuning only
                </button>
                <button
                  type="button"
                  className="button-primary button-small"
                  onClick={() => resolveLaneTuningPrompt(true)}
                >
                  Adjust notes/chords
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {findKeyDialogOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/30 px-4"
          role="presentation"
          onMouseDown={() => setFindKeyDialogOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="find-key-dialog-title"
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setFindKeyDialogOpen(false);
            }}
          >
            <h2 id="find-key-dialog-title" className="text-base font-semibold text-slate-900">
              Choose a likely key
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Note2Tabs compares the notes and chords in this project. Relative match scores rank these choices only; they are not probabilities.
            </p>
            <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Likely song keys">
              {keyDetectionMatches.length ? (
                keyDetectionMatches.map((candidate, index) => {
                  const value = `${candidate.rootKey}:${candidate.scaleType}`;
                  const selected = selectedKeyCandidate === value;
                  return (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                        selected
                          ? "border-sky-400 bg-sky-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="detected-key"
                        value={value}
                        checked={selected}
                        onChange={() => setSelectedKeyCandidate(value)}
                        className="accent-sky-600"
                      />
                      <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                        {candidate.root} {candidate.scaleType}
                      </span>
                      <span className="text-right text-[10px] font-medium text-slate-500">
                        {index === 0 ? "Closest match" : `Relative match ${candidate.relativeMatch}/100`}
                      </span>
                    </label>
                  );
                })
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                  Add some notes or chords before detecting the key.
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFindKeyDialogOpen(false)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinueFindKey}
                disabled={!selectedKeyCandidate}
                className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply key
              </button>
            </div>
          </div>
        </div>
      )}
      {!isMobileViewport && chordOnlyCanvas && (
        <div
          data-gte-floating-ui="true"
          className="pointer-events-none fixed bottom-16 left-1/2 z-[9997] w-[min(calc(100vw-2rem),64rem)] -translate-x-1/2 px-2"
        >
          <div className="relative flex flex-col items-center gap-3 md:min-h-[3.5rem] md:justify-center">
            {displayPreferences.showPlaybackCounter && (
              <span
                className="pointer-events-auto absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-slate-200 bg-white/95 px-2 py-1 text-[10px] font-semibold tabular-nums text-slate-600 shadow-sm"
                role="timer"
                aria-label="Playback time"
              >
                {formatPlaybackTime(globalPlaybackCounterFrame / globalPlaybackFps)} / {formatPlaybackTime(canvasTimelineEnd / globalPlaybackFps)}
              </span>
            )}
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 py-1.5 text-slate-700 shadow-sm backdrop-blur">
                <button
                  type="button"
                  onClick={skipGlobalPlaybackToStart}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100"
                  title="Go to start"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <rect x="4" y="5" width="2" height="14" />
                    <polygon points="18,5 8,12 18,19" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={skipGlobalPlaybackBackwardBar}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100"
                  title="Previous bar"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <polygon points="17,5 7,12 17,19" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={toggleGlobalPlayback}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700"
                  title={globalPlaybackIsPlaying ? "Pause" : "Play"}
                >
                  {globalPlaybackIsPlaying ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <rect x="6" y="5" width="4" height="14" />
                      <rect x="14" y="5" width="4" height="14" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <polygon points="8,5 19,12 8,19" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={skipGlobalPlaybackForwardBar}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100"
                  title="Next bar"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <polygon points="7,5 17,12 7,19" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-slate-700 shadow-sm backdrop-blur">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-slate-500" aria-hidden="true">
                    <path d="M4 10v4h4l5 4V6L8 10H4z" />
                    <path d="M16 8a4 4 0 0 1 0 8v-2a2 2 0 0 0 0-4V8z" />
                  </svg>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={globalPlaybackVolume}
                    onChange={(event) => handleGlobalPlaybackVolumeChange(Number(event.target.value))}
                    className="w-20 accent-slate-700"
                    title="Volume"
                  />
              </div>
            </div>
          </div>
        </div>
      )}
      {canvas && !practiceModeEnabled && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur">

          <div className="container gte-wide py-1">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-1 shadow-sm">
              <label className="hidden w-48 shrink-0 items-center gap-2 text-xs font-medium text-slate-600 sm:flex">
                <span>Zoom</span>
                <input
                  type="range"
                  min={TIMELINE_ZOOM_MIN}
                  max={TIMELINE_ZOOM_MAX}
                  step={1}
                  value={timelineZoomPercent}
                  onChange={(event) => setTimelineZoomPercent(Number(event.target.value))}
                  className="min-w-0 flex-1"
                  aria-label="Timeline zoom"
                />
                <span className="w-9 text-right tabular-nums">{timelineZoomPercent}%</span>
              </label>
              <div
                ref={globalTimelineScrollbarRef}
                data-gte-timeline-control="true"
                role="region"
                className="h-5 min-w-0 flex-1 overflow-x-scroll overflow-y-hidden"
                onScroll={handleGlobalTimelineScrollbarScroll}
                tabIndex={0}
                aria-label="Scroll all tracks horizontally"
              >
                <div style={{ width: globalTimelineTrackWidth, height: 1 }} />
              </div>
            </div>
          </div>
        </div>
      )}
      {trackContextMenu && (
        <div
          data-track-menu="true"
          className="fixed z-[10040] w-44 rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-xl"
          style={{ left: trackContextMenu.x, top: trackContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => beginTrackOffset(trackContextMenu.laneId)}
            className="block w-full px-3 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50"
          >
            Offset track…
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            disabled={canvas?.editors.findIndex((lane) => lane.id === trackContextMenu.laneId) === 0}
            onClick={() => handleMoveTrackBy(trackContextMenu.laneId, -1)}
            className="block w-full px-3 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
          >
            Move up
          </button>
          <button
            type="button"
            disabled={
              !canvas ||
              canvas.editors.findIndex((lane) => lane.id === trackContextMenu.laneId) ===
                canvas.editors.length - 1
            }
            onClick={() => handleMoveTrackBy(trackContextMenu.laneId, 1)}
            className="block w-full px-3 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
          >
            Move down
          </button>
        </div>
      )}
      {trackOffsetSession && (
        <div
          className="fixed inset-0 z-[10030] cursor-ew-resize touch-none select-none bg-sky-950/[0.04]"
          role="application"
          aria-label="Offset track in whole-bar steps"
          onPointerDown={handleTrackOffsetPointerDown}
          onPointerMove={handleTrackOffsetPointerMove}
          onPointerUp={handleTrackOffsetPointerUp}
          onPointerCancel={() => void finishTrackOffset(false)}
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-sky-200/30 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-sky-200/30 to-transparent" />
          <div
            className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-sky-200 bg-white/95 px-4 py-2 text-xs text-slate-700 shadow-xl backdrop-blur"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span className="font-semibold">Drag left or right</span>
            <span className="tabular-nums text-sky-700">
              Bar {trackOffsetSession.previewOffsetFrames / FIXED_FRAMES_PER_BAR + 1}
            </span>
            <button
              type="button"
              onClick={() => void finishTrackOffset(false)}
              className="rounded-md border border-slate-200 px-2 py-1 font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void finishTrackOffset(true)}
              className="rounded-md bg-sky-600 px-2 py-1 font-semibold text-white hover:bg-sky-500"
            >
              Done
            </button>
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300 bg-white/90 px-5 py-2 text-lg font-bold tracking-[0.3em] text-sky-700 shadow-lg">
            ← DRAG →
          </div>
        </div>
      )}
      {pendingMeterChange && canvas && (
        <div className="dialog-scrim" onMouseDown={() => !timeSignatureSaving && cancelMeterChange()}>
          <div
            className="dialog-card max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meter-change-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="stack-tight">
              <h2 id="meter-change-title" className="page-title" style={{ fontSize: "1.25rem" }}>
                Change to {pendingMeterChange.numerator}/{pendingMeterChange.denominator}?
              </h2>
              <p className="muted text-small">
                {barSelection?.barIndices.length
                  ? `This applies to ${barSelection.barIndices.length} selected bar${barSelection.barIndices.length === 1 ? "" : "s"}.`
                  : "This applies to every bar."}
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => void resolveMeterChange("adjust")}
                disabled={timeSignatureSaving}
                className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-left text-sm text-sky-950"
              >
                <span className="block font-semibold">Adjust musical content</span>
                <span className="mt-1 block text-xs leading-5 text-sky-800">
                  Scale notes, chords, cuts, and drum loops inside the affected bars so their beat positions follow the new meter.
                </span>
              </button>
              <button
                type="button"
                onClick={() => void resolveMeterChange("keep")}
                disabled={timeSignatureSaving}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-800"
              >
                <span className="block font-semibold">Keep content in place</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Change the meter and timing anchors without moving notes or chords.
                </span>
              </button>
            </div>
            <div className="button-row mt-5" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button-secondary button-small"
                onClick={cancelMeterChange}
                disabled={timeSignatureSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {timingDialogOpen && canvas && (
        <div
          className="dialog-scrim"
          onMouseDown={() => !timingSaving && setTimingDialogOpen(false)}
        >
          <div
            className="dialog-card max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bar-tempo-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="stack-tight">
              <h2 id="bar-tempo-title" className="page-title" style={{ fontSize: "1.25rem" }}>Bar tempo</h2>
              <p className="muted text-small">
                Set a precise tempo without moving any notes. Playback, seeking, the metronome, MIDI, and MusicXML use the same timing map.
              </p>
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              BPM
              <input
                type="number"
                min={40}
                max={240}
                step={0.1}
                value={timingBpmDraft}
                onChange={(event) => setTimingBpmDraft(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"
                autoFocus
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tempo range">
              <button
                type="button"
                role="radio"
                aria-checked={!timingApplyToAll}
                onClick={() => setTimingApplyToAll(false)}
                disabled={!barSelection?.barIndices.length}
                className={`rounded-xl border px-3 py-3 text-left text-sm ${
                  !timingApplyToAll
                    ? "border-sky-400 bg-sky-50 text-sky-900"
                    : "border-slate-200 text-slate-600"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span className="block font-semibold">Selected bars</span>
                <span className="mt-1 block text-xs opacity-70">
                  {barSelection?.barIndices.length || 0} selected
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={timingApplyToAll}
                onClick={() => setTimingApplyToAll(true)}
                className={`rounded-xl border px-3 py-3 text-left text-sm ${
                  timingApplyToAll
                    ? "border-sky-400 bg-sky-50 text-sky-900"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <span className="block font-semibold">All bars</span>
                <span className="mt-1 block text-xs opacity-70">Entire song</span>
              </button>
            </div>
            <div className="button-row mt-5" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => setTimingDialogOpen(false)}
                disabled={timingSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary button-small"
                onClick={() => void commitTimingBpm()}
                disabled={timingSaving}
              >
                {timingSaving ? "Saving…" : "Set tempo"}
              </button>
            </div>
          </div>
        </div>
      )}
      {mergeTracksDialogOpen && canvas && (
        <div
          className="dialog-scrim"
          onMouseDown={() => !mergeTracksBusy && setMergeTracksDialogOpen(false)}
        >
          <div
            className="dialog-card max-w-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="merge-tracks-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="stack-tight">
              <h2 id="merge-tracks-title" className="page-title" style={{ fontSize: "1.25rem" }}>Merge tracks</h2>
              <p className="muted text-small">
                Notes and chords are combined into one optimized track. The original tracks are removed.
              </p>
            </div>
            <div className="mt-4 grid max-h-72 gap-2 overflow-y-auto">
              {canvas.editors.map((lane) => {
                const checked = mergeTrackIds.includes(lane.id);
                return (
                  <label
                    key={`merge-track-${lane.id}`}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 ${
                      checked ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setMergeTrackIds((current) =>
                          event.target.checked
                            ? [...current, lane.id]
                            : current.filter((laneId) => laneId !== lane.id)
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {lane.name || "Untitled track"}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {isDrumLane(lane) ? "Drums" : `${lane.notes.length} notes · ${lane.chords.length} chords`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Drum tracks can only be merged with other drum tracks. The upper selected track supplies the tuning.
            </p>
            <div className="button-row mt-5" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => setMergeTracksDialogOpen(false)}
                disabled={mergeTracksBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary button-small"
                onClick={() => void commitTrackMerge()}
                disabled={mergeTracksBusy || mergeTrackIds.length < 2}
              >
                {mergeTracksBusy ? "Merging…" : "Create merged track"}
              </button>
            </div>
          </div>
        </div>
      )}
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
