import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  type UIEvent as ReactUiEvent,
} from "react";
import { gteApi } from "../lib/gteApi";
import {
  PLAYBACK_SPEED_OPTIONS,
  SPEED_TRAINER_STEP_OPTIONS,
  SPEED_TRAINER_TARGET_OPTIONS,
  buildMetronomeClicks,
  frameDeltaToSeconds,
  nextSpeedTrainerValue,
  normalizePlaybackSpeed,
  resolvePracticeLoopRange,
  type PracticeLoopRange,
} from "../lib/gtePractice";
import {
  prepareTrackInstrument,
  schedulePreparedTrackNote,
  warmTrackInstrument,
} from "../lib/gteSoundfonts";
import { getOpenStringMidiFromSnapshot, getStringLabelsForSnapshot } from "../lib/gteTuning";
import { nextLocalChordId, nextLocalNoteId } from "../lib/gteLocalEditorOps";
import type { CutWithCoord, EditorSnapshot, TabCoord } from "../types/gte";
import TabViewer from "./TabViewer";
import { buildTabTextFromSnapshot } from "../lib/gteTabText";

type Props = {
  editorId: string;
  snapshot: EditorSnapshot;
  onSnapshotChange: (snapshot: EditorSnapshot, options?: { recordHistory?: boolean }) => void;
  allowBackend?: boolean;
  embedded?: boolean;
  isActive?: boolean;
  onFocusWorkspace?: () => void;
  globalSnapToGridEnabled?: boolean;
  onGlobalSnapToGridEnabledChange?: (enabled: boolean) => void;
  sharedTimeSignature?: number;
  sharedViewportBarCount?: number;
  sharedTimelineScrollRatio?: number;
  onSharedTimelineScrollRatioChange?: (next: number) => void;
  timelineZoomFactor?: number;
  historyUndoCount?: number;
  historyRedoCount?: number;
  onRequestUndo?: () => void;
  onRequestRedo?: () => void;
  globalPlaybackFrame?: number;
  globalPlaybackIsPlaying?: boolean;
  globalPlaybackVolume?: number;
  globalPlaybackTimelineEnd?: number;
  onGlobalPlaybackToggle?: () => void;
  onGlobalPlaybackFrameChange?: (frame: number) => void;
  onGlobalPlaybackVolumeChange?: (volume: number) => void;
  onGlobalPlaybackSkipToStart?: () => void;
  onGlobalPlaybackSkipBackwardBar?: () => void;
  onGlobalPlaybackSkipForwardBar?: () => void;
  practiceLoopEnabled?: boolean;
  practiceLoopRange?: PracticeLoopRange | null;
  onPracticeLoopEnabledChange?: (enabled: boolean) => void;
  metronomeEnabled?: boolean;
  onMetronomeEnabledChange?: (enabled: boolean) => void;
  countInEnabled?: boolean;
  onCountInEnabledChange?: (enabled: boolean) => void;
  speedTrainerEnabled?: boolean;
  onSpeedTrainerEnabledChange?: (enabled: boolean) => void;
  speedTrainerTarget?: number;
  onSpeedTrainerTargetChange?: (target: number) => void;
  speedTrainerStep?: number;
  onSpeedTrainerStepChange?: (step: number) => void;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  showToolbarWhenInactive?: boolean;
  selectionClearEpoch?: number;
  selectionClearExemptEditorId?: string | null;
  barSelectionClearEpoch?: number;
  barSelectionClearExemptEditorId?: string | null;
  multiTrackSelectionActive?: boolean;
  onSelectionStateChange?: (selection: {
    noteCount: number;
    chordCount: number;
    noteIds: number[];
    chordIds: number[];
  }) => void;
  onRequestGlobalSelectedShift?: (deltaFrames: number) => boolean | void;
  onBarSelectionStateChange?: (barIndices: number[]) => void;
  onRequestSelectedBarsCopy?: (barIndices: number[]) => void | Promise<void>;
  onRequestSelectedBarsPaste?: (insertIndex: number) => void | Promise<void>;
  onRequestSelectedBarsDelete?: (barIndices: number[]) => void | Promise<void>;
  barClipboardAvailable?: boolean;
  activeBarDrag?: { sourceLaneId: string; barIndices: number[] } | null;
  onBarDragStart?: (barIndices: number[]) => void;
  onBarDragEnd?: () => void;
  onRequestBarDrop?: (insertIndex: number) => void | Promise<void>;
  mobileViewport?: boolean;
  mobileMode?: "canvas" | "edit";
};

type ContextMenuState =
  | {
      x: number;
      y: number;
      kind: "timeline";
      targetFrame: number;
    }
  | {
      x: number;
      y: number;
      kind: "bar";
      insertIndex: number;
    };

const DEFAULT_STRING_LABELS = ["E", "B", "G", "D", "A", "E"];
const ROW_HEIGHT = 24;
const ROW_GAP = 80;
const BARS_PER_ROW = 3;
const DEFAULT_NOTE_LENGTH = 20;
const DEFAULT_MAX_FRET = 22;
const MAX_EVENT_LENGTH_FRAMES = 800;
const FIXED_FRAMES_PER_BAR = 480;
const DEFAULT_SECONDS_PER_BAR = 2;
const DEFAULT_CUT_COORD: TabCoord = [2, 0];
const CUT_SEGMENT_HEIGHT = 20;
const CUT_SEGMENT_OFFSET = 14;
const CUT_SEGMENT_MIN_WIDTH = 28;
const CUT_BOUNDARY_OVERHANG = 12;
const MAX_HISTORY = 16;
const AUTOSAVE_DEBOUNCE_MS = 2500;
const AUTOSAVE_INTERVAL_MS = 20000;
const NOTE_FRET_ARROW_COMMIT_DEBOUNCE_MS = 300;
const TOUCH_DRAG_HOLD_MS = 110;
const KEYBOARD_FRET_TYPE_TIMEOUT_MS = 1200;
const TARGET_VISIBLE_BARS = 2.5;
const MIN_TIMELINE_ZOOM = 0.1;
const MAX_TIMELINE_ZOOM = 2.5;
const STREAMLINE_TOOLBAR_ICONS = {
  chordize: "/icons/toolbar/make-chord.png",
  disband: "/icons/toolbar/disband.png",
  optimize: "/icons/toolbar/optimize.png",
  join: "/icons/toolbar/join.png",
  slice: "/icons/toolbar/slice.png",
  generate: "/icons/toolbar/generate.png",
  cut: "/icons/toolbar/cut.png",
  merge: "/icons/toolbar/merge.png",
} as const;
const SCALE_TOOL_MODE_STORAGE_KEY = "gte-scale-tool-mode-v1";
const SCALE_FACTOR_MIN = 0.1;
const SCALE_FACTOR_MAX = 8;
const SCALE_FACTOR_DRAG_PIXELS = 240;
const SINGLE_DRAG_ACTIVATION_DISTANCE_PX = 3;
const SCALE_TOOL_MODES = ["length", "start", "both"] as const;

const fpsFromSecondsPerBar = (secondsPerBar: number) => {
  const safeSeconds = Math.max(0.1, secondsPerBar);
  return Math.max(1, Math.round(FIXED_FRAMES_PER_BAR / safeSeconds));
};

const normalizeBpm = (value: unknown) => {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return null;
  return Math.max(1, next);
};

const secondsPerBarToBpm = (secondsPerBar: number, beatsPerBar: number) => {
  const safeSeconds = Math.max(0.1, secondsPerBar);
  const safeBeats = Math.max(1, Math.min(64, Math.round(beatsPerBar)));
  return (60 / safeSeconds) * safeBeats;
};

const bpmToSecondsPerBar = (bpm: unknown, beatsPerBar: number) => {
  const normalizedBpm = normalizeBpm(bpm);
  if (!normalizedBpm) return null;
  const safeBeats = Math.max(1, Math.min(64, Math.round(beatsPerBar)));
  return Math.max(0.1, (60 / normalizedBpm) * safeBeats);
};

const formatBpm = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const isScaleToolMode = (value: unknown): value is ScaleToolMode =>
  typeof value === "string" && SCALE_TOOL_MODES.includes(value as ScaleToolMode);

const formatScaleFactor = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const clampEventLength = (length: number) =>
  Math.max(1, Math.min(MAX_EVENT_LENGTH_FRAMES, Math.round(length)));

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

type OptionalNumber = number | null;
type OptionalTabCoord = [OptionalNumber, OptionalNumber];

const parseOptionalNumber = (value: string): OptionalNumber => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const cloneTabCoord = (tab: TabCoord): TabCoord => [tab[0], tab[1]];

const getMaxFret = (snapshot: Pick<EditorSnapshot, "tabRef">) =>
  snapshot.tabRef?.[0]?.length ? snapshot.tabRef[0].length - 1 : DEFAULT_MAX_FRET;

const isTabCoordValidForSnapshot = (snapshot: Pick<EditorSnapshot, "tabRef">, tab: TabCoord) => {
  const maxFret = getMaxFret(snapshot);
  return (
    Number.isInteger(tab[0]) &&
    Number.isInteger(tab[1]) &&
    tab[0] >= 0 &&
    tab[0] <= 5 &&
    tab[1] >= 0 &&
    tab[1] <= maxFret
  );
};

const clampTabCoordInSnapshot = (snapshot: Pick<EditorSnapshot, "tabRef">, tab?: TabCoord | null): TabCoord => {
  const maxFret = getMaxFret(snapshot);
  const source = tab ?? DEFAULT_CUT_COORD;
  const stringIndex = Number.isFinite(source[0]) ? Math.max(0, Math.min(5, Math.round(source[0]))) : 0;
  const fret = Number.isFinite(source[1])
    ? Math.max(0, Math.min(maxFret, Math.round(source[1])))
    : Math.min(maxFret, DEFAULT_CUT_COORD[1]);
  return [stringIndex, fret];
};

const buildDefaultCutRegions = (draft: EditorSnapshot): CutWithCoord[] => {
  const totalFrames = Math.max(FIXED_FRAMES_PER_BAR, Math.round(draft.totalFrames || FIXED_FRAMES_PER_BAR));
  return [[[0, totalFrames], clampTabCoordInSnapshot(draft, DEFAULT_CUT_COORD)]];
};

const isSameTabCoord = (left: TabCoord, right: TabCoord) =>
  left[0] === right[0] && left[1] === right[1];

const normalizeCutRegions = (draft: EditorSnapshot, regions: CutWithCoord[]): CutWithCoord[] => {
  const totalFrames = Math.max(FIXED_FRAMES_PER_BAR, Math.round(draft.totalFrames || FIXED_FRAMES_PER_BAR));
  const normalized = regions
    .map((entry) => {
      const start = Math.max(0, Math.min(totalFrames - 1, Math.round(entry[0]?.[0] ?? 0)));
      const end = Math.max(start + 1, Math.min(totalFrames, Math.round(entry[0]?.[1] ?? totalFrames)));
      return [[start, end], clampTabCoordInSnapshot(draft, entry[1])] as CutWithCoord;
    })
    .filter((entry) => entry[0][1] > entry[0][0])
    .sort((left, right) => left[0][0] - right[0][0]);
  return normalized.length ? normalized : buildDefaultCutRegions(draft);
};

const getCutRegions = (draft: EditorSnapshot) =>
  normalizeCutRegions(draft, Array.isArray(draft.cutPositionsWithCoords) ? draft.cutPositionsWithCoords : []);

const getAllTabsForMidi = (snapshot: Pick<EditorSnapshot, "tabRef">, midi: number): TabCoord[] => {
  const result: TabCoord[] = [];
  snapshot.tabRef?.forEach((stringValues, stringIndex) => {
    stringValues?.forEach((value, fret) => {
      if (Number(value) === midi) result.push([stringIndex, fret]);
    });
  });
  return result.length ? result : [clampTabCoordInSnapshot(snapshot, DEFAULT_CUT_COORD)];
};

const getCutCoordAtTime = (snapshot: EditorSnapshot, time: number): TabCoord => {
  const cuts = getCutRegions(snapshot);
  const roundedTime = Math.max(0, Math.round(time));
  const hit = cuts.find((entry) => roundedTime >= entry[0][0] && roundedTime < entry[0][1]);
  return clampTabCoordInSnapshot(snapshot, hit?.[1] ?? cuts[0]?.[1] ?? DEFAULT_CUT_COORD);
};

const tabKey = (tab: TabCoord) => `${tab[0]}:${tab[1]}`;

const scoreTabDistance = (tab: TabCoord, coord: TabCoord) =>
  Math.abs(tab[0] - coord[0]) + Math.abs(tab[1] - coord[1]);

const computeNoteAlternatesForSnapshot = (
  snapshot: EditorSnapshot,
  note: EditorSnapshot["notes"][number]
) => {
  const noteStart = Math.round(note.startTime);
  const noteEnd = noteStart + clampEventLength(note.length);
  // Keep parity with backend: midiNum can be 0 as a temporary/local placeholder,
  // so fall back to tab-derived MIDI unless midiNum is truthy.
  const midi = note.midiNum || getTabMidi(snapshot, note.tab);
  const candidates = getAllTabsForMidi(snapshot, midi);
  const blocked = new Set<string>();
  snapshot.notes.forEach((item) => {
    if (item.id === note.id) return;
    const start = Math.round(item.startTime);
    const end = start + clampEventLength(item.length);
    if (start < noteEnd && noteStart < end) {
      blocked.add(tabKey(item.tab));
    }
  });
  snapshot.chords.forEach((chord) => {
    const start = Math.round(chord.startTime);
    const end = start + clampEventLength(chord.length);
    if (start < noteEnd && noteStart < end) {
      chord.currentTabs.forEach((tab) => blocked.add(tabKey(tab)));
    }
  });
  const cutCoord = getCutCoordAtTime(snapshot, noteStart);
  const ranked = candidates
    .map((tab) => ({ tab, score: scoreTabDistance(tab, cutCoord), blocked: blocked.has(tabKey(tab)) }))
    .sort((left, right) => left.score - right.score || left.tab[0] - right.tab[0] || left.tab[1] - right.tab[1]);
  return {
    possibleTabs: ranked.filter((item) => !item.blocked).map((item) => item.tab),
    blockedTabs: ranked.filter((item) => item.blocked).map((item) => item.tab),
  };
};

const recomputeSnapshotOptimals = (snapshot: EditorSnapshot): EditorSnapshot => {
  const next = JSON.parse(JSON.stringify(snapshot)) as EditorSnapshot;
  next.notes = next.notes.map((note) => {
    const alternates = computeNoteAlternatesForSnapshot(next, note);
    return {
      ...note,
      optimals: alternates.possibleTabs.map((tab) => [tab[0], tab[1]] as TabCoord),
    };
  });
  return next;
};

const mergeRedundantCutRegions = (draft: EditorSnapshot, regions: CutWithCoord[]): CutWithCoord[] => {
  const merged: CutWithCoord[] = [];
  normalizeCutRegions(draft, regions).forEach(([region, coord]) => {
    const start = Math.round(region[0]);
    const end = Math.round(region[1]);
    const safeCoord = clampTabCoordInSnapshot(draft, coord);
    if (end <= start) return;
    const last = merged[merged.length - 1];
    if (last && isSameTabCoord(last[1], safeCoord)) {
      last[0][1] = Math.max(Math.round(last[0][1]), end);
      return;
    }
    merged.push([[start, end], cloneTabCoord(safeCoord)]);
  });
  return merged.length ? merged : buildDefaultCutRegions(draft);
};

const setCutRegionsInSnapshot = (draft: EditorSnapshot, regions: CutWithCoord[]) => {
  draft.cutPositionsWithCoords = normalizeCutRegions(draft, regions);
};

const applyManualCutsInSnapshot = (draft: EditorSnapshot, cutPositionsWithCoords: CutWithCoord[]) => {
  setCutRegionsInSnapshot(draft, cutPositionsWithCoords);
};

const insertCutAtInSnapshot = (draft: EditorSnapshot, time: number, coord?: TabCoord) => {
  const regions = getCutRegions(draft);
  const totalFrames = Math.max(FIXED_FRAMES_PER_BAR, Math.round(draft.totalFrames || FIXED_FRAMES_PER_BAR));
  if (totalFrames <= 1) return;
  const insertTime = Math.max(1, Math.min(totalFrames - 1, Math.round(time)));
  const targetIndex = regions.findIndex((entry) => entry[0][0] < insertTime && entry[0][1] > insertTime);
  if (targetIndex < 0) return;
  const [targetRegion, targetCoord] = regions[targetIndex];
  const next = [...regions];
  next.splice(
    targetIndex,
    1,
    [[targetRegion[0], insertTime], cloneTabCoord(targetCoord)],
    [[insertTime, targetRegion[1]], clampTabCoordInSnapshot(draft, coord ?? targetCoord)]
  );
  setCutRegionsInSnapshot(draft, next);
};

const shiftCutBoundaryInSnapshot = (draft: EditorSnapshot, boundaryIndex: number, newTime: number) => {
  const regions = getCutRegions(draft);
  if (boundaryIndex < 0 || boundaryIndex >= regions.length - 1) return;
  const left = regions[boundaryIndex];
  const right = regions[boundaryIndex + 1];
  const minTime = left[0][0] + 1;
  const maxTime = right[0][1] - 1;
  if (maxTime < minTime) return;
  const nextTime = Math.max(minTime, Math.min(maxTime, Math.round(newTime)));
  const next = [...regions];
  next[boundaryIndex] = [[left[0][0], nextTime], cloneTabCoord(left[1])];
  next[boundaryIndex + 1] = [[nextTime, right[0][1]], cloneTabCoord(right[1])];
  setCutRegionsInSnapshot(draft, next);
};

const deleteCutBoundaryInSnapshot = (draft: EditorSnapshot, boundaryIndex: number) => {
  const regions = getCutRegions(draft);
  if (boundaryIndex < 0 || boundaryIndex >= regions.length - 1) return;
  const left = regions[boundaryIndex];
  const right = regions[boundaryIndex + 1];
  const next = [...regions];
  next.splice(boundaryIndex, 2, [[left[0][0], right[0][1]], cloneTabCoord(left[1])]);
  setCutRegionsInSnapshot(draft, next);
};

const generateCutsInSnapshot = (draft: EditorSnapshot) => {
  const totalFrames = Math.max(FIXED_FRAMES_PER_BAR, Math.round(draft.totalFrames || FIXED_FRAMES_PER_BAR));
  const events = [
    ...draft.notes.map((note) => ({
      time: Math.max(0, Math.min(totalFrames, Math.round(note.startTime))),
      coord: clampTabCoordInSnapshot(draft, note.tab),
    })),
    ...draft.chords
      .filter((chord) => chord.currentTabs.length > 0)
      .map((chord) => ({
        time: Math.max(0, Math.min(totalFrames, Math.round(chord.startTime))),
        coord: clampTabCoordInSnapshot(draft, chord.currentTabs[0]),
      })),
  ].sort((left, right) => left.time - right.time);

  if (!events.length) {
    draft.cutPositionsWithCoords = buildDefaultCutRegions(draft);
    return;
  }

  const boundaries = Array.from(
    new Set(
      [0, ...events.map((event) => event.time).filter((time) => time > 0 && time < totalFrames), totalFrames].sort(
        (left, right) => left - right
      )
    )
  );

  const next: CutWithCoord[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) continue;
    let coord = clampTabCoordInSnapshot(draft, DEFAULT_CUT_COORD);
    for (const event of events) {
      if (event.time > start) break;
      coord = cloneTabCoord(event.coord);
    }
    next.push([[start, end], coord]);
  }
  setCutRegionsInSnapshot(draft, next);
};

const mergeRedundantCutRegionsInSnapshot = (draft: EditorSnapshot) => {
  draft.cutPositionsWithCoords = mergeRedundantCutRegions(draft, draft.cutPositionsWithCoords);
};

const applyBarOperationCleanupInSnapshot = (draft: EditorSnapshot) => {
  mergeRedundantCutRegionsInSnapshot(draft);
};

const cloneCutRegionsPayload = (regions: CutWithCoord[]): CutWithCoord[] =>
  regions.map((region) => [
    [region[0][0], region[0][1]],
    [region[1][0], region[1][1]],
  ]);

const cutRegionsEqual = (left: CutWithCoord[], right: CutWithCoord[]) => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftRegion = left[index];
    const rightRegion = right[index];
    if (
      leftRegion[0][0] !== rightRegion[0][0] ||
      leftRegion[0][1] !== rightRegion[0][1] ||
      leftRegion[1][0] !== rightRegion[1][0] ||
      leftRegion[1][1] !== rightRegion[1][1]
    ) {
      return false;
    }
  }
  return true;
};

const getTabMidi = (snapshot: EditorSnapshot, tab: TabCoord) => {
  const fromRef = snapshot.tabRef?.[tab[0]]?.[tab[1]];
  if (fromRef !== undefined && fromRef !== null && Number.isFinite(Number(fromRef))) {
    return Number(fromRef);
  }
  const openStrings = getOpenStringMidiFromSnapshot(snapshot);
  const base = openStrings[tab[0]];
  if (base !== undefined && Number.isFinite(tab[1])) {
    return base + tab[1];
  }
  return 0;
};

const removeNoteFromSnapshot = (draft: EditorSnapshot, noteId: number) => {
  draft.notes = draft.notes.filter((note) => note.id !== noteId);
};

const removeChordFromSnapshot = (draft: EditorSnapshot, chordId: number) => {
  draft.chords = draft.chords.filter((chord) => chord.id !== chordId);
};

const setChordTabsInSnapshot = (draft: EditorSnapshot, chordId: number, tabs: TabCoord[]) => {
  const chord = draft.chords.find((item) => item.id === chordId);
  if (!chord) return;
  chord.currentTabs = tabs.map((tab) => cloneTabCoord(tab));
};

const shiftChordOctaveInSnapshot = (
  draft: EditorSnapshot,
  chordId: number,
  direction: number
) => {
  const chord = draft.chords.find((item) => item.id === chordId);
  if (!chord) return;
  if (direction !== 1 && direction !== -1) return;
  const maxFret = getMaxFret(draft);
  const delta = direction * 12;
  chord.currentTabs = chord.currentTabs.map((tab) => [
    tab[0],
    Math.max(0, Math.min(maxFret, tab[1] + delta)),
  ]);
};

const disbandChordInSnapshot = (draft: EditorSnapshot, chordId: number) => {
  const chordIndex = draft.chords.findIndex((item) => item.id === chordId);
  if (chordIndex < 0) return;
  const chord = draft.chords[chordIndex];
  const nextNoteId = draft.notes.reduce((max, note) => Math.max(max, note.id), 0) + 1;
  const disbandedNotes = chord.currentTabs.map((tab, idx) => ({
    id: nextNoteId + idx,
    startTime: chord.startTime,
    length: chord.length,
    midiNum: getTabMidi(draft, tab),
    tab: cloneTabCoord(tab),
    optimals: [],
  }));
  draft.notes.push(...disbandedNotes);
  draft.chords.splice(chordIndex, 1);
};

const makeChordInSnapshot = (draft: EditorSnapshot, noteIds: number[]) => {
  const noteSet = new Set(noteIds);
  const chordNotes = draft.notes.filter((note) => noteSet.has(note.id));
  if (chordNotes.length < 2) return;
  chordNotes.sort((a, b) => a.startTime - b.startTime || a.tab[0] - b.tab[0]);
  const startTime = Math.min(...chordNotes.map((note) => note.startTime));
  const endTime = Math.max(
    ...chordNotes.map((note) => note.startTime + clampEventLength(note.length))
  );
  const length = clampEventLength(endTime - startTime);
  const nextChordId = draft.chords.reduce((max, chord) => Math.max(max, chord.id), 0) + 1;
  const tabs = chordNotes.map((note) => cloneTabCoord(note.tab));
  draft.chords.push({
    id: nextChordId,
    startTime,
    length,
    originalMidi: chordNotes.map((note) => note.midiNum),
    currentTabs: tabs,
    ogTabs: tabs.map((tab) => cloneTabCoord(tab)),
  });
  draft.notes = draft.notes.filter((note) => !noteSet.has(note.id));
};

const setSecondsPerBarInSnapshot = (draft: EditorSnapshot, secondsPerBar: number) => {
  const safeSeconds = Math.max(0.1, secondsPerBar);
  draft.framesPerMessure = FIXED_FRAMES_PER_BAR;
  draft.fps = fpsFromSecondsPerBar(safeSeconds);
  draft.secondsPerBar = safeSeconds;
  draft.totalFrames = Math.max(FIXED_FRAMES_PER_BAR, Math.round(draft.totalFrames || FIXED_FRAMES_PER_BAR));
};

const setTimeSignatureInSnapshot = (draft: EditorSnapshot, timeSignature: number) => {
  draft.timeSignature = Math.max(1, Math.min(64, Math.round(timeSignature)));
};

const addBarsInSnapshot = (draft: EditorSnapshot, count: number) => {
  const safeCount = Math.max(1, Math.round(count));
  const framesPerBar = FIXED_FRAMES_PER_BAR;
  draft.framesPerMessure = framesPerBar;
  draft.fps = fpsFromSecondsPerBar(
    Math.max(0.1, Number(draft.secondsPerBar || DEFAULT_SECONDS_PER_BAR))
  );
  draft.totalFrames = Math.max(framesPerBar, (draft.totalFrames || framesPerBar) + safeCount * framesPerBar);
  if (!draft.cutPositionsWithCoords.length) {
    draft.cutPositionsWithCoords = buildDefaultCutRegions(draft);
  }
};

const removeBarInSnapshot = (draft: EditorSnapshot, index: number) => {
  const framesPerBar = FIXED_FRAMES_PER_BAR;
  draft.framesPerMessure = framesPerBar;
  draft.fps = fpsFromSecondsPerBar(
    Math.max(0.1, Number(draft.secondsPerBar || DEFAULT_SECONDS_PER_BAR))
  );
  const totalBars = Math.max(1, Math.ceil(Math.max(framesPerBar, draft.totalFrames || framesPerBar) / framesPerBar));
  if (totalBars <= 1) return;
  const safeIndex = Math.max(0, Math.min(totalBars - 1, Math.round(index)));
  const removeStart = safeIndex * framesPerBar;
  const removeEnd = removeStart + framesPerBar;

  const normalizeLength = (length: number) => clampEventLength(length);

  draft.notes = draft.notes
    .filter((note) => {
      const noteStart = Math.round(note.startTime);
      const noteEnd = noteStart + normalizeLength(note.length);
      if (noteEnd <= removeStart) return true;
      if (noteStart >= removeEnd) return true;
      return false;
    })
    .map((note) => {
      const noteStart = Math.round(note.startTime);
      if (noteStart >= removeEnd) {
        return { ...note, startTime: Math.max(0, noteStart - framesPerBar) };
      }
      return note;
    });

  draft.chords = draft.chords
    .filter((chord) => {
      const chordStart = Math.round(chord.startTime);
      const chordEnd = chordStart + normalizeLength(chord.length);
      if (chordEnd <= removeStart) return true;
      if (chordStart >= removeEnd) return true;
      return false;
    })
    .map((chord) => {
      const chordStart = Math.round(chord.startTime);
      if (chordStart >= removeEnd) {
        return { ...chord, startTime: Math.max(0, chordStart - framesPerBar) };
      }
      return chord;
    });

  draft.cutPositionsWithCoords = draft.cutPositionsWithCoords.flatMap(([region, coord]) => {
    const start = Math.max(0, Math.round(region[0]));
    const end = Math.max(start + 1, Math.round(region[1]));
    if (end <= removeStart) {
      return [[[start, end], coord] as CutWithCoord];
    }
    if (start >= removeEnd) {
      const shiftedStart = Math.max(0, start - framesPerBar);
      const shiftedEnd = Math.max(shiftedStart + 1, end - framesPerBar);
      return [[[shiftedStart, shiftedEnd], coord] as CutWithCoord];
    }
    return [];
  });

  draft.totalFrames = Math.max(framesPerBar, (totalBars - 1) * framesPerBar);
};

type DraftNote = {
  stringIndex: number;
  startTime: number;
  length: OptionalNumber;
  fret: OptionalNumber;
};

type KeyboardGridCursor = {
  time: number;
  stringIndex: number;
};

type KeyboardCursorMarker = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type KeyboardAddMode = {
  noteId: number;
  fretText: string;
};

type DraftNoteAnchor = {
  x: number;
  y: number;
};

type SegmentEdit = {
  start: number;
  end: number;
  stringIndex: OptionalNumber;
  fret: OptionalNumber;
};

type DragState = {
  type: "note" | "chord";
  id: number;
  startTime: number;
  stringIndex?: number;
  fret?: number;
  length: number;
  grabOffsetFrames: number;
};

type DragPreview = {
  startTime: number;
  stringIndex?: number;
};

type MultiDragState = {
  anchorId: number;
  anchorType: "note" | "chord";
  anchorStart: number;
  anchorLength: number;
  anchorGrabOffsetFrames: number;
  notes: Array<{ id: number; startTime: number; length: number }>;
  chords: Array<{ id: number; startTime: number; length: number }>;
};

type ResizeState = {
  id: number;
  startTime: number;
  length: number;
};

type NoteFormState = {
  stringIndex: OptionalNumber;
  fret: OptionalNumber;
  startTime: OptionalNumber;
  length: OptionalNumber;
};

type ChordFormState = {
  startTime: OptionalNumber;
  length: OptionalNumber;
};

type SelectionState = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  additive: boolean;
};

type ChordRef = {
  startTime: number;
  length: number;
  tabs: TabCoord[];
};

type TempNoteMapping = {
  tempId: number;
  signature: string;
};

type TempChordMapping = {
  tempId: number;
  signature: string;
};

type OptimisticMutation = {
  id: number;
  label: string;
  before: EditorSnapshot;
  optimistic: EditorSnapshot;
  apply: (snapshot: EditorSnapshot) => EditorSnapshot;
  commit: () => Promise<{ snapshot?: EditorSnapshot }>;
  createdNotes?: TempNoteMapping[];
  createdChords?: TempChordMapping[];
};

type ScaleToolMode = (typeof SCALE_TOOL_MODES)[number];

type ScaleEntityBase = {
  id: number;
  startTime: number;
  length: number;
};

type ScalePreviewEntity = {
  startTime: number;
  length: number;
};

type ScaleSession = {
  anchorX: number;
  notes: ScaleEntityBase[];
  chords: ScaleEntityBase[];
  minTime: number;
};

type FloatingPanelDragState = {
  panel: "note" | "chord";
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type DragPointerEventLike = {
  clientX: number;
  clientY: number;
  shiftKey?: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export default function GteWorkspace({
  editorId,
  snapshot,
  onSnapshotChange,
  allowBackend = true,
  embedded = false,
  isActive = true,
  onFocusWorkspace,
  globalSnapToGridEnabled,
  onGlobalSnapToGridEnabledChange,
  sharedTimeSignature,
  sharedViewportBarCount,
  sharedTimelineScrollRatio,
  onSharedTimelineScrollRatioChange,
  timelineZoomFactor,
  historyUndoCount,
  historyRedoCount,
  onRequestUndo,
  onRequestRedo,
  globalPlaybackFrame,
  globalPlaybackIsPlaying,
  globalPlaybackVolume,
  globalPlaybackTimelineEnd,
  onGlobalPlaybackToggle,
  onGlobalPlaybackFrameChange,
  onGlobalPlaybackVolumeChange,
  onGlobalPlaybackSkipToStart,
  onGlobalPlaybackSkipBackwardBar,
  onGlobalPlaybackSkipForwardBar,
  practiceLoopEnabled,
  practiceLoopRange,
  onPracticeLoopEnabledChange,
  metronomeEnabled,
  onMetronomeEnabledChange,
  countInEnabled,
  onCountInEnabledChange,
  speedTrainerEnabled,
  onSpeedTrainerEnabledChange,
  speedTrainerTarget,
  onSpeedTrainerTargetChange,
  speedTrainerStep,
  onSpeedTrainerStepChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  showToolbarWhenInactive = false,
  selectionClearEpoch,
  selectionClearExemptEditorId,
  barSelectionClearEpoch,
  barSelectionClearExemptEditorId,
  multiTrackSelectionActive = false,
  onSelectionStateChange,
  onRequestGlobalSelectedShift,
  onBarSelectionStateChange,
  onRequestSelectedBarsCopy,
  onRequestSelectedBarsPaste,
  onRequestSelectedBarsDelete,
  barClipboardAvailable = false,
  activeBarDrag,
  onBarDragStart,
  onBarDragEnd,
  onRequestBarDrop,
  mobileViewport = false,
  mobileMode,
}: Props) {
  const [baseScale, setBaseScale] = useState(4);
  const [secondsPerBar, setSecondsPerBar] = useState(2);
  const [bpmInput, setBpmInput] = useState(formatBpm(secondsPerBarToBpm(2, 8)));
  const [timeSignature, setTimeSignature] = useState(8);
  const [timeSignatureInput, setTimeSignatureInput] = useState("8");
  const [localSnapToGridEnabled, setLocalSnapToGridEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackVolume, setPlaybackVolume] = useState(0.6);
  const [localPracticeLoopEnabled, setLocalPracticeLoopEnabled] = useState(false);
  const [localMetronomeEnabled, setLocalMetronomeEnabled] = useState(false);
  const [localCountInEnabled, setLocalCountInEnabled] = useState(false);
  const [localSpeedTrainerEnabled, setLocalSpeedTrainerEnabled] = useState(false);
  const [localSpeedTrainerTarget, setLocalSpeedTrainerTarget] = useState(1.5);
  const [localSpeedTrainerStep, setLocalSpeedTrainerStep] = useState(0.05);
  const [localPlaybackSpeed, setLocalPlaybackSpeed] = useState(1);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(snapshot.updatedAt || null);
  const [selectedBarIndices, setSelectedBarIndices] = useState<number[]>([]);
  const [barSelectionAnchor, setBarSelectionAnchor] = useState<number | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [selectedChordIds, setSelectedChordIds] = useState<number[]>([]);
  const [draftNote, setDraftNote] = useState<DraftNote | null>(null);
  const [draftNoteAnchor, setDraftNoteAnchor] = useState<DraftNoteAnchor | null>(null);
  const [noteAlternates, setNoteAlternates] = useState<{
    possibleTabs: TabCoord[];
    blockedTabs: TabCoord[];
  } | null>(null);
  const [chordAlternatives, setChordAlternatives] = useState<TabCoord[][]>([]);
  const [segmentEdits, setSegmentEdits] = useState<SegmentEdit[]>([]);
  const [insertTime, setInsertTime] = useState<OptionalNumber>(null);
  const [insertString, setInsertString] = useState<OptionalNumber>(null);
  const [insertFret, setInsertFret] = useState<OptionalNumber>(null);
  const [shiftBoundaryIndex, setShiftBoundaryIndex] = useState<OptionalNumber>(null);
  const [shiftBoundaryTime, setShiftBoundaryTime] = useState<OptionalNumber>(null);
  const [deleteBoundaryIndex, setDeleteBoundaryIndex] = useState<OptionalNumber>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [multiDrag, setMultiDrag] = useState<MultiDragState | null>(null);
  const [multiDragDelta, setMultiDragDelta] = useState<number | null>(null);
  const [resizingNote, setResizingNote] = useState<ResizeState | null>(null);
  const [resizePreviewLength, setResizePreviewLength] = useState<number | null>(null);
  const [resizingChord, setResizingChord] = useState<ResizeState | null>(null);
  const [resizeChordPreviewLength, setResizeChordPreviewLength] = useState<number | null>(null);
  const [noteMenuAnchor, setNoteMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [noteMenuNoteId, setNoteMenuNoteId] = useState<number | null>(null);
  const [noteMenuDraft, setNoteMenuDraft] = useState<{ fret: string; length: string } | null>(null);
  const [chordMenuAnchor, setChordMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [chordMenuChordId, setChordMenuChordId] = useState<number | null>(null);
  const [chordMenuDraft, setChordMenuDraft] = useState<{ length: string } | null>(null);
  const [floatingPanelDrag, setFloatingPanelDrag] = useState<FloatingPanelDragState | null>(null);
  const [editingChordId, setEditingChordId] = useState<number | null>(null);
  const [editingChordAnchor, setEditingChordAnchor] = useState<{ x: number; y: number } | null>(null);
  const [chordNoteMenuAnchor, setChordNoteMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [chordNoteMenuIndex, setChordNoteMenuIndex] = useState<number | null>(null);
  const [chordNoteMenuDraft, setChordNoteMenuDraft] = useState<{ fret: string; length: string } | null>(null);
  const [draggingChordNote, setDraggingChordNote] = useState<{
    chordId: number;
    tabIndex: number;
    stringIndex: number;
  } | null>(null);
  const [dragChordNotePreview, setDragChordNotePreview] = useState<{ stringIndex: number } | null>(
    null
  );
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [keyboardGridCursor, setKeyboardGridCursor] = useState<KeyboardGridCursor | null>(null);
  const [keyboardAddMode, setKeyboardAddMode] = useState<KeyboardAddMode | null>(null);
  const [dragBarIndex, setDragBarIndex] = useState<number | null>(null);
  const [segmentDragIndex, setSegmentDragIndex] = useState<number | null>(null);
  const [ioPayload, setIoPayload] = useState("");
  const [ioMessage, setIoMessage] = useState<string | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [tabPreviewOpen, setTabPreviewOpen] = useState(false);
  const [sliceToolActive, setSliceToolActive] = useState(false);
  const [sliceCursor, setSliceCursor] = useState<{ time: number; rowIndex: number } | null>(null);
  const [cutToolActive, setCutToolActive] = useState(false);
  const [scaleToolActive, setScaleToolActive] = useState(false);
  const [scaleToolMode, setScaleToolMode] = useState<ScaleToolMode>("length");
  const [scaleFactor, setScaleFactor] = useState(1);
  const [scaleFactorInput, setScaleFactorInput] = useState("1");
  const [scaleHudPosition, setScaleHudPosition] = useState<{ x: number; y: number } | null>(null);
  const [scalePreviewNotes, setScalePreviewNotes] = useState<Record<number, ScalePreviewEntity>>({});
  const [scalePreviewChords, setScalePreviewChords] = useState<Record<number, ScalePreviewEntity>>({});
  const [scalePreviewMaxEnd, setScalePreviewMaxEnd] = useState(0);
  const [selectedCutBoundaryIndex, setSelectedCutBoundaryIndex] = useState<number | null>(null);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [playheadDragging, setPlayheadDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [lastBarInsertIndex, setLastBarInsertIndex] = useState<number | null>(null);
  const [barDropIndex, setBarDropIndex] = useState<number | null>(null);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [segmentCoordDraft, setSegmentCoordDraft] = useState<{ stringIndex: string; fret: string } | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const previewAudioRef = useRef<AudioContext | null>(null);
  const previewGainRef = useRef<GainNode | null>(null);
  const playbackStartRequestRef = useRef(0);
  const playbackStartPendingRef = useRef(false);
  const playheadFrameRef = useRef(0);
  const playheadStartTimeRef = useRef<number | null>(null);
  const playheadStartFrameRef = useRef(0);
  const playheadEndFrameRef = useRef<number | null>(null);
  const playheadAudioStartRef = useRef<number | null>(null);
  const playheadRafRef = useRef<number | null>(null);
  const clipboardRef = useRef<{
    anchor: number;
    notes: Array<{ start: number; length: number; tab: TabCoord }>;
    chords: Array<{ start: number; length: number; tabs: TabCoord[] }>;
  } | null>(null);
  const undoRef = useRef<EditorSnapshot[]>([]);
  const redoRef = useRef<EditorSnapshot[]>([]);
  const snapshotRef = useRef<EditorSnapshot>(snapshot);
  const selectedNoteIdsRef = useRef<number[]>([]);
  const selectedChordIdsRef = useRef<number[]>([]);
  const pendingMutationsRef = useRef<OptimisticMutation[]>([]);
  const mutationSeqRef = useRef(0);
  const mutationProcessingRef = useRef(false);
  const tempNoteIdRef = useRef(1);
  const tempChordIdRef = useRef(1);
  const noteIdMapRef = useRef<Map<number, number>>(new Map());
  const chordIdMapRef = useRef<Map<number, number>>(new Map());
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineOuterRef = useRef<HTMLDivElement | null>(null);
  const draftFretRef = useRef<HTMLInputElement | null>(null);
  const draftHasFocusedRef = useRef(false);
  const draftPopupRef = useRef<HTMLDivElement | null>(null);
  const noteMenuRef = useRef<HTMLDivElement | null>(null);
  const chordMenuRef = useRef<HTMLDivElement | null>(null);
  const chordEditPanelRef = useRef<HTMLDivElement | null>(null);
  const chordNoteMenuRef = useRef<HTMLDivElement | null>(null);
  const noteFretArrowCommitTimerRef = useRef<number | null>(null);
  const pendingNoteFretArrowCommitRef = useRef<{ noteId: number; fret: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const scaleHudRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const segmentEditsRef = useRef<SegmentEdit[]>(segmentEdits);
  const dragPreviewRef = useRef<DragPreview | null>(dragPreview);
  const multiDragDeltaRef = useRef<number | null>(multiDragDelta);
  const multiDragMovedRef = useRef(false);
  const singleDragMovedRef = useRef(false);
  const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
  const touchHoldTimerRef = useRef<number | null>(null);
  const touchHoldTriggeredRef = useRef(false);
  const touchHoldPointRef = useRef<{ x: number; y: number } | null>(null);
  const multiDragStartXRef = useRef(0);
  const resizePreviewRef = useRef<number | null>(resizePreviewLength);
  const resizeChordPreviewRef = useRef<number | null>(resizeChordPreviewLength);
  const dragChordNotePreviewRef = useRef<{ stringIndex: number } | null>(dragChordNotePreview);
  const chordNoteDragMovedRef = useRef(false);
  const chordNoteDragStartYRef = useRef(0);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 80, y: 120 });
  const selectionRef = useRef<SelectionState | null>(null);
  const enterGridCycleRef = useRef<{ gridKey: string; order: number[]; index: number } | null>(null);
  const keyboardGridCursorRef = useRef<KeyboardGridCursor | null>(null);
  const keyboardAddModeRef = useRef<KeyboardAddMode | null>(null);
  const noteFretTypingBufferRef = useRef("");
  const noteFretTypingAtRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const localRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const lastAddedNoteLengthRef = useRef(DEFAULT_NOTE_LENGTH);
  const applyingSharedScrollRef = useRef(false);
  const scaleSessionRef = useRef<ScaleSession | null>(null);
  const scaleFactorTypingRef = useRef<string | null>(null);
  const scaleFactorTypingAtRef = useRef(0);

  const fps = fpsFromSecondsPerBar(secondsPerBar);
  const framesPerMeasure = FIXED_FRAMES_PER_BAR;
  const totalFrames = snapshot.totalFrames || 0;
  const previewFrames = scaleToolActive ? Math.max(0, Math.round(scalePreviewMaxEnd)) : 0;
  const effectiveTotalFrames = Math.max(totalFrames, previewFrames);
  const maxFret = getMaxFret(snapshot);
  const stringLabels = useMemo(() => {
    const labels = getStringLabelsForSnapshot(snapshot);
    return labels.length === 6 ? labels : DEFAULT_STRING_LABELS;
  }, [snapshot]);
  const barCount = Math.max(1, Math.ceil(Math.max(1, effectiveTotalFrames) / framesPerMeasure));
  const normalizedSharedViewportBars =
    sharedViewportBarCount !== undefined && Number.isFinite(sharedViewportBarCount)
      ? Math.max(1, Math.round(sharedViewportBarCount))
      : barCount;
  const viewportBarCount = Math.max(barCount, normalizedSharedViewportBars);
  const computedTotalFrames = barCount * framesPerMeasure;
  const viewportTotalFrames = viewportBarCount * framesPerMeasure;
  const barsPerRow = Math.max(1, barCount);
  const rowFrames = framesPerMeasure * barsPerRow;
  const rows = 1;
  const isMobileCanvasMode = mobileViewport && mobileMode === "canvas";
  const isMobileEditMode = mobileViewport && mobileMode === "edit";
  const showPlayingCoordinates = !isMobileCanvasMode;
  const normalizedTimelineZoomFactor =
    timelineZoomFactor !== undefined && Number.isFinite(timelineZoomFactor)
      ? Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, timelineZoomFactor))
      : 1;
  const scale = baseScale * normalizedTimelineZoomFactor;
  const timelineWidth = Math.max(1, computedTotalFrames) * scale;
  const viewportTimelineWidth = Math.max(1, viewportTotalFrames) * scale;
  const timelineChromeWidth = viewportTimelineWidth + 40;
  const rowHeight = ROW_HEIGHT * 6;
  const coordinateBandHeight = showPlayingCoordinates ? CUT_SEGMENT_OFFSET + CUT_SEGMENT_HEIGHT : 0;
  const rowBlockHeight = rowHeight + coordinateBandHeight;
  const rowStride = rowBlockHeight + ROW_GAP;
  const timelineHeight = rowBlockHeight;
  const timelineEnd = barCount * framesPerMeasure;
  const snapThresholdFrames = Math.max(1, Math.round(4 / Math.max(1, scale)));
  const playbackFps = fps;
  const tabPreviewText = useMemo(
    () => buildTabTextFromSnapshot(snapshot, { barsPerRow: BARS_PER_ROW }),
    [snapshot]
  );
  const showFloatingUi = !embedded || isActive;
  const showPlaybackUi = showFloatingUi || showToolbarWhenInactive;
  const showToolbarUi = showPlaybackUi && !isMobileCanvasMode;
  const compactEmbeddedMobile = embedded && mobileViewport;
  const selectedBarIndexSet = useMemo(() => new Set(selectedBarIndices), [selectedBarIndices]);
  const localPracticeLoopRange = useMemo(
    () =>
      resolvePracticeLoopRange(selectedBarIndices, framesPerMeasure, timelineEnd) ||
      (timelineEnd > 0 ? { startFrame: 0, endFrame: timelineEnd } : null),
    [selectedBarIndices, timelineEnd]
  );
  const useExternalPlayback =
    globalPlaybackFrame !== undefined &&
    globalPlaybackIsPlaying !== undefined &&
    typeof onGlobalPlaybackToggle === "function" &&
    typeof onGlobalPlaybackFrameChange === "function";
  const effectivePlayheadFrame = useExternalPlayback ? globalPlaybackFrame ?? 0 : playheadFrame;
  const effectiveIsPlaying = useExternalPlayback ? Boolean(globalPlaybackIsPlaying) : isPlaying;
  const effectivePlaybackVolume = useExternalPlayback
    ? Math.max(0, Math.min(1, globalPlaybackVolume ?? playbackVolume))
    : playbackVolume;
  const effectivePracticeLoopRange = useExternalPlayback ? practiceLoopRange ?? null : localPracticeLoopRange;
  const effectivePracticeLoopEnabled = useExternalPlayback
    ? Boolean(practiceLoopEnabled && effectivePracticeLoopRange)
    : Boolean(localPracticeLoopEnabled && effectivePracticeLoopRange);
  const effectiveMetronomeEnabled = useExternalPlayback
    ? Boolean(metronomeEnabled)
    : localMetronomeEnabled;
  const effectiveCountInEnabled = useExternalPlayback ? Boolean(countInEnabled) : localCountInEnabled;
  const effectiveSpeedTrainerEnabled = useExternalPlayback
    ? Boolean(speedTrainerEnabled && effectivePracticeLoopEnabled)
    : Boolean(localSpeedTrainerEnabled && effectivePracticeLoopEnabled);
  const effectiveSpeedTrainerTarget = normalizePlaybackSpeed(
    useExternalPlayback ? speedTrainerTarget ?? localSpeedTrainerTarget : localSpeedTrainerTarget
  );
  const effectiveSpeedTrainerStep = Math.max(
    0.01,
    Number(useExternalPlayback ? speedTrainerStep ?? localSpeedTrainerStep : localSpeedTrainerStep) || 0.05
  );
  const effectivePlaybackSpeed = normalizePlaybackSpeed(
    useExternalPlayback ? playbackSpeed ?? localPlaybackSpeed : localPlaybackSpeed
  );
  const effectivePlaybackSpeedOptions = useMemo(() => {
    const values = new Set<number>(PLAYBACK_SPEED_OPTIONS.map((speed) => normalizePlaybackSpeed(speed)));
    values.add(Math.round(effectivePlaybackSpeed * 100) / 100);
    return [...values].sort((left, right) => left - right);
  }, [effectivePlaybackSpeed]);
  const setEffectivePracticeLoopEnabled = useCallback(
    (enabled: boolean) => {
      if (onPracticeLoopEnabledChange) {
        onPracticeLoopEnabledChange(enabled);
        return;
      }
      setLocalPracticeLoopEnabled(enabled);
    },
    [onPracticeLoopEnabledChange]
  );
  const setEffectiveMetronomeEnabled = useCallback(
    (enabled: boolean) => {
      if (onMetronomeEnabledChange) {
        onMetronomeEnabledChange(enabled);
        return;
      }
      setLocalMetronomeEnabled(enabled);
    },
    [onMetronomeEnabledChange]
  );
  const setEffectiveCountInEnabled = useCallback(
    (enabled: boolean) => {
      if (onCountInEnabledChange) {
        onCountInEnabledChange(enabled);
        return;
      }
      setLocalCountInEnabled(enabled);
    },
    [onCountInEnabledChange]
  );
  const setEffectiveSpeedTrainerEnabled = useCallback(
    (enabled: boolean) => {
      if (onSpeedTrainerEnabledChange) {
        onSpeedTrainerEnabledChange(enabled);
        return;
      }
      setLocalSpeedTrainerEnabled(enabled);
    },
    [onSpeedTrainerEnabledChange]
  );
  const setEffectiveSpeedTrainerTarget = useCallback(
    (target: number) => {
      const normalized = normalizePlaybackSpeed(target);
      if (onSpeedTrainerTargetChange) {
        onSpeedTrainerTargetChange(normalized);
        return;
      }
      setLocalSpeedTrainerTarget(normalized);
    },
    [onSpeedTrainerTargetChange]
  );
  const setEffectiveSpeedTrainerStep = useCallback(
    (step: number) => {
      const normalized = Math.max(0.01, Number(step) || 0.05);
      if (onSpeedTrainerStepChange) {
        onSpeedTrainerStepChange(normalized);
        return;
      }
      setLocalSpeedTrainerStep(normalized);
    },
    [onSpeedTrainerStepChange]
  );
  const setEffectivePlaybackSpeed = useCallback(
    (speed: number) => {
      const normalized = normalizePlaybackSpeed(speed);
      if (onPlaybackSpeedChange) {
        onPlaybackSpeedChange(normalized);
        return;
      }
      setLocalPlaybackSpeed(normalized);
    },
    [onPlaybackSpeedChange]
  );
  const setEffectivePlaybackVolume = useCallback(
    (nextVolume: number) => {
      const normalized = Math.max(0, Math.min(1, nextVolume));
      if (onGlobalPlaybackVolumeChange) {
        onGlobalPlaybackVolumeChange(normalized);
        return;
      }
      setPlaybackVolume(normalized);
    },
    [onGlobalPlaybackVolumeChange]
  );
  const setEffectivePlayheadFrame = useCallback(
    (nextFrame: number) => {
      const maxFrame = useExternalPlayback
        ? Math.max(1, Math.round(globalPlaybackTimelineEnd ?? timelineEnd))
        : timelineEnd;
      const normalized = Math.max(0, Math.min(maxFrame, Math.round(nextFrame)));
      if (onGlobalPlaybackFrameChange) {
        onGlobalPlaybackFrameChange(normalized);
        return;
      }
      setPlayheadFrame(normalized);
    },
    [globalPlaybackTimelineEnd, onGlobalPlaybackFrameChange, timelineEnd, useExternalPlayback]
  );

  useEffect(() => {
    if (effectivePracticeLoopRange) return;
    if (!effectivePracticeLoopEnabled) return;
    setEffectivePracticeLoopEnabled(false);
  }, [effectivePracticeLoopEnabled, effectivePracticeLoopRange, setEffectivePracticeLoopEnabled]);
  useEffect(() => {
    if (effectivePracticeLoopEnabled) return;
    if (!effectiveSpeedTrainerEnabled) return;
    setEffectiveSpeedTrainerEnabled(false);
  }, [effectivePracticeLoopEnabled, effectiveSpeedTrainerEnabled, setEffectiveSpeedTrainerEnabled]);
  const useExternalHistory = Boolean(onRequestUndo && onRequestRedo);
  const effectiveUndoCount = useExternalHistory ? Math.max(0, historyUndoCount ?? 0) : undoCount;
  const effectiveRedoCount = useExternalHistory ? Math.max(0, historyRedoCount ?? 0) : redoCount;
  const selectionActionsLocked = Boolean(multiTrackSelectionActive);
  const snapToGridEnabled = globalSnapToGridEnabled ?? localSnapToGridEnabled;
  const setSnapToGridEnabled = useCallback(
    (nextValue: boolean | ((prev: boolean) => boolean)) => {
      const current = snapToGridEnabled;
      const next =
        typeof nextValue === "function"
          ? (nextValue as (prev: boolean) => boolean)(current)
          : nextValue;
      const normalized = Boolean(next);
      if (onGlobalSnapToGridEnabledChange) {
        onGlobalSnapToGridEnabledChange(normalized);
        return;
      }
      setLocalSnapToGridEnabled(normalized);
    },
    [snapToGridEnabled, onGlobalSnapToGridEnabledChange]
  );
  const guardSingleTrackSelectionAction = useCallback(
    (actionLabel: string) => {
      if (!selectionActionsLocked) return false;
      setError(
        `${actionLabel} is disabled while notes/chords are selected in multiple tracks.`
      );
      return true;
    },
    [selectionActionsLocked]
  );

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    selectedNoteIdsRef.current = selectedNoteIds;
  }, [selectedNoteIds]);

  useEffect(() => {
    selectedChordIdsRef.current = selectedChordIds;
  }, [selectedChordIds]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      setLastSavedAt(snapshot.updatedAt || null);
    }
  }, [snapshot.updatedAt, hasUnsavedChanges]);

  useEffect(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    undoRef.current = [];
    redoRef.current = [];
    pendingMutationsRef.current = [];
    mutationProcessingRef.current = false;
    noteIdMapRef.current = new Map();
    chordIdMapRef.current = new Map();
    tempNoteIdRef.current = 1;
    tempChordIdRef.current = 1;
    autosaveInFlightRef.current = false;
    autosaveQueuedRef.current = false;
    localRevisionRef.current = 0;
    savedRevisionRef.current = 0;
    setUndoCount(0);
    setRedoCount(0);
    setHasUnsavedChanges(false);
    setIsAutosaving(false);
    setLastSavedAt(null);
    setSelectedBarIndices([]);
    setBarSelectionAnchor(null);
    setLastBarInsertIndex(null);
  }, [editorId]);

  useEffect(() => {
    playheadFrameRef.current = effectivePlayheadFrame;
  }, [effectivePlayheadFrame]);

  useEffect(() => {
    if (audioRef.current && masterGainRef.current) {
      const now = audioRef.current.currentTime;
      masterGainRef.current.gain.setTargetAtTime(effectivePlaybackVolume, now, 0.02);
    }
    if (previewAudioRef.current && previewGainRef.current) {
      const now = previewAudioRef.current.currentTime;
      previewGainRef.current.gain.setTargetAtTime(effectivePlaybackVolume, now, 0.02);
    }
  }, [effectivePlaybackVolume]);

  useEffect(() => {
    void warmTrackInstrument(snapshot.instrumentId);
  }, [snapshot.instrumentId]);

  useEffect(() => {
    if (useExternalPlayback) return;
    if (playheadFrame > timelineEnd) {
      setPlayheadFrame(timelineEnd);
    }
  }, [playheadFrame, timelineEnd, useExternalPlayback]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (previewAudioRef.current) {
        void previewAudioRef.current.close();
        previewAudioRef.current = null;
      }
      previewGainRef.current = null;
    };
  }, []);

  const getRowBarCount = (rowIndex: number) => (rowIndex === 0 ? barsPerRow : 0);

  const snapCandidates = useMemo(() => {
    const candidates: Array<{ time: number; noteId?: number; chordId?: number }> = [];
    snapshot.notes.forEach((note) => {
      const start = Math.round(note.startTime);
      const end = Math.round(note.startTime + note.length);
      const center = Math.round(note.startTime + note.length / 2);
      candidates.push({ time: start, noteId: note.id });
      candidates.push({ time: end, noteId: note.id });
      candidates.push({ time: center, noteId: note.id });
    });
    snapshot.chords.forEach((chord) => {
      const start = Math.round(chord.startTime);
      const end = Math.round(chord.startTime + chord.length);
      const center = Math.round(chord.startTime + chord.length / 2);
      candidates.push({ time: start, chordId: chord.id });
      candidates.push({ time: end, chordId: chord.id });
      candidates.push({ time: center, chordId: chord.id });
    });
    return candidates;
  }, [snapshot.notes, snapshot.chords]);

  const getSnapTime = (
    rawTime: number,
    options?: {
      excludeNoteIds?: number[];
      excludeChordIds?: number[];
      min?: number;
      max?: number;
    }
  ) => {
    if (!snapCandidates.length) return rawTime;
    const excludeNotes = new Set(options?.excludeNoteIds ?? []);
    const excludeChords = new Set(options?.excludeChordIds ?? []);
    const min = options?.min ?? -Infinity;
    const max = options?.max ?? Infinity;
    let bestTime = rawTime;
    let bestDelta = Infinity;
    for (const candidate of snapCandidates) {
      if (candidate.time < min || candidate.time > max) continue;
      if (candidate.noteId !== undefined && excludeNotes.has(candidate.noteId)) continue;
      if (candidate.chordId !== undefined && excludeChords.has(candidate.chordId)) continue;
      const delta = Math.abs(candidate.time - rawTime);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestTime = candidate.time;
      }
    }
    return bestDelta <= snapThresholdFrames ? bestTime : rawTime;
  };

  const isPointInTimeline = (clientX: number, clientY: number) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const getPasteTargetFrame = (overrideFrame?: number) => {
    if (overrideFrame !== undefined) return clamp(Math.round(overrideFrame), 0, timelineEnd);
    if (isPointInTimeline(mousePosRef.current.x, mousePosRef.current.y)) {
      const target = getPointerFrame(mousePosRef.current.x, mousePosRef.current.y);
      if (target) return clamp(target.time, 0, timelineEnd);
    }
    return clamp(Math.round(playheadFrameRef.current), 0, timelineEnd);
  };

  const selectedNote = useMemo(
    () => snapshot.notes.find((note) => note.id === selectedNoteIds[0]) || null,
    [snapshot.notes, selectedNoteIds]
  );
  const selectedSingleNoteId = selectedNoteIds.length === 1 ? selectedNoteIds[0] : null;

  const activeChordIds = useMemo(
    () => selectedChordIds.filter((id) => snapshot.chords.some((chord) => chord.id === id)),
    [snapshot.chords, selectedChordIds]
  );

  const selectedChord = useMemo(() => {
    const activeId = activeChordIds[0];
    return snapshot.chords.find((chord) => chord.id === activeId) || null;
  }, [snapshot.chords, activeChordIds]);

  const cutBoundaries = useMemo(
    () =>
      segmentEdits
        .map((segment, idx) =>
          idx < segmentEdits.length - 1 ? { index: idx, time: segment.end } : null
        )
        .filter((item): item is { index: number; time: number } => Boolean(item)),
    [segmentEdits]
  );
  const hasRedundantCutRegions = useMemo(() => {
    const regions = getCutRegions(snapshot);
    for (let index = 1; index < regions.length; index += 1) {
      if (isSameTabCoord(regions[index - 1][1], regions[index][1])) {
        return true;
      }
    }
    return false;
  }, [snapshot]);
  const mergedCutRegionsPayload = useMemo(
    () => mergeRedundantCutRegions(snapshot, snapshot.cutPositionsWithCoords),
    [snapshot]
  );

  const chordizeCandidateCount = useMemo(() => {
    const baseCount = new Set(selectedNoteIds).size;
    if (!activeChordIds.length) return baseCount;
    let chordCount = 0;
    activeChordIds.forEach((id) => {
      const chord = snapshot.chords.find((item) => item.id === id);
      if (chord && Array.isArray(chord.currentTabs)) {
        chordCount += chord.currentTabs.length;
      }
    });
    return baseCount + chordCount;
  }, [activeChordIds, selectedNoteIds, snapshot.chords]);

  useEffect(() => {
    setSegmentEdits(
      snapshot.cutPositionsWithCoords.map((region) => ({
        start: region[0][0],
        end: region[0][1],
        stringIndex: region[1][0],
        fret: region[1][1],
      }))
    );
  }, [snapshot.cutPositionsWithCoords]);

  useEffect(() => {
    segmentEditsRef.current = segmentEdits;
  }, [segmentEdits]);

  useEffect(() => {
    dragPreviewRef.current = dragPreview;
  }, [dragPreview]);

  useEffect(() => {
    multiDragDeltaRef.current = multiDragDelta;
  }, [multiDragDelta]);

  useEffect(() => {
    keyboardGridCursorRef.current = keyboardGridCursor;
  }, [keyboardGridCursor]);

  useEffect(() => {
    keyboardAddModeRef.current = keyboardAddMode;
  }, [keyboardAddMode]);

  useEffect(() => {
    resizePreviewRef.current = resizePreviewLength;
  }, [resizePreviewLength]);

  useEffect(() => {
    resizeChordPreviewRef.current = resizeChordPreviewLength;
  }, [resizeChordPreviewLength]);

  useEffect(() => {
    dragChordNotePreviewRef.current = dragChordNotePreview;
  }, [dragChordNotePreview]);

  useEffect(() => {
    const handleMove = (event: globalThis.MouseEvent) => {
      mousePosRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
    };
  }, []);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    if (draftNote) {
      if (!draftHasFocusedRef.current && !mobileViewport) {
        requestAnimationFrame(() => draftFretRef.current?.focus());
        draftHasFocusedRef.current = true;
      }
    } else {
      draftHasFocusedRef.current = false;
    }
  }, [draftNote]);

  useEffect(() => {
    if (snapshot.secondsPerBar !== undefined && snapshot.secondsPerBar !== null) {
      const next = Number(snapshot.secondsPerBar);
      if (Number.isFinite(next) && next > 0) {
        setSecondsPerBar(next);
        return;
      }
    }
    const snapshotFps = Math.max(1, Number(snapshot.fps || fpsFromSecondsPerBar(DEFAULT_SECONDS_PER_BAR)));
    const inferred = FIXED_FRAMES_PER_BAR / snapshotFps;
    if (!Number.isFinite(inferred) || inferred <= 0) return;
    const normalized = Math.round(inferred * 1000) / 1000;
    setSecondsPerBar(normalized);
  }, [snapshot.secondsPerBar, snapshot.fps]);

  useEffect(() => {
    setBpmInput(formatBpm(secondsPerBarToBpm(secondsPerBar, timeSignature)));
  }, [secondsPerBar, timeSignature]);

  useEffect(() => {
    if (sharedTimeSignature !== undefined && sharedTimeSignature !== null) {
      const next = Number(sharedTimeSignature);
      if (Number.isFinite(next) && next >= 1) {
        const clamped = Math.max(1, Math.min(64, Math.round(next)));
        setTimeSignature(clamped);
        setTimeSignatureInput(String(clamped));
      }
      return;
    }
    if (snapshot.timeSignature !== undefined && snapshot.timeSignature !== null) {
      const next = Number(snapshot.timeSignature);
      if (Number.isFinite(next) && next >= 1) {
        const clamped = Math.max(1, Math.min(64, Math.round(next)));
        setTimeSignature(clamped);
        setTimeSignatureInput(String(clamped));
      }
    }
  }, [sharedTimeSignature, snapshot.timeSignature]);

  useEffect(() => {
    const container = timelineOuterRef.current;
    if (!container || framesPerMeasure <= 0) return;

    const computeScale = () => {
      const availableWidth = Math.max(240, container.clientWidth - 16);
      const rawScale = availableWidth / Math.max(1, framesPerMeasure * TARGET_VISIBLE_BARS);
      const nextScale = Math.max(0.5, Math.min(4, rawScale));
      setBaseScale((prev) => (Math.abs(prev - nextScale) < 0.01 ? prev : nextScale));
    };

    computeScale();
    const observer = new ResizeObserver(computeScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [framesPerMeasure]);

  useEffect(() => {
    const container = timelineOuterRef.current;
    if (!container) return;
    if (sharedTimelineScrollRatio === undefined || !Number.isFinite(sharedTimelineScrollRatio)) return;
    const ratio = Math.max(0, Math.min(1, sharedTimelineScrollRatio));
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const targetScroll = Math.max(0, Math.min(maxScroll, Math.round(maxScroll * ratio)));
    if (Math.abs(container.scrollLeft - targetScroll) < 1) return;
    applyingSharedScrollRef.current = true;
    container.scrollLeft = targetScroll;
    window.requestAnimationFrame(() => {
      applyingSharedScrollRef.current = false;
    });
  }, [sharedTimelineScrollRatio, viewportTimelineWidth]);

  const handleTimelineOuterScroll = useCallback(
    (event: ReactUiEvent<HTMLDivElement>) => {
      if (!onSharedTimelineScrollRatioChange || applyingSharedScrollRef.current) return;
      const maxScroll = Math.max(
        0,
        event.currentTarget.scrollWidth - event.currentTarget.clientWidth
      );
      if (maxScroll <= 0) return;
      onSharedTimelineScrollRatioChange(event.currentTarget.scrollLeft / maxScroll);
    },
    [onSharedTimelineScrollRatioChange]
  );

  useEffect(() => {
    if (selectedSingleNoteId === null || !selectedNote) {
      setNoteAlternates(null);
      return;
    }
    const resolvedId =
      selectedSingleNoteId < 0
        ? noteIdMapRef.current.get(selectedSingleNoteId) ?? selectedSingleNoteId
        : selectedSingleNoteId;
    if (resolvedId < 0) {
      setNoteAlternates(null);
      return;
    }
    const note = snapshotRef.current.notes.find((item) => item.id === resolvedId);
    if (!note) {
      setNoteAlternates(null);
      return;
    }
    setNoteAlternates(computeNoteAlternatesForSnapshot(snapshotRef.current, note));
  }, [selectedNote, selectedSingleNoteId, snapshot.notes, snapshot.chords, snapshot.cutPositionsWithCoords]);

  useEffect(() => {
    if (selectedNoteIds.length !== 1 || !selectedNote || selectedNote.id !== noteMenuNoteId) {
      setNoteMenuAnchor(null);
      setNoteMenuNoteId(null);
      setNoteMenuDraft(null);
    }
  }, [selectedNote, selectedNoteIds.length, noteMenuNoteId]);

  useEffect(() => {
    if (editingChordId !== null) {
      setNoteMenuAnchor(null);
      setNoteMenuNoteId(null);
      setNoteMenuDraft(null);
      setChordMenuAnchor(null);
      setChordMenuChordId(null);
      setChordMenuDraft(null);
    }
  }, [editingChordId]);

  useEffect(() => {
    if (activeChordIds.length !== 1 || !selectedChord || selectedChord.id !== chordMenuChordId) {
      setChordMenuAnchor(null);
      setChordMenuChordId(null);
      setChordMenuDraft(null);
    }
  }, [activeChordIds.length, selectedChord, chordMenuChordId]);

  useEffect(() => {
    const activeId = activeChordIds[0];
    if (activeId !== undefined) {
      const resolvedId = activeId < 0 ? chordIdMapRef.current.get(activeId) ?? activeId : activeId;
      if (resolvedId < 0) {
        setChordAlternatives([]);
        return;
      }
      void gteApi
        .getChordAlternatives(editorId, resolvedId)
        .then((data) => setChordAlternatives(data.alternatives || []))
        .catch(() => setChordAlternatives([]));
    } else {
      setChordAlternatives([]);
    }
  }, [editorId, activeChordIds]);

  useEffect(() => {
    setSelectedNoteIds((prev) => prev.filter((id) => snapshot.notes.some((note) => note.id === id)));
    setSelectedChordIds((prev) => prev.filter((id) => snapshot.chords.some((chord) => chord.id === id)));
  }, [snapshot.notes, snapshot.chords]);

  useEffect(() => {
    setSelectedBarIndices((prev) => {
      const next = prev.filter((index) => index >= 0 && index < barCount);
      return next.length === prev.length ? prev : next;
    });
    setBarSelectionAnchor((prev) =>
      prev !== null && prev >= 0 && prev < barCount ? prev : null
    );
  }, [barCount]);

  useEffect(() => {
    noteIdMapRef.current.forEach((_, tempId) => {
      if (tempId >= 0) {
        noteIdMapRef.current.delete(tempId);
      }
    });
    chordIdMapRef.current.forEach((_, tempId) => {
      if (tempId >= 0) {
        chordIdMapRef.current.delete(tempId);
      }
    });
  }, [snapshot.notes, snapshot.chords]);

  useEffect(() => {
    onSelectionStateChange?.({
      noteCount: selectedNoteIds.length,
      chordCount: selectedChordIds.length,
      noteIds: [...selectedNoteIds],
      chordIds: [...selectedChordIds],
    });
  }, [onSelectionStateChange, selectedChordIds, selectedNoteIds]);

  useEffect(() => {
    onBarSelectionStateChange?.([...selectedBarIndices]);
  }, [onBarSelectionStateChange, selectedBarIndices]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        void audioRef.current.close();
        audioRef.current = null;
      }
    };
  }, []);

  const conflictInfo = useMemo(() => {
    const events: Array<{
      key: string;
      stringIndex: number;
      start: number;
      end: number;
      noteId?: number;
    }> = [];
    snapshot.notes.forEach((note) => {
      events.push({
        key: `note-${note.id}`,
        stringIndex: note.tab[0],
        start: note.startTime,
        end: note.startTime + note.length,
        noteId: note.id,
      });
    });
    snapshot.chords.forEach((chord) => {
      chord.currentTabs.forEach((tab, idx) => {
        events.push({
          key: `chord-${chord.id}-${idx}`,
          stringIndex: tab[0],
          start: chord.startTime,
          end: chord.startTime + chord.length,
        });
      });
    });
    const conflictKeys = new Set<string>();
    for (let i = 0; i < events.length; i += 1) {
      for (let j = i + 1; j < events.length; j += 1) {
        const a = events[i];
        const b = events[j];
        if (a.stringIndex !== b.stringIndex) continue;
        if (a.start < b.end && b.start < a.end) {
          conflictKeys.add(a.key);
          conflictKeys.add(b.key);
        }
      }
    }
    const noteConflicts = new Set<number>();
    events.forEach((evt) => {
      if (evt.noteId && conflictKeys.has(evt.key)) {
        noteConflicts.add(evt.noteId);
      }
    });
    return { noteConflicts, conflictKeys };
  }, [snapshot.notes, snapshot.chords]);

  const cloneSnapshot = useCallback((value: EditorSnapshot) => {
    return JSON.parse(JSON.stringify(value)) as EditorSnapshot;
  }, []);

  const snapshotsEqual = useCallback((left: EditorSnapshot, right: EditorSnapshot) => {
    return JSON.stringify(left) === JSON.stringify(right);
  }, []);

  const applySnapshot = useCallback(
    (next: EditorSnapshot, options?: { recordUndo?: boolean; recordHistory?: boolean }) => {
      const recordUndo = options?.recordUndo !== false && !useExternalHistory;
      const recordHistory = options?.recordHistory !== false;
      const nextWithOptimals = recomputeSnapshotOptimals(next);
      const current = snapshotRef.current;
      const sameSnapshot = current ? snapshotsEqual(current, nextWithOptimals) : false;
      if (recordUndo && current && !sameSnapshot) {
        const nextUndo = [...undoRef.current, cloneSnapshot(current)];
        if (nextUndo.length > MAX_HISTORY) {
          nextUndo.splice(0, nextUndo.length - MAX_HISTORY);
        }
        undoRef.current = nextUndo;
        setUndoCount(nextUndo.length);
        redoRef.current = [];
        setRedoCount(0);
      }
      snapshotRef.current = nextWithOptimals;
      onSnapshotChange(nextWithOptimals, { recordHistory });
    },
    [cloneSnapshot, onSnapshotChange, snapshotsEqual, useExternalHistory]
  );

  const syncSavedRevision = useCallback((revision: number) => {
    savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
    setHasUnsavedChanges(localRevisionRef.current > savedRevisionRef.current);
  }, []);

  const persistSnapshotToBackend = useCallback(
    async (reason: string, options?: { force?: boolean }) => {
      if (!allowBackend) {
        syncSavedRevision(localRevisionRef.current);
        setLastSavedAt(new Date().toISOString());
        setIsAutosaving(false);
        return;
      }
      const needsSave = localRevisionRef.current > savedRevisionRef.current;
      if (!options?.force && !needsSave) return;
      if (autosaveInFlightRef.current) {
        autosaveQueuedRef.current = true;
        return;
      }
      autosaveInFlightRef.current = true;
      setIsAutosaving(true);
      const revisionToSave = localRevisionRef.current;
      const payload = cloneSnapshot(snapshotRef.current);
      payload.id = editorId;
      try {
        const res = await gteApi.applySnapshot(editorId, payload);
        if (localRevisionRef.current === revisionToSave) {
          applySnapshot(res.snapshot, { recordUndo: false, recordHistory: false });
        }
        syncSavedRevision(revisionToSave);
        setLastSavedAt(res.snapshot.updatedAt || new Date().toISOString());
      } catch (err: any) {
        if (reason === "pre-server-mutation") {
          throw err;
        }
        setError(err?.message || "Autosave failed. Changes are still local.");
        autosaveQueuedRef.current = true;
      } finally {
        autosaveInFlightRef.current = false;
        setIsAutosaving(false);
        const shouldRetry =
          autosaveQueuedRef.current || localRevisionRef.current > savedRevisionRef.current;
        autosaveQueuedRef.current = false;
        if (shouldRetry) {
          setTimeout(() => {
            void persistSnapshotToBackend("queued", { force: true });
          }, 200);
        }
      }
    },
    [allowBackend, applySnapshot, cloneSnapshot, editorId, syncSavedRevision]
  );

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistSnapshotToBackend("debounce");
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [persistSnapshotToBackend]);

  const markLocalSnapshotDirty = useCallback(() => {
    localRevisionRef.current += 1;
    setHasUnsavedChanges(true);
    scheduleAutosave();
  }, [scheduleAutosave]);

  const markServerSnapshotSynced = useCallback((nextSnapshot?: EditorSnapshot) => {
    localRevisionRef.current += 1;
    savedRevisionRef.current = localRevisionRef.current;
    setHasUnsavedChanges(false);
    if (nextSnapshot?.updatedAt) {
      setLastSavedAt(nextSnapshot.updatedAt);
    } else {
      setLastSavedAt(new Date().toISOString());
    }
  }, []);

  const flushLocalChangesBeforeServerMutation = useCallback(async () => {
    if (!allowBackend) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (localRevisionRef.current <= savedRevisionRef.current) return;
    await persistSnapshotToBackend("pre-server-mutation", { force: true });
    while (autosaveInFlightRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (localRevisionRef.current > savedRevisionRef.current) {
      await persistSnapshotToBackend("pre-server-mutation", { force: true });
    }
  }, [allowBackend, persistSnapshotToBackend]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const interval = setInterval(() => {
      void persistSnapshotToBackend("interval");
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasUnsavedChanges, persistSnapshotToBackend]);

  useEffect(() => {
    const flushNow = () => {
      if (localRevisionRef.current <= savedRevisionRef.current) return;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      void persistSnapshotToBackend("lifecycle", { force: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushNow();
      }
    };
    const handleBlur = () => flushNow();
    const handleBeforeUnload = () => flushNow();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [persistSnapshotToBackend]);

  const runMutation = async <T extends { snapshot?: EditorSnapshot }>(
    fn: () => Promise<T>,
    options?: {
      localApply?: (draft: EditorSnapshot) => void;
      unavailableMessage?: string;
      serverMode?: "local-first" | "immediate";
    }
  ) => {
    const shouldApplyLocally =
      Boolean(options?.localApply) && (!allowBackend || options?.serverMode !== "immediate");

    if (!allowBackend || shouldApplyLocally) {
      const current = snapshotRef.current;
      if (!current) return;
      if (!options?.localApply) {
        setError(
          options?.unavailableMessage || "This action is available after saving this draft to an account."
        );
        return;
      }
      setError(null);
      try {
        const next = cloneSnapshot(current);
        options.localApply(next);
        applySnapshot(next);
        markLocalSnapshotDirty();
      } catch (err: any) {
        setError(err?.message || "Could not apply local change.");
      }
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await flushLocalChangesBeforeServerMutation();
      const data = await fn();
      if (data.snapshot) {
        applySnapshot(data.snapshot);
        markServerSnapshotSynced(data.snapshot);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const getTempNoteId = useCallback(() => {
    const current = snapshotRef.current;
    const nextId = nextLocalNoteId(current, tempNoteIdRef.current);
    tempNoteIdRef.current = nextId + 1;
    return nextId;
  }, []);

  const getTempChordId = useCallback(() => {
    const current = snapshotRef.current;
    const nextId = nextLocalChordId(current, tempChordIdRef.current);
    tempChordIdRef.current = nextId + 1;
    return nextId;
  }, []);

  const resolveNoteId = useCallback(
    (id: number) => (id < 0 ? noteIdMapRef.current.get(id) ?? id : id),
    []
  );

  const resolveChordId = useCallback(
    (id: number) => (id < 0 ? chordIdMapRef.current.get(id) ?? id : id),
    []
  );

  const noteSignature = useCallback((startTime: number, length: number, tab: TabCoord) => {
    return `${startTime}|${length}|${tab[0]}|${tab[1]}`;
  }, []);

  const chordSignature = useCallback((startTime: number, length: number, tabs: TabCoord[]) => {
    const tabKey = tabs.map((tab) => `${tab[0]}|${tab[1]}`).join(",");
    return `${startTime}|${length}|${tabKey}`;
  }, []);

  const applyNoteIdMapping = useCallback(
    (mapping: Map<number, number>) => {
      if (!mapping.size) return;
      mapping.forEach((real, temp) => noteIdMapRef.current.set(temp, real));
      setSelectedNoteIds((prev) => prev.map((id) => mapping.get(id) ?? id));
      setNoteMenuNoteId((prev) => (prev !== null ? mapping.get(prev) ?? prev : prev));
      setResizingNote((prev) => (prev ? { ...prev, id: mapping.get(prev.id) ?? prev.id } : prev));
      setDragging((prev) => {
        if (!prev || prev.type !== "note") return prev;
        return { ...prev, id: mapping.get(prev.id) ?? prev.id };
      });
    },
    [setSelectedNoteIds, setNoteMenuNoteId, setResizingNote, setDragging]
  );

  const applyChordIdMapping = useCallback(
    (mapping: Map<number, number>) => {
      if (!mapping.size) return;
      mapping.forEach((real, temp) => chordIdMapRef.current.set(temp, real));
      setSelectedChordIds((prev) => prev.map((id) => mapping.get(id) ?? id));
      setChordMenuChordId((prev) => (prev !== null ? mapping.get(prev) ?? prev : prev));
      setEditingChordId((prev) => (prev !== null ? mapping.get(prev) ?? prev : prev));
      setResizingChord((prev) => (prev ? { ...prev, id: mapping.get(prev.id) ?? prev.id } : prev));
      setDragging((prev) => {
        if (!prev || prev.type !== "chord") return prev;
        return { ...prev, id: mapping.get(prev.id) ?? prev.id };
      });
    },
    [setSelectedChordIds, setChordMenuChordId, setEditingChordId, setResizingChord, setDragging]
  );

  const processMutationQueue = useCallback(async () => {
    if (mutationProcessingRef.current) return;
    mutationProcessingRef.current = true;
    while (pendingMutationsRef.current.length) {
      const mutation = pendingMutationsRef.current[0];
      try {
        const data = await mutation.commit();
        if (data.snapshot) {
          const serverSnapshot = data.snapshot;
          if (mutation.createdNotes?.length) {
            const beforeIds = new Set(mutation.before.notes.map((note) => note.id));
            const candidates = serverSnapshot.notes.filter((note) => !beforeIds.has(note.id));
            const bySignature = new Map<string, number[]>();
            candidates.forEach((note) => {
              const signature = noteSignature(note.startTime, note.length, note.tab);
              const list = bySignature.get(signature) ?? [];
              list.push(note.id);
              bySignature.set(signature, list);
            });
            const mapping = new Map<number, number>();
            mutation.createdNotes.forEach((created) => {
              const list = bySignature.get(created.signature);
              if (list && list.length) {
                mapping.set(created.tempId, list.shift() as number);
              }
            });
            applyNoteIdMapping(mapping);
          }
          if (mutation.createdChords?.length) {
            const beforeIds = new Set(mutation.before.chords.map((chord) => chord.id));
            const candidates = serverSnapshot.chords.filter((chord) => !beforeIds.has(chord.id));
            const bySignature = new Map<string, number[]>();
            candidates.forEach((chord) => {
              const signature = chordSignature(chord.startTime, chord.length, chord.currentTabs);
              const list = bySignature.get(signature) ?? [];
              list.push(chord.id);
              bySignature.set(signature, list);
            });
            const mapping = new Map<number, number>();
            mutation.createdChords.forEach((created) => {
              const list = bySignature.get(created.signature);
              if (list && list.length) {
                mapping.set(created.tempId, list.shift() as number);
              }
            });
            applyChordIdMapping(mapping);
          }
          pendingMutationsRef.current.shift();
          let nextSnapshot = serverSnapshot;
          pendingMutationsRef.current.forEach((pending) => {
            nextSnapshot = pending.apply(cloneSnapshot(nextSnapshot));
          });
          applySnapshot(nextSnapshot, { recordUndo: false, recordHistory: false });
        } else {
          pendingMutationsRef.current.shift();
        }
      } catch (err: any) {
        pendingMutationsRef.current.shift();
        setError(err?.message || "Something went wrong.");
        let nextSnapshot = mutation.before;
        pendingMutationsRef.current.forEach((pending) => {
          nextSnapshot = pending.apply(cloneSnapshot(nextSnapshot));
        });
        applySnapshot(nextSnapshot, { recordUndo: false, recordHistory: false });
        undoRef.current = [];
        redoRef.current = [];
        setUndoCount(0);
        setRedoCount(0);
      }
    }
    mutationProcessingRef.current = false;
  }, [
    applySnapshot,
    applyChordIdMapping,
    applyNoteIdMapping,
    chordSignature,
    cloneSnapshot,
    noteSignature,
  ]);

  const enqueueOptimisticMutation = useCallback(
    (input: {
      label: string;
      apply: (snapshot: EditorSnapshot) => EditorSnapshot;
      commit: () => Promise<{ snapshot?: EditorSnapshot }>;
      createdNotes?: TempNoteMapping[];
      createdChords?: TempChordMapping[];
      serverMode?: "local-first" | "immediate";
    }) => {
      const current = snapshotRef.current;
      if (!current) return;
      setError(null);
      const before = cloneSnapshot(current);
      const optimistic = input.apply(cloneSnapshot(before));
      mutationSeqRef.current += 1;
      applySnapshot(optimistic);
      markLocalSnapshotDirty();
      if (!allowBackend || input.serverMode !== "immediate") {
        return;
      }
      pendingMutationsRef.current.push({
        id: mutationSeqRef.current,
        label: input.label,
        before,
        optimistic,
        apply: input.apply,
        commit: input.commit,
        createdNotes: input.createdNotes,
        createdChords: input.createdChords,
      });
      void processMutationQueue();
    },
    [allowBackend, applySnapshot, cloneSnapshot, markLocalSnapshotDirty, processMutationQueue]
  );

  const handleUndo = useCallback(() => {
    if (busy) return;
    const undoList = undoRef.current;
    if (!undoList.length) return;
    const previous = undoList[undoList.length - 1];
    const current = snapshotRef.current;
    if (!current) return;
    setError(null);
    const nextUndo = undoList.slice(0, -1);
    const nextRedo = [...redoRef.current, cloneSnapshot(current)];
    undoRef.current = nextUndo;
    redoRef.current = nextRedo;
    setUndoCount(nextUndo.length);
    setRedoCount(nextRedo.length);
    applySnapshot(cloneSnapshot(previous), { recordUndo: false, recordHistory: false });
    markLocalSnapshotDirty();
  }, [applySnapshot, busy, cloneSnapshot, markLocalSnapshotDirty]);

  const handleRedo = useCallback(() => {
    if (busy) return;
    const redoList = redoRef.current;
    if (!redoList.length) return;
    const next = redoList[redoList.length - 1];
    const current = snapshotRef.current;
    if (!current) return;
    setError(null);
    const nextRedo = redoList.slice(0, -1);
    const nextUndo = [...undoRef.current, cloneSnapshot(current)];
    undoRef.current = nextUndo;
    redoRef.current = nextRedo;
    setUndoCount(nextUndo.length);
    setRedoCount(nextRedo.length);
    applySnapshot(cloneSnapshot(next), { recordUndo: false, recordHistory: false });
    markLocalSnapshotDirty();
  }, [applySnapshot, busy, cloneSnapshot, markLocalSnapshotDirty]);

  const requestUndo = useCallback(() => {
    if (onRequestUndo) {
      onRequestUndo();
      return;
    }
    void handleUndo();
  }, [handleUndo, onRequestUndo]);

  const requestRedo = useCallback(() => {
    if (onRequestRedo) {
      onRequestRedo();
      return;
    }
    void handleRedo();
  }, [handleRedo, onRequestRedo]);

  const clamp = useCallback(
    (value: number, min: number, max: number) => Math.max(min, Math.min(value, max)),
    []
  );

  const snapStartTimeToGrid = useCallback(
    (startTime: number) => {
      const safeStart = Math.max(0, Math.round(startTime));
      if (!snapToGridEnabled) {
        return safeStart;
      }
      const frames = FIXED_FRAMES_PER_BAR;
      const beats = Math.max(1, Math.min(64, Math.round(timeSignature)));
      const signatureLength = Math.max(1, Math.floor(frames / beats));
      const barIndex = Math.floor(safeStart / frames);
      const barOffset = barIndex * frames;
      const inBarStart = safeStart - barOffset;
      const signatureIndex = Math.floor(inBarStart / signatureLength);
      return Math.max(0, signatureIndex * signatureLength + barOffset);
    },
    [snapToGridEnabled, timeSignature]
  );

  const snapNoteToGrid = useCallback(
    (startTime: number, length: number) => {
      const safeLength = clampEventLength(length);
      if (!snapToGridEnabled) {
        return {
          startTime: Math.max(0, Math.round(startTime)),
          length: safeLength,
        };
      }
      const frames = FIXED_FRAMES_PER_BAR;
      const beats = Math.max(1, Math.min(64, Math.round(timeSignature)));
      const signatureLength = Math.max(1, Math.floor(frames / beats));
      const snappedStart = snapStartTimeToGrid(startTime);
      const lengthIndex = Math.max(1, Math.floor(safeLength / signatureLength));
      const snappedLength = lengthIndex * signatureLength;
      return { startTime: snappedStart, length: clampEventLength(snappedLength) };
    },
    [snapStartTimeToGrid, snapToGridEnabled, timeSignature]
  );

  const snapLengthToGrid = useCallback(
    (length: number) => {
      const safeLength = clampEventLength(length);
      if (!snapToGridEnabled) {
        return safeLength;
      }
      const frames = FIXED_FRAMES_PER_BAR;
      const beats = Math.max(1, Math.min(64, Math.round(timeSignature)));
      const signatureLength = Math.max(1, Math.floor(frames / beats));
      const signatureAmount = Math.max(1, Math.floor(safeLength / signatureLength));
      return clampEventLength(signatureAmount * signatureLength);
    },
    [snapToGridEnabled, timeSignature]
  );

  const computeScalePreview = useCallback(
    (session: ScaleSession, factor: number, mode: ScaleToolMode) => {
      const normalizedFactor = clamp(factor, SCALE_FACTOR_MIN, SCALE_FACTOR_MAX);
      const signatureLength = Math.max(1, Math.floor(framesPerMeasure / Math.max(1, Math.round(timeSignature))));
      const scaleStart = mode === "start" || mode === "both";
      const scaleLength = mode === "length" || mode === "both";
      const notes: Record<number, ScalePreviewEntity> = {};
      const chords: Record<number, ScalePreviewEntity> = {};
      let maxEnd = 0;

      const scaleStartTime = (value: number) => {
        let next = Math.trunc((value - session.minTime) * normalizedFactor + session.minTime);
        if (snapToGridEnabled) {
          const barIndex = Math.trunc(next / framesPerMeasure);
          const barOffset = framesPerMeasure * barIndex;
          const inBar = next - barOffset;
          const signatureIndex = Math.trunc(inBar / signatureLength);
          next = signatureIndex * signatureLength + barOffset;
        }
        return Math.max(0, next);
      };

      const scaleItemLength = (value: number) => {
        if (snapToGridEnabled) {
          const amount = Math.max(1, Math.round((value * normalizedFactor) / signatureLength));
          return clampEventLength(amount * signatureLength);
        }
        return clampEventLength(Math.trunc(value * normalizedFactor));
      };

      session.notes.forEach((note) => {
        const nextStart = scaleStart ? scaleStartTime(note.startTime) : note.startTime;
        const nextLength = scaleLength ? scaleItemLength(note.length) : note.length;
        notes[note.id] = { startTime: nextStart, length: nextLength };
        maxEnd = Math.max(maxEnd, nextStart + nextLength);
      });

      session.chords.forEach((chord) => {
        const nextStart = scaleStart ? scaleStartTime(chord.startTime) : chord.startTime;
        const nextLength = scaleLength ? scaleItemLength(chord.length) : chord.length;
        chords[chord.id] = { startTime: nextStart, length: nextLength };
        maxEnd = Math.max(maxEnd, nextStart + nextLength);
      });

      return { notes, chords, maxEnd, factor: normalizedFactor };
    },
    [clamp, framesPerMeasure, snapToGridEnabled, timeSignature]
  );

  const applyScalePreview = useCallback(
    (
      factor: number,
      options?: { mode?: ScaleToolMode; syncInput?: boolean; cursor?: { x: number; y: number } }
    ) => {
      const session = scaleSessionRef.current;
      if (!session) return;
      const mode = options?.mode ?? scaleToolMode;
      const preview = computeScalePreview(session, factor, mode);
      setScalePreviewNotes(preview.notes);
      setScalePreviewChords(preview.chords);
      setScalePreviewMaxEnd(preview.maxEnd);
      setScaleFactor(preview.factor);
      if (options?.syncInput !== false) {
        setScaleFactorInput(formatScaleFactor(preview.factor));
      }
      if (options?.cursor) {
        setScaleHudPosition(options.cursor);
      }
    },
    [computeScalePreview, scaleToolMode]
  );

  const deactivateScaleTool = useCallback(() => {
    setScaleToolActive(false);
    setScaleFactor(1);
    setScaleFactorInput("1");
    setScalePreviewNotes({});
    setScalePreviewChords({});
    setScalePreviewMaxEnd(0);
    setScaleHudPosition(null);
    scaleSessionRef.current = null;
    scaleFactorTypingRef.current = null;
    scaleFactorTypingAtRef.current = 0;
  }, []);

  const activateScaleTool = useCallback(
    (anchor?: { x: number; y: number }) => {
      const notes = snapshot.notes
        .filter((note) => selectedNoteIds.includes(note.id))
        .map((note) => ({ id: note.id, startTime: note.startTime, length: note.length }));
      const chords = snapshot.chords
        .filter((chord) => selectedChordIds.includes(chord.id))
        .map((chord) => ({ id: chord.id, startTime: chord.startTime, length: chord.length }));
      if (!notes.length && !chords.length) {
        setError("Select at least one note/chord before using Scale.");
        return false;
      }
      setError(null);
      const minTime = Math.min(
        ...notes.map((item) => item.startTime),
        ...chords.map((item) => item.startTime)
      );
      const nextAnchor = anchor ?? mousePosRef.current;
      scaleSessionRef.current = {
        anchorX: nextAnchor.x,
        notes,
        chords,
        minTime: Number.isFinite(minTime) ? minTime : 0,
      };
      setCutToolActive(false);
      setSliceToolActive(false);
      setScaleToolActive(true);
      scaleFactorTypingRef.current = null;
      scaleFactorTypingAtRef.current = 0;
      applyScalePreview(1, { syncInput: true, cursor: nextAnchor });
      return true;
    },
    [applyScalePreview, selectedChordIds, selectedNoteIds, snapshot.chords, snapshot.notes]
  );

  const commitScaleTool = useCallback(() => {
    if (!scaleToolActive) return false;
    const session = scaleSessionRef.current;
    if (!session) {
      deactivateScaleTool();
      return false;
    }
    const preview = computeScalePreview(session, scaleFactor, scaleToolMode);
    const noteUpdates = session.notes
      .map((item) => {
        const next = preview.notes[item.id];
        if (!next) return null;
        const changedStart = next.startTime !== item.startTime;
        const changedLength = next.length !== item.length;
        if (!changedStart && !changedLength) return null;
        return {
          id: item.id,
          startTime: next.startTime,
          length: next.length,
          changedStart,
          changedLength,
        };
      })
      .filter(
        (
          item
        ): item is {
          id: number;
          startTime: number;
          length: number;
          changedStart: boolean;
          changedLength: boolean;
        } => Boolean(item)
      );
    const chordUpdates = session.chords
      .map((item) => {
        const next = preview.chords[item.id];
        if (!next) return null;
        const changedStart = next.startTime !== item.startTime;
        const changedLength = next.length !== item.length;
        if (!changedStart && !changedLength) return null;
        return {
          id: item.id,
          startTime: next.startTime,
          length: next.length,
          changedStart,
          changedLength,
        };
      })
      .filter(
        (
          item
        ): item is {
          id: number;
          startTime: number;
          length: number;
          changedStart: boolean;
          changedLength: boolean;
        } => Boolean(item)
      );

    const nextTotalFrames =
      preview.maxEnd > 0
        ? Math.max(
            framesPerMeasure,
            Math.ceil(Math.max(preview.maxEnd, framesPerMeasure) / framesPerMeasure) * framesPerMeasure
          )
        : framesPerMeasure;

    deactivateScaleTool();
    if (!noteUpdates.length && !chordUpdates.length) {
      return true;
    }

    enqueueOptimisticMutation({
      label: `scale-${scaleToolMode}`,
      apply: (draft) => {
        noteUpdates.forEach((update) => {
          const noteId = resolveNoteId(update.id);
          const note = draft.notes.find((item) => item.id === noteId);
          if (!note) return;
          note.startTime = update.startTime;
          note.length = update.length;
        });
        chordUpdates.forEach((update) => {
          const chordId = resolveChordId(update.id);
          const chord = draft.chords.find((item) => item.id === chordId);
          if (!chord) return;
          chord.startTime = update.startTime;
          chord.length = update.length;
        });
        draft.totalFrames = Math.max(Number(draft.totalFrames || 0), nextTotalFrames);
        return draft;
      },
      commit: async () => {
        let last: { snapshot?: EditorSnapshot } | null = null;
        for (const update of noteUpdates) {
          const noteId = resolveNoteId(update.id);
          if (update.changedStart) {
            last = await gteApi.setNoteStartTime(
              editorId,
              noteId,
              update.startTime,
              snapToGridEnabled
            );
          }
          if (update.changedLength) {
            last = await gteApi.setNoteLength(editorId, noteId, update.length, snapToGridEnabled);
          }
        }
        for (const update of chordUpdates) {
          const chordId = resolveChordId(update.id);
          if (update.changedStart) {
            last = await gteApi.setChordStartTime(
              editorId,
              chordId,
              update.startTime,
              snapToGridEnabled
            );
          }
          if (update.changedLength) {
            last = await gteApi.setChordLength(editorId, chordId, update.length, snapToGridEnabled);
          }
        }
        return last ?? {};
      },
    });
    return true;
  }, [
    computeScalePreview,
    deactivateScaleTool,
    editorId,
    enqueueOptimisticMutation,
    framesPerMeasure,
    resolveChordId,
    resolveNoteId,
    scaleFactor,
    scaleToolActive,
    scaleToolMode,
    snapToGridEnabled,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(SCALE_TOOL_MODE_STORAGE_KEY);
      if (isScaleToolMode(stored)) {
        setScaleToolMode(stored);
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SCALE_TOOL_MODE_STORAGE_KEY, scaleToolMode);
    } catch {
      // no-op
    }
  }, [scaleToolMode]);

  useEffect(() => {
    if (!scaleToolActive) return;
    if (!scaleSessionRef.current) return;
    applyScalePreview(scaleFactor, { mode: scaleToolMode, syncInput: false });
  }, [applyScalePreview, scaleFactor, scaleToolActive, scaleToolMode, snapToGridEnabled, timeSignature]);

  useEffect(() => {
    if (!scaleToolActive) return;
    const handleMove = (event: globalThis.MouseEvent) => {
      const session = scaleSessionRef.current;
      if (!session) return;
      const deltaX = event.clientX - session.anchorX;
      const nextFactor = 1 + deltaX / SCALE_FACTOR_DRAG_PIXELS;
      applyScalePreview(nextFactor, {
        mode: scaleToolMode,
        syncInput: true,
        cursor: { x: event.clientX, y: event.clientY },
      });
    };
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
    };
  }, [applyScalePreview, scaleToolActive, scaleToolMode]);

  useEffect(() => {
    if (!scaleToolActive) return;
    const handleMouseDownCapture = (event: globalThis.MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (toolbarRef.current && toolbarRef.current.contains(target)) return;
      if (scaleHudRef.current && scaleHudRef.current.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      commitScaleTool();
    };
    window.addEventListener("mousedown", handleMouseDownCapture, true);
    return () => {
      window.removeEventListener("mousedown", handleMouseDownCapture, true);
    };
  }, [commitScaleTool, scaleToolActive]);

  useEffect(() => {
    if (!floatingPanelDrag) return;
    const handleMove = (event: globalThis.MouseEvent) => {
      const nextAnchor = clampFloatingPanelAnchor(
        event.clientX - floatingPanelDrag.offsetX,
        event.clientY - floatingPanelDrag.offsetY,
        floatingPanelDrag.width,
        floatingPanelDrag.height
      );
      if (floatingPanelDrag.panel === "note") {
        setNoteMenuAnchor(nextAnchor);
      } else {
        setChordMenuAnchor(nextAnchor);
      }
    };
    const handleUp = () => {
      setFloatingPanelDrag(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [floatingPanelDrag]);

  useEffect(() => {
    if (!scaleToolActive) return;
    if (selectedNoteIds.length + selectedChordIds.length > 0) return;
    deactivateScaleTool();
  }, [deactivateScaleTool, scaleToolActive, selectedChordIds.length, selectedNoteIds.length]);

  const getSpanSegments = (startTime: number, length: number) => {
    const safeLength = Math.max(1, Math.round(length));
    const endTime = startTime + safeLength;
    if (rowFrames <= 0) {
      return [
        {
          rowIndex: 0,
          rowStart: 0,
          rowEnd: safeLength,
          segStart: startTime,
          segEnd: endTime,
          inRowStart: startTime,
          length: safeLength,
        },
      ];
    }
    const startRow = Math.floor(startTime / rowFrames);
    const endRow = Math.floor(Math.max(endTime - 1, startTime) / rowFrames);
    const segments: Array<{
      rowIndex: number;
      rowStart: number;
      rowEnd: number;
      segStart: number;
      segEnd: number;
      inRowStart: number;
      length: number;
    }> = [];
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      if (rowIndex < 0 || rowIndex >= rows) continue;
      const rowBarCount = getRowBarCount(rowIndex);
      const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
      const rowStart = rowIndex * rowFrames;
      const rowEnd = rowStart + availableFrames;
      const segStart = Math.max(startTime, rowStart);
      const segEnd = Math.min(endTime, rowEnd);
      if (segEnd <= segStart) continue;
      segments.push({
        rowIndex,
        rowStart,
        rowEnd,
        segStart,
        segEnd,
        inRowStart: segStart - rowStart,
        length: segEnd - segStart,
      });
    }
    return segments;
  };

  useEffect(() => {
    if (!sliceToolActive) {
      setSliceCursor(null);
    }
  }, [sliceToolActive]);

  const toggleCutTool = useCallback(() => {
    setCutToolActive((prev) => {
      const next = !prev;
      if (next) {
        setSliceToolActive(false);
        deactivateScaleTool();
      }
      return next;
    });
  }, [deactivateScaleTool]);

  const toggleSliceTool = useCallback(() => {
    setSliceToolActive((prev) => {
      const next = !prev;
      if (next) {
        setCutToolActive(false);
        deactivateScaleTool();
      }
      return next;
    });
  }, [deactivateScaleTool]);

  const toggleScaleTool = useCallback(() => {
    if (scaleToolActive) {
      deactivateScaleTool();
      return;
    }
    activateScaleTool();
  }, [activateScaleTool, deactivateScaleTool, scaleToolActive]);

  const cycleScaleToolModeWithShortcut = useCallback(() => {
    const idx = SCALE_TOOL_MODES.indexOf(scaleToolMode);
    const nextMode =
      idx >= 0
        ? SCALE_TOOL_MODES[(idx + 1) % SCALE_TOOL_MODES.length]
        : SCALE_TOOL_MODES[0];
    setScaleToolMode(nextMode);
    if (scaleToolActive) {
      applyScalePreview(scaleFactor, { mode: nextMode, syncInput: false });
    }
  }, [applyScalePreview, scaleFactor, scaleToolActive, scaleToolMode]);

  const handleScaleFactorInputChange = useCallback(
    (value: string) => {
      setScaleFactorInput(value);
      if (value.trim() === "") return;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return;
      applyScalePreview(parsed, { mode: scaleToolMode, syncInput: false });
      scaleFactorTypingRef.current = value;
      scaleFactorTypingAtRef.current = Date.now();
    },
    [applyScalePreview, scaleToolMode]
  );

  const getPointerFrame = (clientX: number, clientY: number) => {
    if (!timelineRef.current) return null;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, timelineWidth);
    const y = clamp(clientY - rect.top, 0, timelineHeight);
    const rowIndex = clamp(Math.floor(y / rowStride), 0, rows - 1);
    const rowBarCount = getRowBarCount(rowIndex);
    const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
    const rowStart = rowIndex * rowFrames;
    const rowWidth = availableFrames * scale;
    const localX = clamp(x, 0, rowWidth);
    const rawTime = rowStart + Math.round(localX / scale);
    const snappedTime = getSnapTime(rawTime, { min: rowStart, max: rowStart + availableFrames });
    const time = clamp(snappedTime, rowStart, rowStart + availableFrames);
    return { time, rowIndex };
  };

  const handleSliceAtTime = (sliceTime: number) => {
    const notesToSlice = snapshot.notes
      .filter((note) => selectedNoteIds.includes(note.id))
      .map((note) => {
        const start = note.startTime;
        const end = note.startTime + note.length;
        if (sliceTime <= start || sliceTime >= end) return null;
        const leftLength = clampEventLength(sliceTime - start);
        const rightLength = clampEventLength(end - sliceTime);
        if (leftLength < 1 || rightLength < 1) return null;
        return {
          id: note.id,
          tab: note.tab as TabCoord,
          start,
          leftLength,
          rightLength,
          tempId: getTempNoteId(),
        };
      })
      .filter(
        (
          item
        ): item is {
          id: number;
          tab: TabCoord;
          start: number;
          leftLength: number;
          rightLength: number;
          tempId: number;
        } => Boolean(item)
      );
    const chordsToSlice = snapshot.chords
      .filter((chord) => selectedChordIds.includes(chord.id))
      .map((chord) => {
        const start = chord.startTime;
        const end = chord.startTime + chord.length;
        if (sliceTime <= start || sliceTime >= end) return null;
        const leftLength = sliceTime - start;
        const rightLength = end - sliceTime;
        if (leftLength < 1 || rightLength < 1) return null;
        return {
          id: chord.id,
          start,
          leftLength,
          rightLength,
          tempId: getTempChordId(),
          currentTabs: chord.currentTabs.map((tab) => [tab[0], tab[1]] as TabCoord),
          ogTabs: chord.ogTabs.map((tab) => [tab[0], tab[1]] as TabCoord),
          originalMidi: chord.originalMidi.slice(),
        };
      })
      .filter(
        (
          item
        ): item is {
          id: number;
          start: number;
          leftLength: number;
          rightLength: number;
          tempId: number;
          currentTabs: TabCoord[];
          ogTabs: TabCoord[];
          originalMidi: number[];
        } => Boolean(item)
      );
    if (!notesToSlice.length && !chordsToSlice.length) return;
    const createdNotes: TempNoteMapping[] = notesToSlice.map((note) => ({
      tempId: note.tempId,
      signature: noteSignature(sliceTime, note.rightLength, note.tab),
    }));
    const createdChords: TempChordMapping[] = chordsToSlice.map((chord) => ({
      tempId: chord.tempId,
      signature: chordSignature(sliceTime, chord.rightLength, chord.currentTabs),
    }));
    enqueueOptimisticMutation({
      label: "slice",
      createdNotes,
      createdChords,
      apply: (draft) => {
        notesToSlice.forEach((note) => {
          const noteId = resolveNoteId(note.id);
          const target = draft.notes.find((item) => item.id === noteId);
          if (!target) return;
          target.length = note.leftLength;
          draft.notes.push({
            id: note.tempId,
            startTime: sliceTime,
            length: note.rightLength,
            midiNum: 0,
            tab: [note.tab[0], note.tab[1]],
            optimals: [],
          });
        });
        chordsToSlice.forEach((chord) => {
          const chordId = resolveChordId(chord.id);
          const target = draft.chords.find((item) => item.id === chordId);
          if (!target) return;
          target.length = chord.leftLength;
          draft.chords.push({
            id: chord.tempId,
            startTime: sliceTime,
            length: chord.rightLength,
            originalMidi: chord.originalMidi.slice(),
            currentTabs: chord.currentTabs.map((tab) => [tab[0], tab[1]] as TabCoord),
            ogTabs: chord.ogTabs.map((tab) => [tab[0], tab[1]] as TabCoord),
          });
        });
        return draft;
      },
      commit: async () => {
        let last: { snapshot?: EditorSnapshot } | null = null;
        for (const note of notesToSlice) {
          await gteApi.setNoteLength(
            editorId,
            resolveNoteId(note.id),
            clampEventLength(note.leftLength),
            false
          );
          last = await gteApi.addNote(editorId, {
            tab: note.tab,
            startTime: sliceTime,
            length: clampEventLength(note.rightLength),
            snapToGrid: false,
          });
        }
        for (const chord of chordsToSlice) {
          last = await gteApi.sliceChord(editorId, resolveChordId(chord.id), sliceTime);
        }
        return last ?? {};
      },
    });
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (clientX: number, clientY: number) => {
      if (!timelineRef.current) return;
      const dragStartPointer = dragStartPointerRef.current;
      const hasMoved =
        !dragStartPointer ||
        Math.abs(clientX - dragStartPointer.x) > SINGLE_DRAG_ACTIVATION_DISTANCE_PX ||
        Math.abs(clientY - dragStartPointer.y) > SINGLE_DRAG_ACTIVATION_DISTANCE_PX;
      if (!hasMoved) return;
      singleDragMovedRef.current = true;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clamp(clientX - rect.left, 0, timelineWidth);
      const y = clamp(clientY - rect.top, 0, Math.max(0, timelineHeight));
      const rowIndex = clamp(Math.floor(y / rowStride), 0, rows - 1);
      const rowStart = rowIndex * rowFrames;
      const safeLength = Math.max(1, Math.round(dragging.length));
      const maxStart = Math.max(0, timelineEnd - safeLength);
      const rawStart = Math.round(x / scale) - dragging.grabOffsetFrames + rowStart;
      const snappedStart = getSnapTime(rawStart, {
        excludeNoteIds: dragging.type === "note" ? [dragging.id] : [],
        excludeChordIds: dragging.type === "chord" ? [dragging.id] : [],
      });
      const clampedStart = clamp(snappedStart, 0, maxStart);
      const startTime =
        dragging.type === "note"
          ? clamp(snapStartTimeToGrid(clampedStart), 0, maxStart)
          : clamp(snapStartTimeToGrid(clampedStart), 0, maxStart);
      if (dragging.type === "note") {
        const localY = y - rowIndex * rowStride;
        const stringIndex = multiTrackSelectionActive
          ? dragging.stringIndex
          : clamp(Math.floor(localY / ROW_HEIGHT), 0, 5);
        const next = { startTime, stringIndex };
        dragPreviewRef.current = next;
        setDragPreview(next);
      } else {
        const next = { startTime };
        dragPreviewRef.current = next;
        setDragPreview(next);
      }
    };
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      handleMove(event.clientX, event.clientY);
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      handleMove(touch.clientX, touch.clientY);
    };
    const handleUp = () => {
      const preview = dragPreviewRef.current;
      if (!preview) {
        dragStartPointerRef.current = null;
        singleDragMovedRef.current = false;
        setDragging(null);
        setDragPreview(null);
        return;
      }
      if (!singleDragMovedRef.current) {
        dragStartPointerRef.current = null;
        setDragging(null);
        setDragPreview(null);
        return;
      }
      if (dragging.type === "note") {
        const targetString = preview.stringIndex ?? dragging.stringIndex ?? 0;
        const safeLength = Math.max(1, Math.round(dragging.length));
        const rawStart = Math.round(preview.startTime ?? dragging.startTime);
        const maxStart = Math.max(0, timelineEnd - safeLength);
        const clampedStart = clamp(rawStart, 0, maxStart);
        const targetStart = clamp(snapStartTimeToGrid(clampedStart), 0, maxStart);
        const didChangeString = targetString !== dragging.stringIndex;
        const didChangeStart = targetStart !== dragging.startTime;
        if (
          didChangeStart &&
          multiTrackSelectionActive &&
          onRequestGlobalSelectedShift &&
          onRequestGlobalSelectedShift(targetStart - dragging.startTime) !== false
        ) {
          dragStartPointerRef.current = null;
          setDragging(null);
          setDragPreview(null);
          return;
        }
        if (didChangeString || didChangeStart) {
          const nextTab: TabCoord = [targetString, dragging.fret ?? 0];
          enqueueOptimisticMutation({
            label: "drag-note",
            apply: (draft) => {
              const noteId = resolveNoteId(dragging.id);
              const note = draft.notes.find((item) => item.id === noteId);
              if (!note) return draft;
              if (didChangeString) {
                note.tab = [targetString, note.tab[1]];
                note.midiNum = 0;
              }
              if (didChangeStart) {
                note.startTime = targetStart;
              }
              return draft;
            },
            commit: async () => {
              let last: { snapshot?: EditorSnapshot } | null = null;
              const resolvedId = resolveNoteId(dragging.id);
              if (didChangeString) {
                last = await gteApi.assignNoteTab(editorId, resolvedId, nextTab);
                playNotePreview(nextTab);
              }
              if (didChangeStart) {
                last = await gteApi.setNoteStartTime(
                  editorId,
                  resolvedId,
                  targetStart,
                  snapToGridEnabled
                );
              }
              return last ?? {};
            },
          });
        }
      } else if (dragging.type === "chord") {
        const safeLength = Math.max(1, Math.round(dragging.length));
        const rawStart = Math.round(preview.startTime ?? dragging.startTime);
        const maxStart = Math.max(0, timelineEnd - safeLength);
        const targetStart = clamp(snapStartTimeToGrid(rawStart), 0, maxStart);
        if (targetStart !== dragging.startTime) {
          if (
            multiTrackSelectionActive &&
            onRequestGlobalSelectedShift &&
            onRequestGlobalSelectedShift(targetStart - dragging.startTime) !== false
          ) {
            dragStartPointerRef.current = null;
            setDragging(null);
            setDragPreview(null);
            return;
          }
          enqueueOptimisticMutation({
            label: "drag-chord",
            apply: (draft) => {
              const chordId = resolveChordId(dragging.id);
              const chord = draft.chords.find((item) => item.id === chordId);
              if (!chord) return draft;
              chord.startTime = targetStart;
              return draft;
            },
            commit: () =>
              gteApi.setChordStartTime(
                editorId,
                resolveChordId(dragging.id),
                targetStart,
                snapToGridEnabled
              ),
          });
        }
      }
      dragStartPointerRef.current = null;
      setDragging(null);
      setDragPreview(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    window.addEventListener("touchcancel", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleUp);
      window.removeEventListener("touchcancel", handleUp);
    };
    }, [
      dragging,
      editorId,
      enqueueOptimisticMutation,
      playNotePreview,
      resolveChordId,
      resolveNoteId,
      onRequestGlobalSelectedShift,
      multiTrackSelectionActive,
      snapToGridEnabled,
      scale,
      totalFrames,
      rowFrames,
      rows,
      snapStartTimeToGrid,
      timelineHeight,
      timelineWidth,
    timelineEnd,
    snapCandidates,
    clamp,
  ]);

  useEffect(() => {
    if (!multiDrag) return;
    const shouldGridSnapStarts =
      snapToGridEnabled && (multiDrag.notes.length > 0 || multiDrag.chords.length > 0);

    const handleMove = (clientX: number, clientY: number) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clamp(clientX - rect.left, 0, timelineWidth);
      const y = clamp(clientY - rect.top, 0, Math.max(0, timelineHeight));
      const rowIndex = clamp(Math.floor(y / rowStride), 0, rows - 1);
      const rowStart = rowIndex * rowFrames;
      const rawStart = Math.round(x / scale) - multiDrag.anchorGrabOffsetFrames + rowStart;
      const snappedStart = getSnapTime(rawStart, {
        excludeNoteIds: multiDrag.notes.map((note) => note.id),
        excludeChordIds: multiDrag.chords.map((chord) => chord.id),
      });

      if (Math.abs(clientX - multiDragStartXRef.current) > 3) {
        multiDragMovedRef.current = true;
      }

      let minDelta = -Infinity;
      let maxDelta = Infinity;
      multiDrag.notes.forEach((note) => {
        minDelta = Math.max(minDelta, -note.startTime);
        maxDelta = Math.min(maxDelta, timelineEnd - note.length - note.startTime);
      });
      multiDrag.chords.forEach((chord) => {
        minDelta = Math.max(minDelta, -chord.startTime);
        maxDelta = Math.min(maxDelta, timelineEnd - chord.length - chord.startTime);
      });
      const anchorCandidate = shouldGridSnapStarts
        ? snapStartTimeToGrid(snappedStart)
        : snappedStart;
      const targetAnchorStart = clamp(
        anchorCandidate,
        multiDrag.anchorStart + minDelta,
        multiDrag.anchorStart + maxDelta
      );
      const delta = targetAnchorStart - multiDrag.anchorStart;
      multiDragDeltaRef.current = delta;
      setMultiDragDelta(delta);
    };

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      handleMove(event.clientX, event.clientY);
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      handleMove(touch.clientX, touch.clientY);
    };

    const handleUp = () => {
      const delta = multiDragDeltaRef.current ?? 0;
      if (delta !== 0) {
        if (
          multiTrackSelectionActive &&
          onRequestGlobalSelectedShift &&
          onRequestGlobalSelectedShift(delta) !== false
        ) {
          setMultiDrag(null);
          setMultiDragDelta(null);
          return;
        }
        enqueueOptimisticMutation({
          label: "multi-drag",
          apply: (draft) => {
            multiDrag.notes.forEach((note) => {
              const noteId = resolveNoteId(note.id);
              const target = draft.notes.find((item) => item.id === noteId);
              if (target) {
                const rawStart = note.startTime + delta;
                const maxStart = Math.max(0, timelineEnd - note.length);
                const snappedStart = shouldGridSnapStarts ? snapStartTimeToGrid(rawStart) : rawStart;
                target.startTime = clamp(snappedStart, 0, maxStart);
              }
            });
            multiDrag.chords.forEach((chord) => {
              const chordId = resolveChordId(chord.id);
              const target = draft.chords.find((item) => item.id === chordId);
              if (target) {
                const rawStart = chord.startTime + delta;
                const maxStart = Math.max(0, timelineEnd - chord.length);
                const snappedStart = snapStartTimeToGrid(rawStart);
                target.startTime = clamp(snappedStart, 0, maxStart);
              }
            });
            return draft;
          },
          commit: async () => {
            let last: { snapshot?: EditorSnapshot } | null = null;
            for (const note of multiDrag.notes) {
              const rawStart = note.startTime + delta;
              const maxStart = Math.max(0, timelineEnd - note.length);
              const snappedStart = shouldGridSnapStarts ? snapStartTimeToGrid(rawStart) : rawStart;
              const nextStart = clamp(snappedStart, 0, maxStart);
              last = await gteApi.setNoteStartTime(
                editorId,
                resolveNoteId(note.id),
                nextStart,
                snapToGridEnabled
              );
            }
            for (const chord of multiDrag.chords) {
              const rawStart = chord.startTime + delta;
              const maxStart = Math.max(0, timelineEnd - chord.length);
              const snappedStart = snapStartTimeToGrid(rawStart);
              const nextStart = clamp(snappedStart, 0, maxStart);
              last = await gteApi.setChordStartTime(
                editorId,
                resolveChordId(chord.id),
                nextStart,
                snapToGridEnabled
              );
            }
            return last ?? {};
          },
        });
      }
      setMultiDrag(null);
      setMultiDragDelta(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    window.addEventListener("touchcancel", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleUp);
      window.removeEventListener("touchcancel", handleUp);
    };
  }, [
      multiDrag,
      editorId,
      enqueueOptimisticMutation,
      resolveChordId,
      resolveNoteId,
      onRequestGlobalSelectedShift,
      multiTrackSelectionActive,
      snapToGridEnabled,
      snapStartTimeToGrid,
      clamp,
      scale,
      rowFrames,
      rowStride,
      rows,
    timelineHeight,
    timelineWidth,
    timelineEnd,
    snapCandidates,
  ]);

  useEffect(() => {
    if (!resizingNote) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, timelineWidth);
      const y = clamp(event.clientY - rect.top, 0, timelineHeight);
      const rowIndex = clamp(Math.floor(y / rowStride), 0, rows - 1);
      const rowStart = rowIndex * rowFrames;
      const rowBarCount = getRowBarCount(rowIndex);
      const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
      const rawEnd = rowStart + Math.round(x / scale);
      const snappedEnd = getSnapTime(rawEnd, {
        excludeNoteIds: [resizingNote.id],
        min: resizingNote.startTime + 1,
        max: rowStart + availableFrames,
      });
      const endFrame = clamp(snappedEnd, resizingNote.startTime + 1, rowStart + availableFrames);
      const nextLength = Math.max(1, endFrame - resizingNote.startTime);
      resizePreviewRef.current = nextLength;
      setResizePreviewLength(nextLength);
    };

      const handleUp = () => {
        const previewLength = resizePreviewRef.current ?? resizingNote.length;
        const snappedPreviewLength = allowBackend
          ? clampEventLength(previewLength)
          : snapLengthToGrid(previewLength);
        if (snappedPreviewLength !== resizingNote.length) {
          enqueueOptimisticMutation({
            label: "resize-note",
            apply: (draft) => {
              const noteId = resolveNoteId(resizingNote.id);
              const note = draft.notes.find((item) => item.id === noteId);
              if (!note) return draft;
              note.length = snappedPreviewLength;
              return draft;
            },
            commit: () =>
              gteApi.setNoteLength(
                editorId,
                resolveNoteId(resizingNote.id),
                snappedPreviewLength,
                snapToGridEnabled
              ),
          });
        }
        setResizingNote(null);
        setResizePreviewLength(null);
      };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    }, [
      resizingNote,
      allowBackend,
      editorId,
      enqueueOptimisticMutation,
      resolveNoteId,
      scale,
      totalFrames,
      rowFrames,
      timelineWidth,
      snapLengthToGrid,
      snapToGridEnabled,
    timelineHeight,
    clamp,
    framesPerMeasure,
    snapCandidates,
  ]);

  useEffect(() => {
    if (!resizingChord) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, timelineWidth);
      const y = clamp(event.clientY - rect.top, 0, timelineHeight);
      const rowIndex = clamp(Math.floor(y / rowStride), 0, rows - 1);
      const rowStart = rowIndex * rowFrames;
      const rowBarCount = getRowBarCount(rowIndex);
      const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
      const rawEnd = rowStart + Math.round(x / scale);
      const snappedEnd = getSnapTime(rawEnd, {
        excludeChordIds: [resizingChord.id],
        min: resizingChord.startTime + 1,
        max: rowStart + availableFrames,
      });
      const endFrame = clamp(snappedEnd, resizingChord.startTime + 1, rowStart + availableFrames);
      const nextLength = Math.max(1, endFrame - resizingChord.startTime);
      resizeChordPreviewRef.current = nextLength;
      setResizeChordPreviewLength(nextLength);
    };

      const handleUp = () => {
        const previewLength = resizeChordPreviewRef.current ?? resizingChord.length;
        const snappedPreviewLength = allowBackend
          ? clampEventLength(previewLength)
          : snapLengthToGrid(previewLength);
        if (snappedPreviewLength !== resizingChord.length) {
          enqueueOptimisticMutation({
            label: "resize-chord",
            apply: (draft) => {
              const chordId = resolveChordId(resizingChord.id);
              const chord = draft.chords.find((item) => item.id === chordId);
              if (!chord) return draft;
              chord.length = snappedPreviewLength;
              return draft;
            },
            commit: () =>
              gteApi.setChordLength(
                editorId,
                resolveChordId(resizingChord.id),
                snappedPreviewLength,
                snapToGridEnabled
              ),
          });
        }
        setResizingChord(null);
        setResizeChordPreviewLength(null);
      };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    }, [
      resizingChord,
      allowBackend,
      editorId,
      enqueueOptimisticMutation,
      resolveChordId,
      scale,
      rowFrames,
      timelineWidth,
      snapLengthToGrid,
      snapToGridEnabled,
    timelineHeight,
    clamp,
    framesPerMeasure,
    snapCandidates,
  ]);

  useEffect(() => {
    if (!draggingChordNote) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const y = clamp(event.clientY - rect.top, 0, timelineHeight);
      const rowIndex = clamp(Math.floor(y / rowStride), 0, rows - 1);
      const localY = y - rowIndex * rowStride;
      const stringIndex = clamp(Math.floor(localY / ROW_HEIGHT), 0, 5);
      if (Math.abs(event.clientY - chordNoteDragStartYRef.current) > 3) {
        chordNoteDragMovedRef.current = true;
      }
      dragChordNotePreviewRef.current = { stringIndex };
      setDragChordNotePreview({ stringIndex });
    };

    const handleUp = () => {
      const preview = dragChordNotePreviewRef.current;
      const moved = chordNoteDragMovedRef.current;
      chordNoteDragMovedRef.current = false;
      if (moved && preview) {
        const chord = snapshot.chords.find((item) => item.id === draggingChordNote.chordId);
        if (chord) {
          const nextTabs = chord.currentTabs.map((tab, idx) =>
            idx === draggingChordNote.tabIndex ? ([preview.stringIndex, tab[1]] as TabCoord) : tab
          );
          void runMutation(() => gteApi.setChordTabs(editorId, chord.id, nextTabs), {
            localApply: (draft) => {
              setChordTabsInSnapshot(draft, chord.id, nextTabs);
            },
          });
        }
      }
      setDraggingChordNote(null);
      setDragChordNotePreview(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    draggingChordNote,
    editorId,
    runMutation,
    clamp,
    rowStride,
    timelineHeight,
    snapshot.chords,
  ]);

  useEffect(() => {
    if (!selection) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, timelineWidth);
      const y = clamp(event.clientY - rect.top, 0, timelineHeight);
      setSelection((prev) => {
        if (!prev) return prev;
        const next = { ...prev, endX: x, endY: y };
        selectionRef.current = next;
        return next;
      });
    };

    const handleUp = () => {
      const current = selectionRef.current;
      if (!current) {
        setSelection(null);
        return;
      }
      const dx = Math.abs(current.endX - current.startX);
      const dy = Math.abs(current.endY - current.startY);
      if (dx < 4 && dy < 4) {
        const rowIndex = clamp(Math.floor(current.startY / rowStride), 0, rows - 1);
        const localY = current.startY - rowIndex * rowStride;
        if (localY < 0 || localY > rowHeight) {
          setDraftNote(null);
          setDraftNoteAnchor(null);
          setSelection(null);
          return;
        }
        const rowStart = rowIndex * rowFrames;
        const rowBarCount = getRowBarCount(rowIndex);
        const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
        const stringIndex = clamp(Math.floor(localY / ROW_HEIGHT), 0, 5);
        const startTime = clamp(
          Math.round(current.startX / scale) + rowStart,
          rowStart,
          rowStart + availableFrames - 1
        );
        const defaultLength = lastAddedNoteLengthRef.current;
        setDraftNote({
          stringIndex,
          startTime,
          length: defaultLength,
          fret: null,
        });
        if (timelineRef.current) {
          const rect = timelineRef.current.getBoundingClientRect();
          setDraftNoteAnchor({ x: rect.left + current.startX, y: rect.top + current.startY });
        } else {
          setDraftNoteAnchor({ x: current.startX, y: current.startY });
        }
      } else {
        const minX = Math.min(current.startX, current.endX);
        const maxX = Math.max(current.startX, current.endX);
        const minY = Math.min(current.startY, current.endY);
        const maxY = Math.max(current.startY, current.endY);
        const selectionRect = {
          left: minX,
          right: maxX,
          top: minY,
          bottom: maxY,
        };
        const selectedIds = snapshot.notes
          .map((note) => {
            const segments = getSpanSegments(note.startTime, note.length);
            const hit = segments.some((segment) => {
              const rect = {
                left: segment.inRowStart * scale,
                right: segment.inRowStart * scale + segment.length * scale,
                top: segment.rowIndex * rowStride + note.tab[0] * ROW_HEIGHT,
                bottom: segment.rowIndex * rowStride + (note.tab[0] + 1) * ROW_HEIGHT,
              };
              return (
                rect.left < selectionRect.right &&
                rect.right > selectionRect.left &&
                rect.top < selectionRect.bottom &&
                rect.bottom > selectionRect.top
              );
            });
            return hit ? note.id : null;
          })
          .filter((id): id is number => id !== null);
        const selectedChordIds = snapshot.chords
          .map((chord) => {
            const segments = getSpanSegments(chord.startTime, chord.length);
            const hit = chord.currentTabs.some((tab) =>
              segments.some((segment) => {
                const rect = {
                  left: segment.inRowStart * scale,
                  right: segment.inRowStart * scale + segment.length * scale,
                  top: segment.rowIndex * rowStride + tab[0] * ROW_HEIGHT,
                  bottom: segment.rowIndex * rowStride + (tab[0] + 1) * ROW_HEIGHT,
                };
                return (
                  rect.left < selectionRect.right &&
                  rect.right > selectionRect.left &&
                  rect.top < selectionRect.bottom &&
                  rect.bottom > selectionRect.top
                );
              })
            );
            return hit ? chord.id : null;
          })
          .filter((id): id is number => id !== null);

        setSelectedNoteIds((prev) => {
          if (current.additive) {
            const merged = new Set(prev);
            selectedIds.forEach((id) => merged.add(id));
            return Array.from(merged);
          }
          return selectedIds;
        });

        setSelectedChordIds((prev) => {
          if (current.additive) {
            const merged = new Set(prev);
            selectedChordIds.forEach((id) => merged.add(id));
            return Array.from(merged);
          }
          return selectedChordIds;
        });
        setDraftNote(null);
        setDraftNoteAnchor(null);
      }
      setSelection(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    selection,
    scale,
    totalFrames,
    framesPerMeasure,
    rowFrames,
    rows,
    timelineHeight,
    timelineWidth,
    snapshot.notes,
    snapshot.chords,
    clamp,
  ]);

  useEffect(() => {
    if (segmentDragIndex === null) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const segments = segmentEditsRef.current;
      const left = segments[segmentDragIndex];
      const right = segments[segmentDragIndex + 1];
      if (!left || !right) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const boundaryTime = left.end;
      const rowIndex = rowFrames > 0 ? clamp(Math.floor(boundaryTime / rowFrames), 0, rows - 1) : 0;
      const rowBarCount = getRowBarCount(rowIndex);
      const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
      const rowStart = rowIndex * rowFrames;
      const rowWidth = availableFrames * scale;
      const x = clamp(event.clientX - rect.left, 0, rowWidth);
      const rawTime = rowStart + Math.round(x / scale);
      const minTime = left.start + 1;
      const maxTime = right.end - 1;
      const newTime = clamp(rawTime, minTime, maxTime);

      setSegmentEdits((prev) => {
        const next = [...prev];
        if (!next[segmentDragIndex] || !next[segmentDragIndex + 1]) return prev;
        next[segmentDragIndex] = { ...next[segmentDragIndex], end: newTime };
        next[segmentDragIndex + 1] = { ...next[segmentDragIndex + 1], start: newTime };
        segmentEditsRef.current = next;
        return next;
      });
    };

    const handleUp = () => {
      const segments = segmentEditsRef.current;
      const target = segments[segmentDragIndex];
      if (target) {
        void runMutation(() => gteApi.shiftCutBoundary(editorId, segmentDragIndex, target.end), {
          localApply: (draft) => {
            shiftCutBoundaryInSnapshot(draft, segmentDragIndex, target.end);
          },
        });
      }
      setSegmentDragIndex(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    segmentDragIndex,
    editorId,
    runMutation,
    scale,
    clamp,
    rowFrames,
    rows,
    framesPerMeasure,
    barCount,
  ]);

  useEffect(() => {
    if (!playheadDragging) return;
    const handleMove = (event: globalThis.MouseEvent) => {
      const target = getPointerFrame(event.clientX, event.clientY);
      if (target) {
        setEffectivePlayheadFrame(target.time);
      }
    };
    const handleUp = () => {
      setPlayheadDragging(false);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [playheadDragging, setEffectivePlayheadFrame]);

  const handleTimelineMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setContextMenu(null);
    if (isMobileCanvasMode) {
      setSelectedCutBoundaryIndex(null);
      setSelectedNoteIds([]);
      setSelectedChordIds([]);
      setNoteMenuAnchor(null);
      setNoteMenuNoteId(null);
      setNoteMenuDraft(null);
      setChordMenuAnchor(null);
      setChordMenuChordId(null);
      setChordMenuDraft(null);
      setDraftNote(null);
      setDraftNoteAnchor(null);
      return;
    }
    if (sliceToolActive && !event.shiftKey && selectedNoteIds.length + selectedChordIds.length > 0) {
      multiDragMovedRef.current = true;
      const target = getPointerFrame(event.clientX, event.clientY);
      if (target) {
        handleSliceAtTime(target.time);
      }
      return;
    }
    setSelectedCutBoundaryIndex(null);
    if (mobileViewport && !event.shiftKey && selectedNoteIds.length + selectedChordIds.length > 0) {
      setSelectedNoteIds([]);
      setSelectedChordIds([]);
      setNoteMenuAnchor(null);
      setNoteMenuNoteId(null);
      setNoteMenuDraft(null);
      setChordMenuAnchor(null);
      setChordMenuChordId(null);
      setChordMenuDraft(null);
      setDraftNote(null);
      setDraftNoteAnchor(null);
      return;
    }
    if (!event.shiftKey) {
      setSelectedNoteIds([]);
      setSelectedChordIds([]);
    }
    setDraftNote(null);
    setDraftNoteAnchor(null);
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, timelineWidth);
    const y = clamp(event.clientY - rect.top, 0, timelineHeight);
    const nextSelection = {
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      additive: event.shiftKey,
    };
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
  };

  const handleTimelineContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = getPointerFrame(event.clientX, event.clientY);
    const targetFrame = target ? target.time : clamp(Math.round(playheadFrameRef.current), 0, timelineEnd);
    setContextMenu({ x: event.clientX, y: event.clientY, kind: "timeline", targetFrame });
  };

  const clearTouchHold = useCallback(() => {
    if (touchHoldTimerRef.current !== null) {
      window.clearTimeout(touchHoldTimerRef.current);
      touchHoldTimerRef.current = null;
    }
    touchHoldPointRef.current = null;
  }, []);

  const scheduleTouchHold = useCallback(
    (event: ReactTouchEvent, onHold: (pointer: DragPointerEventLike) => void) => {
      if (!mobileViewport) return;
      const touch = event.touches[0];
      if (!touch) return;
      clearTouchHold();
      touchHoldTriggeredRef.current = false;
      touchHoldPointRef.current = { x: touch.clientX, y: touch.clientY };
      touchHoldTimerRef.current = window.setTimeout(() => {
        touchHoldTimerRef.current = null;
        touchHoldTriggeredRef.current = true;
        onHold({
          clientX: touch.clientX,
          clientY: touch.clientY,
          shiftKey: false,
          preventDefault: () => {},
          stopPropagation: () => {},
        });
      }, TOUCH_DRAG_HOLD_MS);
    },
    [clearTouchHold, mobileViewport]
  );

  const cancelTouchHoldOnMove = useCallback(
    (event: ReactTouchEvent) => {
      const touch = event.touches[0];
      const origin = touchHoldPointRef.current;
      if (!touch || !origin || touchHoldTimerRef.current === null) return;
      if (Math.abs(touch.clientX - origin.x) > 8 || Math.abs(touch.clientY - origin.y) > 8) {
        clearTouchHold();
      }
    },
    [clearTouchHold]
  );

  useEffect(() => {
    return () => {
      clearTouchHold();
    };
  }, [clearTouchHold]);

  const startNoteDrag = (
    noteId: number,
    stringIndex: number,
    fret: number,
    startTime: number,
    length: number,
    event: DragPointerEventLike
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const shiftKey = Boolean(event.shiftKey);
    if (sliceToolActive && !shiftKey && selectedNoteIds.length + selectedChordIds.length > 0) {
      multiDragMovedRef.current = true;
      const target = getPointerFrame(event.clientX, event.clientY);
      if (target) {
        handleSliceAtTime(target.time);
      }
      return;
    }
    if (shiftKey) {
      setSelectedNoteIds((prev) => (prev.includes(noteId) ? prev : [...prev, noteId]));
      setDraftNote(null);
      setDraftNoteAnchor(null);
      return;
    }
    setSelectedCutBoundaryIndex(null);
    if (
      editingChordId === null &&
      selectedNoteIds.length + selectedChordIds.length > 1 &&
      (selectedNoteIds.includes(noteId) || selectedChordIds.length > 0)
    ) {
      const rect = timelineRef.current?.getBoundingClientRect();
      const rowIndex = rect
        ? clamp(Math.floor((event.clientY - rect.top) / rowStride), 0, rows - 1)
        : Math.floor(startTime / rowFrames);
      const rowStart = rowIndex * rowFrames;
      const pointerFrame =
        rect ? Math.round((event.clientX - rect.left) / scale) + rowStart : startTime;
      const grabOffsetFrames = pointerFrame - startTime;
      multiDragMovedRef.current = false;
      multiDragStartXRef.current = event.clientX;
      const notes = snapshot.notes
        .filter((note) => selectedNoteIds.includes(note.id))
        .map((note) => ({ id: note.id, startTime: note.startTime, length: note.length }));
      const chords = snapshot.chords
        .filter((chord) => selectedChordIds.includes(chord.id))
        .map((chord) => ({ id: chord.id, startTime: chord.startTime, length: chord.length }));
      setMultiDrag({
        anchorId: noteId,
        anchorType: "note",
        anchorStart: startTime,
        anchorLength: length,
        anchorGrabOffsetFrames: grabOffsetFrames,
        notes,
        chords,
      });
      setMultiDragDelta(0);
      return;
    }
    const rect = timelineRef.current?.getBoundingClientRect();
    const rowIndex = rect
      ? clamp(Math.floor((event.clientY - rect.top) / rowStride), 0, rows - 1)
      : Math.floor(startTime / rowFrames);
    const rowStart = rowIndex * rowFrames;
    const pointerFrame =
      rect ? Math.round((event.clientX - rect.left) / scale) + rowStart : startTime;
    const grabOffsetFrames = pointerFrame - startTime;
    singleDragMovedRef.current = false;
    dragStartPointerRef.current = { x: event.clientX, y: event.clientY };
    setSelectedNoteIds([noteId]);
    setSelectedChordIds([]);
    setDraftNote(null);
    setDraftNoteAnchor(null);
    setDragging({ type: "note", id: noteId, stringIndex, fret, startTime, length, grabOffsetFrames });
    dragPreviewRef.current = { startTime, stringIndex };
    setDragPreview({ startTime, stringIndex });
  };

  const startChordDrag = (
    chordId: number,
    startTime: number,
    length: number,
    event: DragPointerEventLike
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const shiftKey = Boolean(event.shiftKey);
    if (sliceToolActive && !shiftKey && selectedNoteIds.length + selectedChordIds.length > 0) {
      const target = getPointerFrame(event.clientX, event.clientY);
      if (target) {
        handleSliceAtTime(target.time);
      }
      return;
    }
    if (shiftKey) {
      setSelectedChordIds((prev) => (prev.includes(chordId) ? prev : [...prev, chordId]));
      setDraftNote(null);
      setDraftNoteAnchor(null);
      return;
    }
    setSelectedCutBoundaryIndex(null);
    if (
      editingChordId === null &&
      selectedNoteIds.length + selectedChordIds.length > 1 &&
      (selectedChordIds.includes(chordId) || selectedNoteIds.length > 0)
    ) {
      const rect = timelineRef.current?.getBoundingClientRect();
      const rowIndex = rect
        ? clamp(Math.floor((event.clientY - rect.top) / rowStride), 0, rows - 1)
        : Math.floor(startTime / rowFrames);
      const rowStart = rowIndex * rowFrames;
      const pointerFrame =
        rect ? Math.round((event.clientX - rect.left) / scale) + rowStart : startTime;
      const grabOffsetFrames = pointerFrame - startTime;
      multiDragMovedRef.current = false;
      multiDragStartXRef.current = event.clientX;
      const notes = snapshot.notes
        .filter((note) => selectedNoteIds.includes(note.id))
        .map((note) => ({ id: note.id, startTime: note.startTime, length: note.length }));
      const chords = snapshot.chords
        .filter((chord) => selectedChordIds.includes(chord.id))
        .map((chord) => ({ id: chord.id, startTime: chord.startTime, length: chord.length }));
      setMultiDrag({
        anchorId: chordId,
        anchorType: "chord",
        anchorStart: startTime,
        anchorLength: length,
        anchorGrabOffsetFrames: grabOffsetFrames,
        notes,
        chords,
      });
      setMultiDragDelta(0);
      return;
    }
    const rect = timelineRef.current?.getBoundingClientRect();
    const rowIndex = rect
      ? clamp(Math.floor((event.clientY - rect.top) / rowStride), 0, rows - 1)
      : Math.floor(startTime / rowFrames);
    const rowStart = rowIndex * rowFrames;
    const pointerFrame =
      rect ? Math.round((event.clientX - rect.left) / scale) + rowStart : startTime;
    const grabOffsetFrames = pointerFrame - startTime;
    singleDragMovedRef.current = false;
    dragStartPointerRef.current = { x: event.clientX, y: event.clientY };
    setSelectedChordIds([chordId]);
    setSelectedNoteIds([]);
    setDraftNote(null);
    setDraftNoteAnchor(null);
    setDragging({ type: "chord", id: chordId, startTime, length, grabOffsetFrames });
    dragPreviewRef.current = { startTime };
    setDragPreview({ startTime });
  };

  const handleBarReorderDrop = (targetIndex: number) => {
    if (dragBarIndex === null) return;
    if (dragBarIndex === targetIndex) {
      setDragBarIndex(null);
      return;
    }
    void runMutation(async () => {
      const reordered = await gteApi.reorderBars(editorId, dragBarIndex, targetIndex);
      if (!reordered.snapshot) return reordered;
      const cleanedSnapshot = cloneSnapshot(reordered.snapshot);
      applyBarOperationCleanupInSnapshot(cleanedSnapshot);
      if (cutRegionsEqual(reordered.snapshot.cutPositionsWithCoords, cleanedSnapshot.cutPositionsWithCoords)) {
        return reordered;
      }
      return gteApi.applyManualCuts(editorId, cloneCutRegionsPayload(cleanedSnapshot.cutPositionsWithCoords));
    }, {
      unavailableMessage: "Bar reordering is available after saving this draft to your account.",
    });
    setDragBarIndex(null);
  };

  const jumpToFrame = (frame: number) => {
    if (effectiveIsPlaying) {
      if (onGlobalPlaybackToggle) {
        onGlobalPlaybackToggle();
      } else {
        stopPlayback();
      }
    }
    setEffectivePlayheadFrame(clamp(Math.round(frame), 0, timelineEnd));
  };

  const skipToStart = () => {
    if (onGlobalPlaybackSkipToStart) {
      onGlobalPlaybackSkipToStart();
      return;
    }
    jumpToFrame(0);
  };

  const skipBackwardBar = () => {
    if (onGlobalPlaybackSkipBackwardBar) {
      onGlobalPlaybackSkipBackwardBar();
      return;
    }
    if (framesPerMeasure <= 0) {
      jumpToFrame(0);
      return;
    }
    const current = Math.max(0, Math.floor(playheadFrameRef.current));
    const prevIndex = Math.floor((current - 1) / framesPerMeasure);
    const target = Math.max(0, prevIndex * framesPerMeasure);
    jumpToFrame(target);
  };

  const skipForwardBar = () => {
    if (onGlobalPlaybackSkipForwardBar) {
      onGlobalPlaybackSkipForwardBar();
      return;
    }
    if (framesPerMeasure <= 0) return;
    const current = Math.max(0, Math.floor(playheadFrameRef.current));
    const nextIndex = Math.floor(current / framesPerMeasure) + 1;
    const target = Math.min(timelineEnd, nextIndex * framesPerMeasure);
    jumpToFrame(target);
  };

  const handleExport = async () => {
    if (!allowBackend) {
      setError("Export is available after saving this draft to your account.");
      return;
    }
    setBusy(true);
    setError(null);
    setIoMessage(null);
    try {
      const data = await gteApi.exportTab(editorId);
      setIoPayload(JSON.stringify(data, null, 2));
      setIoMessage("Exported current tab JSON.");
    } catch (err: any) {
      setError(err?.message || "Could not export tab.");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!allowBackend) {
      setError("Import is available after saving this draft to your account.");
      return;
    }
    setBusy(true);
    setError(null);
    setIoMessage(null);
    try {
      const parsed = JSON.parse(ioPayload || "{}");
      if (!parsed?.stamps || !Array.isArray(parsed.stamps)) {
        throw new Error("Missing stamps array in JSON.");
      }
      const payload = {
        stamps: parsed.stamps,
        framesPerMessure: parsed.framesPerMessure,
        fps: parsed.fps,
        totalFrames: parsed.totalFrames,
      };
      const res = await gteApi.importTab(editorId, payload);
      applySnapshot(res.snapshot);
      setIoMessage("Import complete.");
    } catch (err: any) {
      setError(err?.message || "Could not import tab JSON.");
    } finally {
      setBusy(false);
    }
  };

  const appendDraftFretDigit = useCallback((digit: string) => {
    setDraftNote((prev) => {
      if (!prev) return prev;
      const current = prev.fret === null ? "" : String(prev.fret);
      const nextText = `${current}${digit}`.replace(/^0+(?=\d)/, "");
      const nextValue = nextText === "" ? null : Number(nextText);
      if (nextValue === null) {
        return { ...prev, fret: null };
      }
      if (!Number.isInteger(nextValue) || nextValue < 0 || nextValue > maxFret) {
        return prev;
      }
      return { ...prev, fret: nextValue };
    });
  }, [maxFret]);

  const backspaceDraftFretDigit = useCallback(() => {
    setDraftNote((prev) => {
      if (!prev) return prev;
      const current = prev.fret === null ? "" : String(prev.fret);
      const nextText = current.slice(0, -1);
      return {
        ...prev,
        fret: nextText ? Number(nextText) : null,
      };
    });
  }, []);

  const handleAddNote = () => {
    if (!draftNote) return;
    const { fret } = draftNote;
    const rawLength = clampEventLength(draftNote.length ?? lastAddedNoteLengthRef.current);
    if (fret === null) {
      setError("Enter a fret before adding the note.");
      return;
    }
    if (!Number.isInteger(fret) || fret < 0 || fret > maxFret) {
      setError(`Fret must be between 0 and ${maxFret}.`);
      return;
    }
    const snapped = snapNoteToGrid(draftNote.startTime, rawLength);
    const tab: TabCoord = [draftNote.stringIndex, fret];
    const tempId = getTempNoteId();
    playNotePreview(tab);
    enqueueOptimisticMutation({
      label: "add-note",
      createdNotes: [{ tempId, signature: noteSignature(snapped.startTime, snapped.length, tab) }],
      apply: (draft) => {
        draft.notes.push({
          id: tempId,
          startTime: snapped.startTime,
          length: snapped.length,
          midiNum: 0,
          tab: [tab[0], tab[1]],
          optimals: [],
        });
        return draft;
      },
      commit: () =>
        gteApi.addNote(editorId, {
          tab,
          startTime: snapped.startTime,
          length: snapped.length,
          snapToGrid: snapToGridEnabled,
        }),
    });
    lastAddedNoteLengthRef.current = clampEventLength(snapped.length);
    setDraftNote(null);
    setDraftNoteAnchor(null);
  };

  const handleAssignOptimals = () => {
    if (!selectedNoteIds.length) return;
    void runMutation(
      async () => ({}),
      {
        localApply: (draft) => {
          const resolvedIds = selectedNoteIds
            .map((id) => (id < 0 ? noteIdMapRef.current.get(id) ?? id : id))
            .filter((id) => id >= 0);
          if (!resolvedIds.length) return;
          const selectedIdSet = new Set(resolvedIds);
          draft.notes.forEach((note) => {
            if (!selectedIdSet.has(note.id)) return;
            const alternates = computeNoteAlternatesForSnapshot(draft, note);
            const nextTab =
              alternates.possibleTabs[0] || alternates.blockedTabs[0] || ([note.tab[0], note.tab[1]] as TabCoord);
            note.tab = [nextTab[0], nextTab[1]];
            note.midiNum = getTabMidi(draft, note.tab);
            note.optimals = alternates.possibleTabs.map((tab) => [tab[0], tab[1]] as TabCoord);
          });
        },
        serverMode: "local-first",
      }
    );
  };

  const handleJoinSelectedNotes = () => {
    if (!selectedNoteIds.length) return;
    const grouped = new Map<number, typeof snapshot.notes>();
    snapshot.notes.forEach((note) => {
      if (!selectedNoteIds.includes(note.id)) return;
      const existing = grouped.get(note.tab[0]) || [];
      existing.push(note);
      grouped.set(note.tab[0], existing);
    });
    const nextSelected: number[] = [];
    void runMutation(async () => {
      let last: Awaited<ReturnType<typeof gteApi.deleteNote>> | null = null;
      for (const notes of grouped.values()) {
        if (notes.length === 0) continue;
        notes.sort((a, b) => a.startTime - b.startTime);
        const first = notes[0];
        const lastNote = notes[notes.length - 1];
        nextSelected.push(first.id);
        if (notes.length < 2) continue;
        const targetEnd = lastNote.startTime + lastNote.length;
        const nextLength = clampEventLength(targetEnd - first.startTime);
        if (nextLength !== first.length) {
          await gteApi.setNoteLength(editorId, first.id, nextLength, false);
        }
        for (const note of notes.slice(1)) {
          last = await gteApi.deleteNote(editorId, note.id);
        }
      }
      return last ?? {};
    });
    if (nextSelected.length) {
      setSelectedNoteIds(nextSelected);
    }
  };

  const buildClipboardPayload = () => {
    const notes = snapshot.notes.filter((note) => selectedNoteIds.includes(note.id));
    const chords = snapshot.chords.filter((chord) => selectedChordIds.includes(chord.id));
    if (!notes.length && !chords.length) return null;
    const minStart = Math.min(
      ...notes.map((note) => note.startTime),
      ...chords.map((chord) => chord.startTime)
    );
    return {
      anchor: minStart,
      notes: notes.map((note) => ({
        start: note.startTime,
        length: note.length,
        tab: note.tab as TabCoord,
      })),
      chords: chords.map((chord) => ({
        start: chord.startTime,
        length: chord.length,
        tabs: chord.currentTabs.map((tab) => [tab[0], tab[1]] as TabCoord),
      })),
    };
  };

  const writeClipboard = async (payload: {
    anchor: number;
    notes: Array<{ start: number; length: number; tab: TabCoord }>;
    chords: Array<{ start: number; length: number; tabs: TabCoord[] }>;
  }) => {
    clipboardRef.current = payload;
    const text = `GTE_CLIPBOARD_V1:${JSON.stringify(payload)}`;
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // ignore clipboard failures, we still have in-memory copy
    }
  };

  const readClipboard = async () => {
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text.startsWith("GTE_CLIPBOARD_V1:")) {
          const parsed = JSON.parse(text.slice("GTE_CLIPBOARD_V1:".length));
          return parsed as {
            anchor: number;
            notes: Array<{ start: number; length: number; tab: TabCoord }>;
            chords: Array<{ start: number; length: number; tabs: TabCoord[] }>;
          };
        }
      } catch {
        // fall back to in-memory
      }
    }
    return clipboardRef.current;
  };

  const handleCopySelection = async () => {
    const payload = buildClipboardPayload();
    if (!payload) return;
    await writeClipboard(payload);
  };

  const handlePaste = async (targetFrame?: number) => {
    const payload = await readClipboard();
    if (!payload) return;
    const pasteFrame = getPasteTargetFrame(targetFrame);
    const offset = pasteFrame - payload.anchor;
    void runMutation(async () => {
      let currentSnapshot = snapshot;
      let last: EditorSnapshot | null = null;
      const addedNoteIds: number[] = [];
      const addNoteAndCollectId = async (tab: TabCoord, start: number, length: number) => {
        const clampedLength = clampEventLength(length);
        const beforeIds = new Set(currentSnapshot.notes.map((note) => note.id));
        const res = await gteApi.addNote(editorId, {
          tab,
          startTime: start,
          length: clampedLength,
          snapToGrid: false,
        });
        currentSnapshot = res.snapshot;
        last = res.snapshot;
        const newNote = currentSnapshot.notes.find((note) => !beforeIds.has(note.id));
        if (newNote) {
          addedNoteIds.push(newNote.id);
          return newNote.id;
        }
        const fallback = currentSnapshot.notes.find(
          (note) =>
            note.startTime === start &&
            note.length === clampedLength &&
            note.tab[0] === tab[0] &&
            note.tab[1] === tab[1]
        );
        if (fallback) {
          addedNoteIds.push(fallback.id);
          return fallback.id;
        }
        return null;
      };

      for (const note of payload.notes) {
        const start = note.start + offset;
        if (start < 0) continue;
        await addNoteAndCollectId(note.tab, start, note.length);
      }

      for (const chord of payload.chords) {
        const chordStart = chord.start + offset;
        if (chordStart < 0) continue;
        const chordNoteIds: number[] = [];
        for (const tab of chord.tabs) {
          const id = await addNoteAndCollectId(tab, chordStart, chord.length);
          if (id !== null) chordNoteIds.push(id);
        }
        if (chordNoteIds.length > 0) {
          const res = await gteApi.makeChord(editorId, chordNoteIds);
          currentSnapshot = res.snapshot;
          last = res.snapshot;
        }
      }
      return last ? { snapshot: last } : {};
    });
  };

  const collectChordizeNoteIds = (
    currentSnapshot: EditorSnapshot,
    chordRefs: ChordRef[],
    baseNoteIds: number[]
  ) => {
    const ids = new Set<number>();
    const noteIdSet = new Set(currentSnapshot.notes.map((note) => note.id));
    baseNoteIds.forEach((id) => {
      if (noteIdSet.has(id)) ids.add(id);
    });

    if (!chordRefs.length) {
      return Array.from(ids);
    }

    const noteIndex = buildNoteIndex(currentSnapshot);

    chordRefs.forEach((chord) => {
      collectNoteIdsForChordRef(noteIndex, chord).forEach((id) => ids.add(id));
    });

    return Array.from(ids);
  };

  const buildNoteIndex = (currentSnapshot: EditorSnapshot) => {
    const noteIndex = new Map<string, number[]>();
    currentSnapshot.notes.forEach((note) => {
      const key = `${note.startTime}|${note.length}|${note.tab[0]}|${note.tab[1]}`;
      const existing = noteIndex.get(key);
      if (existing) {
        existing.push(note.id);
      } else {
        noteIndex.set(key, [note.id]);
      }
    });
    return noteIndex;
  };

  const collectNoteIdsForChordRef = (noteIndex: Map<string, number[]>, chord: ChordRef) => {
    const ids = new Set<number>();
    chord.tabs.forEach((tab) => {
      const key = `${chord.startTime}|${chord.length}|${tab[0]}|${tab[1]}`;
      const matches = noteIndex.get(key);
      if (matches) {
        matches.forEach((id) => ids.add(id));
      }
    });
    return Array.from(ids);
  };

  const disbandChordIds = async (ids: number[]) => {
    let latestSnapshot: EditorSnapshot | null = null;
    for (const id of ids) {
      const res = await gteApi.disbandChord(editorId, id);
      if (res.snapshot) {
        latestSnapshot = res.snapshot;
      }
    }
    return latestSnapshot;
  };

  const restoreOriginalChords = async (currentSnapshot: EditorSnapshot, chordRefs: ChordRef[]) => {
    let latestSnapshot: EditorSnapshot | null = null;
    let noteIndex = buildNoteIndex(currentSnapshot);
    for (const chord of chordRefs) {
      const noteIds = collectNoteIdsForChordRef(noteIndex, chord);
      if (noteIds.length < 2) continue;
      try {
        const res = await gteApi.makeChord(editorId, noteIds);
        if (res.snapshot) {
          latestSnapshot = res.snapshot;
          noteIndex = buildNoteIndex(res.snapshot);
        }
      } catch {
        // If restoring fails, leave whatever state the backend returned.
      }
    }
    return latestSnapshot;
  };

  const handleMakeChord = () => {
    const chordIds = [...activeChordIds];
    const baseNoteIds = [...selectedNoteIds];
    const chordRefs: ChordRef[] = chordIds
      .map((id) => snapshot.chords.find((chord) => chord.id === id))
      .filter((chord): chord is EditorSnapshot["chords"][number] => Boolean(chord))
      .map((chord) => ({
        startTime: chord.startTime,
        length: chord.length,
        tabs: chord.currentTabs.map((tab) => [tab[0], tab[1]] as TabCoord),
      }));

    if (chordIds.length) {
      void runMutation(async () => {
        const latestSnapshot = await disbandChordIds(chordIds);
        const snapshotAfter = latestSnapshot ?? snapshot;
        const combined = collectChordizeNoteIds(snapshotAfter, chordRefs, baseNoteIds);
        if (combined.length < 2) {
          if (latestSnapshot) {
            const restored = await restoreOriginalChords(snapshotAfter, chordRefs);
            return restored ? { snapshot: restored } : { snapshot: latestSnapshot };
          }
          return {};
        }
        try {
          return await gteApi.makeChord(editorId, combined);
        } catch (err) {
          if (latestSnapshot) {
            const restored = await restoreOriginalChords(snapshotAfter, chordRefs);
            if (restored) {
              return { snapshot: restored };
            }
          }
          throw err;
        }
      });
      setSelectedNoteIds([]);
      setSelectedChordIds([]);
      return;
    }

    if (baseNoteIds.length < 2) return;
    void runMutation(() => gteApi.makeChord(editorId, baseNoteIds), {
      localApply: (draft) => {
        makeChordInSnapshot(draft, baseNoteIds);
      },
    });
    setSelectedNoteIds([]);
  };

  const handleUpdateNote = async () => {
    if (!selectedNote) return;
    const { stringIndex, fret, startTime, length } = noteForm;
    if (stringIndex === null || fret === null || startTime === null || length === null) {
      setError("Fill in all note fields before updating.");
      return;
    }
    const stringValue = stringIndex;
    const fretValue = fret;
    if (
      !Number.isInteger(stringValue) ||
      !Number.isInteger(fretValue) ||
      stringValue < 0 ||
      stringValue > 5 ||
      fretValue < 0 ||
      fretValue > maxFret
    ) {
      setError(`String must be 0-5 and fret must be 0-${maxFret}.`);
      return;
    }
    const lengthValue = allowBackend
      ? clampEventLength(length)
      : snapLengthToGrid(length);
    const maxStart = Math.max(0, totalFrames - lengthValue);
    const startValue = clamp(Math.round(startTime), 0, maxStart);
    const snappedStartValue = clamp(snapStartTimeToGrid(startValue), 0, maxStart);
    const didChangeTab = stringValue !== selectedNote.tab[0] || fretValue !== selectedNote.tab[1];
    const didChangeStart = snappedStartValue !== selectedNote.startTime;
    const didChangeLength = lengthValue !== selectedNote.length;
    if (!didChangeTab && !didChangeStart && !didChangeLength) {
      setError("No changes to save.");
      return;
    }
    const nextTab: TabCoord = [stringValue, fretValue];
    enqueueOptimisticMutation({
      label: "update-note",
      apply: (draft) => {
        const noteId = resolveNoteId(selectedNote.id);
        const note = draft.notes.find((item) => item.id === noteId);
        if (!note) return draft;
        if (didChangeTab) {
          note.tab = [nextTab[0], nextTab[1]];
          note.midiNum = 0;
        }
        if (didChangeStart) {
          note.startTime = snappedStartValue;
        }
        if (didChangeLength) {
          note.length = lengthValue;
        }
        return draft;
      },
      commit: async () => {
        let last: { snapshot?: EditorSnapshot } | null = null;
        const resolvedId = resolveNoteId(selectedNote.id);
        if (didChangeTab) {
          last = await gteApi.assignNoteTab(editorId, resolvedId, nextTab);
          playNotePreview(nextTab);
        }
        if (didChangeStart) {
          last = await gteApi.setNoteStartTime(
            editorId,
            resolvedId,
            snappedStartValue,
            snapToGridEnabled
          );
        }
        if (didChangeLength) {
          last = await gteApi.setNoteLength(editorId, resolvedId, lengthValue, snapToGridEnabled);
        }
        return last ?? {};
      },
    });
  };

  const handleDeleteNote = () => {
    if (!selectedNote) return;
    enqueueOptimisticMutation({
      label: "delete-note",
      apply: (draft) => {
        removeNoteFromSnapshot(draft, selectedNote.id);
        return draft;
      },
      commit: () => gteApi.deleteNote(editorId, selectedNote.id),
    });
    setSelectedNoteIds([]);
  };

  const handleChordUpdate = async () => {
    if (!selectedChord) return;
    const { startTime, length } = chordForm;
    if (startTime === null || length === null) {
      setError("Fill in start time and length before updating the chord.");
      return;
    }
    const lengthValue = allowBackend
      ? clampEventLength(length)
      : snapLengthToGrid(length);
    const maxStart = Math.max(0, totalFrames - lengthValue);
    const startValue = clamp(Math.round(startTime), 0, maxStart);
    const snappedStartValue = clamp(snapStartTimeToGrid(startValue), 0, maxStart);
    if (!allowBackend) {
      void runMutation(
        () => gteApi.setChordStartTime(editorId, selectedChord.id, snappedStartValue, snapToGridEnabled),
        {
          localApply: (draft) => {
            const chord = draft.chords.find((item) => item.id === selectedChord.id);
            if (!chord) return;
            chord.startTime = snappedStartValue;
            chord.length = lengthValue;
          },
        }
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (snappedStartValue !== selectedChord.startTime) {
        const res = await gteApi.setChordStartTime(
          editorId,
          selectedChord.id,
          snappedStartValue,
          snapToGridEnabled
        );
        applySnapshot(res.snapshot);
      }
      if (lengthValue !== selectedChord.length) {
        const res = await gteApi.setChordLength(
          editorId,
          selectedChord.id,
          lengthValue,
          snapToGridEnabled
        );
        applySnapshot(res.snapshot);
      }
    } catch (err: any) {
      setError(err?.message || "Could not update chord.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisbandChord = () => {
    if (!selectedChord) return;
    void runMutation(() => gteApi.disbandChord(editorId, selectedChord.id), {
      localApply: (draft) => {
        disbandChordInSnapshot(draft, selectedChord.id);
      },
    });
    setSelectedChordIds([]);
  };

  const handleMergeCutBoundary = () => {
    if (selectedCutBoundaryIndex === null) return;
    void runMutation(() => gteApi.deleteCutBoundary(editorId, selectedCutBoundaryIndex), {
      localApply: (draft) => {
        deleteCutBoundaryInSnapshot(draft, selectedCutBoundaryIndex);
      },
    });
    setSelectedCutBoundaryIndex(null);
  };

  const handleDeleteChord = () => {
    if (!selectedChord) return;
    enqueueOptimisticMutation({
      label: "delete-chord",
      apply: (draft) => {
        removeChordFromSnapshot(draft, selectedChord.id);
        return draft;
      },
      commit: () => gteApi.deleteChord(editorId, selectedChord.id),
    });
    setSelectedChordIds([]);
  };

  const clampFloatingPanelAnchor = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const padding = 12;
      const maxX = Math.max(padding, window.innerWidth - width - padding);
      const maxY = Math.max(padding, window.innerHeight - height - padding);
      return {
        x: clamp(Math.round(x), padding, maxX),
        y: clamp(Math.round(y), padding, maxY),
      };
    },
    [clamp]
  );

  const getSideMenuAnchor = (event: ReactMouseEvent, menuWidth: number, menuHeight: number) => {
    const padding = 16;
    const openOnRight = event.clientX < window.innerWidth / 2;
    const targetX = openOnRight ? window.innerWidth - menuWidth - padding : padding;
    const targetY = event.clientY - menuHeight / 2;
    return clampFloatingPanelAnchor(targetX, targetY, menuWidth, menuHeight);
  };

  const startFloatingPanelDrag = useCallback(
    (panel: "note" | "chord", event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const element = panel === "note" ? noteMenuRef.current : chordMenuRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setFloatingPanelDrag({
        panel,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      });
    },
    []
  );

  const openNoteMenu = (noteId: number, fret: number, length: number, event: ReactMouseEvent) => {
    if (event.shiftKey || editingChordId !== null) return;
    if (isMobileEditMode) {
      setNoteMenuAnchor(null);
    } else {
      const { x, y } = getSideMenuAnchor(event, 224, 220);
      setNoteMenuAnchor({ x, y });
    }
    setNoteMenuNoteId(noteId);
    setNoteMenuDraft({ fret: String(fret), length: String(length) });
  };

  const openChordMenu = (chordId: number, length: number, event: ReactMouseEvent) => {
    if (event.shiftKey || editingChordId !== null) return;
    const { x, y } = getSideMenuAnchor(event, 240, 230);
    setChordMenuAnchor({ x, y });
    setChordMenuChordId(chordId);
    setChordMenuDraft({ length: String(length) });
  };

  const openChordEdit = (chordId: number, event: ReactMouseEvent) => {
    const { x, y } = getSideMenuAnchor(event, 200, 80);
    setEditingChordId(chordId);
    setEditingChordAnchor({ x, y });
    setChordMenuAnchor(null);
    setChordMenuChordId(null);
    setChordMenuDraft(null);
    setChordNoteMenuAnchor(null);
    setChordNoteMenuIndex(null);
    setChordNoteMenuDraft(null);
    setSelectedChordIds([chordId]);
    setSelectedNoteIds([]);
  };

  const exitChordEdit = () => {
    setEditingChordId(null);
    setEditingChordAnchor(null);
    setChordNoteMenuAnchor(null);
    setChordNoteMenuIndex(null);
    setChordNoteMenuDraft(null);
  };

  const openChordNoteMenu = (
    chordId: number,
    tabIndex: number,
    fret: number,
    length: number,
    event: ReactMouseEvent
  ) => {
    if (editingChordId !== chordId) return;
    const { x, y } = getSideMenuAnchor(event, 224, 210);
    setChordNoteMenuAnchor({ x, y });
    setChordNoteMenuIndex(tabIndex);
    setChordNoteMenuDraft({ fret: String(fret), length: String(length) });
  };

  const commitNoteMenuFretValue = useCallback(
    (fretValue: number) => {
      if (!selectedNote) return;
      if (!Number.isInteger(fretValue) || fretValue < 0 || fretValue > maxFret) {
        setError("Invalid fret.");
        return;
      }
      if (selectedNote.tab[1] === fretValue) return;
      const nextTab: TabCoord = [selectedNote.tab[0], fretValue];
      playNotePreview(nextTab);
      enqueueOptimisticMutation({
        label: "note-menu-fret",
        apply: (draft) => {
          const noteId = resolveNoteId(selectedNote.id);
          const note = draft.notes.find((item) => item.id === noteId);
          if (!note) return draft;
          note.tab = [nextTab[0], nextTab[1]];
          note.midiNum = 0;
          return draft;
        },
        commit: () => gteApi.assignNoteTab(editorId, resolveNoteId(selectedNote.id), nextTab),
      });
    },
    [editorId, enqueueOptimisticMutation, maxFret, selectedNote]
  );

  const clearPendingNoteFretArrowCommit = useCallback(() => {
    if (noteFretArrowCommitTimerRef.current !== null) {
      window.clearTimeout(noteFretArrowCommitTimerRef.current);
      noteFretArrowCommitTimerRef.current = null;
    }
    pendingNoteFretArrowCommitRef.current = null;
  }, []);

  const flushPendingNoteFretArrowCommit = useCallback(() => {
    const pending = pendingNoteFretArrowCommitRef.current;
    if (!pending) return;
    clearPendingNoteFretArrowCommit();
    const latestSelectedId = selectedNoteIdsRef.current[0];
    if (!Number.isInteger(latestSelectedId)) return;
    if (resolveNoteId(latestSelectedId) !== resolveNoteId(pending.noteId)) return;
    commitNoteMenuFretValue(pending.fret);
  }, [clearPendingNoteFretArrowCommit, commitNoteMenuFretValue, resolveNoteId]);

  const scheduleNoteFretArrowCommit = useCallback(
    (noteId: number, fretValue: number) => {
      pendingNoteFretArrowCommitRef.current = {
        noteId,
        fret: fretValue,
      };
      if (noteFretArrowCommitTimerRef.current !== null) {
        window.clearTimeout(noteFretArrowCommitTimerRef.current);
      }
      noteFretArrowCommitTimerRef.current = window.setTimeout(() => {
        flushPendingNoteFretArrowCommit();
      }, NOTE_FRET_ARROW_COMMIT_DEBOUNCE_MS);
    },
    [flushPendingNoteFretArrowCommit]
  );

  const commitNoteMenuFret = () => {
    if (!noteMenuDraft) return;
    clearPendingNoteFretArrowCommit();
    const fretValue = Number(noteMenuDraft.fret);
    if (!Number.isInteger(fretValue) || fretValue < 0 || fretValue > maxFret) {
      setError("Invalid fret.");
      return;
    }
    commitNoteMenuFretValue(fretValue);
  };

  useEffect(() => {
    return () => {
      clearPendingNoteFretArrowCommit();
    };
  }, [clearPendingNoteFretArrowCommit]);

  const commitNoteMenuLengthValue = useCallback(
    (rawLength: number) => {
      if (!selectedNote) return;
      if (!Number.isInteger(rawLength) || rawLength < 1) {
        setError(`Invalid length. Use 1-${MAX_EVENT_LENGTH_FRAMES}.`);
        return;
      }
      const lengthValue = allowBackend ? clampEventLength(rawLength) : snapLengthToGrid(rawLength);
      if (selectedNote.length === lengthValue) return;
      enqueueOptimisticMutation({
        label: "note-menu-length",
        apply: (draft) => {
          const noteId = resolveNoteId(selectedNote.id);
          const note = draft.notes.find((item) => item.id === noteId);
          if (!note) return draft;
          note.length = lengthValue;
          return draft;
        },
        commit: () =>
          gteApi.setNoteLength(editorId, resolveNoteId(selectedNote.id), lengthValue, snapToGridEnabled),
      });
    },
    [allowBackend, editorId, enqueueOptimisticMutation, selectedNote, snapLengthToGrid, snapToGridEnabled]
  );

  const commitNoteMenuLength = () => {
    if (!noteMenuDraft) return;
    const rawLength = Number(noteMenuDraft.length);
    if (!Number.isInteger(rawLength) || rawLength < 1) {
      setError(`Invalid length. Use 1-${MAX_EVENT_LENGTH_FRAMES}.`);
      return;
    }
    commitNoteMenuLengthValue(rawLength);
  };

  const setMobileNoteFieldValue = useCallback(
    (field: "fret" | "length", value: number) => {
      setNoteMenuDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [field]: String(value),
        };
      });
    },
    []
  );

  const adjustMobileNoteField = useCallback(
    (field: "fret" | "length", delta: number) => {
      const fallbackValue =
        field === "fret" ? selectedNote?.tab[1] ?? 0 : selectedNote?.length ?? lastAddedNoteLengthRef.current;
      const currentValue = Number(noteMenuDraft?.[field] ?? fallbackValue);
      const min = field === "fret" ? 0 : 1;
      const max = field === "fret" ? maxFret : MAX_EVENT_LENGTH_FRAMES;
      const nextValue = Math.max(min, Math.min(max, (Number.isFinite(currentValue) ? currentValue : fallbackValue) + delta));
      setMobileNoteFieldValue(field, nextValue);
      if (field === "fret") {
        if (!selectedNote) return;
        scheduleNoteFretArrowCommit(selectedNote.id, nextValue);
      } else {
        commitNoteMenuLengthValue(nextValue);
      }
    },
    [
      commitNoteMenuLengthValue,
      maxFret,
      noteMenuDraft,
      scheduleNoteFretArrowCommit,
      selectedNote,
      setMobileNoteFieldValue,
    ]
  );

  const adjustDesktopNoteMenuFret = useCallback(
    (delta: number) => {
      if (!selectedNote) return;
      const fallbackValue = selectedNote?.tab[1] ?? 0;
      const currentValue = Number(noteMenuDraft?.fret ?? fallbackValue);
      const baseValue = Number.isFinite(currentValue) ? currentValue : fallbackValue;
      const nextValue = Math.max(0, Math.min(maxFret, baseValue + delta));
      setNoteMenuDraft((prev) => (prev ? { ...prev, fret: String(nextValue) } : prev));
      scheduleNoteFretArrowCommit(selectedNote.id, nextValue);
    },
    [maxFret, noteMenuDraft, scheduleNoteFretArrowCommit, selectedNote]
  );

  const commitChordMenuLength = () => {
    if (!selectedChord || !chordMenuDraft) return;
    const rawLength = Number(chordMenuDraft.length);
    if (!Number.isInteger(rawLength) || rawLength < 1) {
      setError(`Invalid length. Use 1-${MAX_EVENT_LENGTH_FRAMES}.`);
      return;
    }
    const lengthValue = allowBackend ? clampEventLength(rawLength) : snapLengthToGrid(rawLength);
    if (selectedChord.length === lengthValue) return;
    enqueueOptimisticMutation({
      label: "chord-menu-length",
      apply: (draft) => {
        const chordId = resolveChordId(selectedChord.id);
        const chord = draft.chords.find((item) => item.id === chordId);
        if (!chord) return draft;
        chord.length = lengthValue;
        return draft;
      },
      commit: () =>
        gteApi.setChordLength(editorId, resolveChordId(selectedChord.id), lengthValue, snapToGridEnabled),
    });
  };

  const handleChordOctaveShift = (direction: number) => {
    if (!selectedChord) return;
    void runMutation(() => gteApi.shiftChordOctave(editorId, selectedChord.id, direction), {
      localApply: (draft) => {
        shiftChordOctaveInSnapshot(draft, selectedChord.id, direction);
      },
    });
  };

  const commitChordNoteFret = () => {
    if (!selectedChord || chordNoteMenuIndex === null || !chordNoteMenuDraft) return;
    const fretValue = Number(chordNoteMenuDraft.fret);
    if (!Number.isInteger(fretValue) || fretValue < 0 || fretValue > maxFret) {
      setError("Invalid fret.");
      return;
    }
    const nextTabs = selectedChord.currentTabs.map((tab, idx) =>
      idx === chordNoteMenuIndex ? ([tab[0], fretValue] as TabCoord) : tab
    );
    void runMutation(() => gteApi.setChordTabs(editorId, selectedChord.id, nextTabs), {
      localApply: (draft) => {
        setChordTabsInSnapshot(draft, selectedChord.id, nextTabs);
      },
    });
  };

  const commitChordNoteLength = () => {
    if (!selectedChord || !chordNoteMenuDraft) return;
    const rawLength = Number(chordNoteMenuDraft.length);
    if (!Number.isInteger(rawLength) || rawLength < 1) {
      setError(`Invalid length. Use 1-${MAX_EVENT_LENGTH_FRAMES}.`);
      return;
    }
    const lengthValue = allowBackend ? clampEventLength(rawLength) : snapLengthToGrid(rawLength);
    if (selectedChord.length === lengthValue) return;
    enqueueOptimisticMutation({
      label: "chord-note-length",
      apply: (draft) => {
        const chordId = resolveChordId(selectedChord.id);
        const chord = draft.chords.find((item) => item.id === chordId);
        if (!chord) return draft;
        chord.length = lengthValue;
        return draft;
      },
      commit: () =>
        gteApi.setChordLength(editorId, resolveChordId(selectedChord.id), lengthValue, snapToGridEnabled),
    });
  };

  const deleteChordNote = () => {
    if (!selectedChord || chordNoteMenuIndex === null) return;
    const nextTabs = selectedChord.currentTabs.filter((_, idx) => idx !== chordNoteMenuIndex);
    if (nextTabs.length === 0) {
      enqueueOptimisticMutation({
        label: "delete-chord",
        apply: (draft) => {
          removeChordFromSnapshot(draft, selectedChord.id);
          return draft;
        },
        commit: () => gteApi.deleteChord(editorId, selectedChord.id),
      });
      setSelectedChordIds([]);
      exitChordEdit();
      return;
    }
    void runMutation(() => gteApi.setChordTabs(editorId, selectedChord.id, nextTabs), {
      localApply: (draft) => {
        setChordTabsInSnapshot(draft, selectedChord.id, nextTabs);
      },
    });
    setChordNoteMenuIndex(null);
    setChordNoteMenuAnchor(null);
    setChordNoteMenuDraft(null);
  };

  const startSegmentEdit = (index: number, segment: SegmentEdit) => {
    setEditingSegmentIndex(index);
    setSegmentCoordDraft({
      stringIndex: segment.stringIndex !== null ? String(segment.stringIndex) : "",
      fret: segment.fret !== null ? String(segment.fret) : "",
    });
    setSelectedCutBoundaryIndex(null);
  };

  const cancelSegmentEdit = () => {
    setEditingSegmentIndex(null);
    setSegmentCoordDraft(null);
  };

  const commitSegmentEdit = () => {
    if (editingSegmentIndex === null || !segmentCoordDraft) return;
    const segment = segmentEdits[editingSegmentIndex];
    if (!segment) {
      cancelSegmentEdit();
      return;
    }
    const stringValue = Number(segmentCoordDraft.stringIndex);
    const fretValue = Number(segmentCoordDraft.fret);
    const valid =
      Number.isInteger(stringValue) &&
      Number.isInteger(fretValue) &&
      stringValue >= 0 &&
      stringValue <= 5 &&
      fretValue >= 0 &&
      fretValue <= maxFret;
    if (!valid) {
      setError("Invalid coordinate. String must be 0-5 and fret within range.");
      cancelSegmentEdit();
      return;
    }
    if (segment.stringIndex === stringValue && segment.fret === fretValue) {
      cancelSegmentEdit();
      return;
    }
    const payload: CutWithCoord[] = snapshot.cutPositionsWithCoords.map((region, idx) => [
      [region[0][0], region[0][1]],
      idx === editingSegmentIndex
        ? [stringValue, fretValue]
        : [region[1][0], region[1][1]],
    ]);
    void runMutation(() => gteApi.applyManualCuts(editorId, payload), {
      localApply: (draft) => {
        applyManualCutsInSnapshot(draft, payload);
      },
    });
    cancelSegmentEdit();
  };

  const adjustSegmentCoordinateDraft = useCallback(
    (field: "stringIndex" | "fret", delta: number) => {
      setSegmentCoordDraft((prev) => {
        if (!prev) return prev;
        const min = 0;
        const max = field === "stringIndex" ? 5 : maxFret;
        const fallback = field === "stringIndex" ? 0 : 0;
        const currentValue = Number(prev[field]);
        const baseValue = Number.isFinite(currentValue) ? currentValue : fallback;
        return {
          ...prev,
          [field]: String(Math.max(min, Math.min(max, Math.round(baseValue + delta)))),
        };
      });
    },
    [maxFret]
  );

  const cancelSegmentEditIfActive = useCallback(() => {
    if (editingSegmentIndex !== null) {
      cancelSegmentEdit();
    }
  }, [editingSegmentIndex, cancelSegmentEdit]);

  const commitSegmentEditIfActive = useCallback(() => {
    if (editingSegmentIndex !== null) {
      commitSegmentEdit();
    }
  }, [editingSegmentIndex, commitSegmentEdit]);

  const handleApplySegments = () => {
    if (segmentEdits.some((seg) => seg.stringIndex === null || seg.fret === null)) {
      setError("Fill in string and fret for all segments before saving.");
      return;
    }
    const payload: CutWithCoord[] = segmentEdits.map((seg) => [
      [seg.start, seg.end],
      [seg.stringIndex as number, seg.fret as number],
    ]);
    void runMutation(() => gteApi.applyManualCuts(editorId, payload), {
      localApply: (draft) => {
        applyManualCutsInSnapshot(draft, payload);
      },
    });
  };

  const handleInsertBoundary = () => {
    if (insertTime === null || insertString === null || insertFret === null) {
      setError("Enter time, string, and fret before inserting.");
      return;
    }
    if (
      !Number.isInteger(insertString) ||
      !Number.isInteger(insertFret) ||
      insertString < 0 ||
      insertString > 5 ||
      insertFret < 0 ||
      insertFret > maxFret
    ) {
      setError(`String must be 0-5 and fret must be 0-${maxFret}.`);
      return;
    }
    void runMutation(() => gteApi.insertCutAt(editorId, insertTime, [insertString, insertFret]), {
      localApply: (draft) => {
        insertCutAtInSnapshot(draft, insertTime, [insertString, insertFret]);
      },
    });
  };

  const handleShiftBoundary = () => {
    if (shiftBoundaryIndex === null || shiftBoundaryTime === null) {
      setError("Enter an index and time before shifting.");
      return;
    }
    void runMutation(() => gteApi.shiftCutBoundary(editorId, shiftBoundaryIndex, shiftBoundaryTime), {
      localApply: (draft) => {
        shiftCutBoundaryInSnapshot(draft, shiftBoundaryIndex, shiftBoundaryTime);
      },
    });
  };

  const handleDeleteBoundary = () => {
    if (deleteBoundaryIndex === null) {
      setError("Enter a boundary index to delete.");
      return;
    }
    void runMutation(() => gteApi.deleteCutBoundary(editorId, deleteBoundaryIndex), {
      localApply: (draft) => {
        deleteCutBoundaryInSnapshot(draft, deleteBoundaryIndex);
      },
    });
  };

  const handleGenerateCuts = () => {
    void runMutation(() => gteApi.generateCuts(editorId, {
      tuning: snapshot.tuning,
      tabRef: snapshot.tabRef,
    }), {
      serverMode: "immediate",
      unavailableMessage: "Generated cuts are available after saving this draft to an account.",
    });
  };

  const handleMergeRedundantCutRegions = () => {
    if (!hasRedundantCutRegions) return;
    const payload: CutWithCoord[] = mergedCutRegionsPayload.map((region) => [
      [region[0][0], region[0][1]],
      [region[1][0], region[1][1]],
    ]);
    void runMutation(() => gteApi.applyManualCuts(editorId, payload), {
      localApply: (draft) => {
        mergeRedundantCutRegionsInSnapshot(draft);
      },
    });
    setSelectedCutBoundaryIndex(null);
  };

  const handleAddBar = () => {
    void runMutation(async () => {
      const added = await gteApi.addBars(editorId, 1);
      if (!added.snapshot) return added;
      const cleanedSnapshot = cloneSnapshot(added.snapshot);
      applyBarOperationCleanupInSnapshot(cleanedSnapshot);
      if (cutRegionsEqual(added.snapshot.cutPositionsWithCoords, cleanedSnapshot.cutPositionsWithCoords)) {
        return added;
      }
      return gteApi.applyManualCuts(editorId, cloneCutRegionsPayload(cleanedSnapshot.cutPositionsWithCoords));
    }, {
      localApply: (draft) => {
        addBarsInSnapshot(draft, 1);
        applyBarOperationCleanupInSnapshot(draft);
      },
    });
  };

  const handleRemoveBar = (index: number) => {
    if (barCount <= 1) return;
    void runMutation(async () => {
      const removed = await gteApi.removeBar(editorId, index);
      if (!removed.snapshot) return removed;
      const cleanedSnapshot = cloneSnapshot(removed.snapshot);
      applyBarOperationCleanupInSnapshot(cleanedSnapshot);
      if (cutRegionsEqual(removed.snapshot.cutPositionsWithCoords, cleanedSnapshot.cutPositionsWithCoords)) {
        return removed;
      }
      return gteApi.applyManualCuts(editorId, cloneCutRegionsPayload(cleanedSnapshot.cutPositionsWithCoords));
    }, {
      localApply: (draft) => {
        removeBarInSnapshot(draft, index);
        applyBarOperationCleanupInSnapshot(draft);
      },
    });
  };

  const commitTimeSignatureValue = useCallback(
    (rawValue: number | string) => {
      const next = Number(rawValue);
      if (!Number.isFinite(next) || next < 1 || next > 64) {
        setTimeSignatureInput(String(timeSignature));
        return false;
      }
      const normalized = Math.max(1, Math.min(64, Math.round(next)));
      setTimeSignature(normalized);
      setTimeSignatureInput(String(normalized));
      if (normalized === timeSignature) {
        return true;
      }
      void runMutation(() => gteApi.setTimeSignature(editorId, normalized), {
        localApply: (draft) => {
          setTimeSignatureInSnapshot(draft, normalized);
        },
      });
      return true;
    },
    [editorId, runMutation, timeSignature]
  );

  const handleBarSelection = useCallback(
    (index: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = Number.isFinite(event.clientX) ? event.clientX - rect.left : rect.width;
      const insertIndex = pointerX < rect.width / 2 ? index : index + 1;
      setLastBarInsertIndex(insertIndex);
      setSelectedNoteIds([]);
      setSelectedChordIds([]);
      setNoteMenuAnchor(null);
      setNoteMenuNoteId(null);
      setNoteMenuDraft(null);
      setChordMenuAnchor(null);
      setChordMenuChordId(null);
      setChordMenuDraft(null);
      setContextMenu(null);

      if (mobileViewport) {
        const nextSelection = selectedBarIndexSet.has(index)
          ? selectedBarIndices.filter((value) => value !== index)
          : [...selectedBarIndices, index].sort((left, right) => left - right);
        setSelectedBarIndices(nextSelection);
        setBarSelectionAnchor(nextSelection.length ? index : null);
        return;
      }

      const additive = (event.ctrlKey || event.metaKey) && isActive;
      const rangeSelect = event.shiftKey && isActive;
      if (rangeSelect && barSelectionAnchor !== null) {
        const start = Math.min(barSelectionAnchor, index);
        const end = Math.max(barSelectionAnchor, index);
        const nextRange = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
        setSelectedBarIndices(nextRange);
        return;
      }
      if (additive) {
        setSelectedBarIndices((prev) => {
          if (prev.includes(index)) return prev;
          return [...prev, index].sort((left, right) => left - right);
        });
        setBarSelectionAnchor(index);
        return;
      }
      setSelectedBarIndices([index]);
      setBarSelectionAnchor(index);
    },
    [barSelectionAnchor, isActive, mobileViewport, selectedBarIndexSet, selectedBarIndices]
  );

  const handleBarContextMenu = useCallback(
    (index: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = Number.isFinite(event.clientX) ? event.clientX - rect.left : rect.width;
      const insertIndex = pointerX < rect.width / 2 ? index : index + 1;
      setLastBarInsertIndex(insertIndex);
      setSelectedNoteIds([]);
      setSelectedChordIds([]);
      setNoteMenuAnchor(null);
      setNoteMenuNoteId(null);
      setNoteMenuDraft(null);
      setChordMenuAnchor(null);
      setChordMenuChordId(null);
      setChordMenuDraft(null);
      if (!selectedBarIndexSet.has(index)) {
        setSelectedBarIndices([index]);
        setBarSelectionAnchor(index);
      }
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        kind: "bar",
        insertIndex,
      });
    },
    [selectedBarIndexSet]
  );

  const handleCopySelectedBars = useCallback(() => {
    if (!selectedBarIndices.length) return;
    void onRequestSelectedBarsCopy?.([...selectedBarIndices]);
  }, [onRequestSelectedBarsCopy, selectedBarIndices]);

  const handlePasteSelectedBars = useCallback(
    (insertIndex?: number) => {
      if (!onRequestSelectedBarsPaste || !barClipboardAvailable) return;
      const targetInsertIndex =
        insertIndex ?? lastBarInsertIndex ?? (barCount > 0 ? Math.min(barCount, selectedBarIndices[0] ?? 0) : 0);
      void onRequestSelectedBarsPaste(targetInsertIndex);
    },
    [
      barClipboardAvailable,
      barCount,
      lastBarInsertIndex,
      onRequestSelectedBarsPaste,
      selectedBarIndices,
    ]
  );

  const handleDeleteSelectedBars = useCallback(() => {
    if (!selectedBarIndices.length) return;
    void onRequestSelectedBarsDelete?.([...selectedBarIndices]);
  }, [onRequestSelectedBarsDelete, selectedBarIndices]);

  const handleSelectedBarDragStart = useCallback(
    (index: number, event: ReactDragEvent<HTMLButtonElement>) => {
      if (!selectedBarIndexSet.has(index) || !selectedBarIndices.length) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "application/x-gte-bars",
        JSON.stringify({ editorId, barIndices: selectedBarIndices })
      );

      const dragGhost = document.createElement("div");
      dragGhost.textContent = `Bars ${selectedBarIndices.length}`;
      dragGhost.style.position = "fixed";
      dragGhost.style.top = "-9999px";
      dragGhost.style.left = "-9999px";
      dragGhost.style.padding = "6px 10px";
      dragGhost.style.borderRadius = "999px";
      dragGhost.style.border = "1px solid rgba(148, 163, 184, 0.9)";
      dragGhost.style.background = "rgba(255,255,255,0.96)";
      dragGhost.style.color = "#334155";
      dragGhost.style.fontSize = "11px";
      dragGhost.style.fontWeight = "600";
      dragGhost.style.boxShadow = "0 6px 18px rgba(15,23,42,0.16)";
      document.body.appendChild(dragGhost);
      event.dataTransfer.setDragImage(dragGhost, dragGhost.offsetWidth / 2, dragGhost.offsetHeight / 2);
      window.setTimeout(() => {
        dragGhost.remove();
      }, 0);

      onBarDragStart?.([...selectedBarIndices]);
    },
    [editorId, onBarDragStart, selectedBarIndexSet, selectedBarIndices]
  );

  const handleSelectedBarDragEnd = useCallback(() => {
    setBarDropIndex(null);
    onBarDragEnd?.();
  }, [onBarDragEnd]);

  const handleBarDropTargetDragOver = useCallback(
    (insertIndex: number, event: ReactDragEvent<HTMLButtonElement>) => {
      if (!activeBarDrag || !onRequestBarDrop) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setBarDropIndex(insertIndex);
    },
    [activeBarDrag, onRequestBarDrop]
  );

  const handleBarDropTargetDrop = useCallback(
    (insertIndex: number, event: ReactDragEvent<HTMLButtonElement>) => {
      if (!activeBarDrag || !onRequestBarDrop) return;
      event.preventDefault();
      event.stopPropagation();
      setBarDropIndex(null);
      void onRequestBarDrop(insertIndex);
    },
    [activeBarDrag, onRequestBarDrop]
  );

  const handleAssignAlt = (tab: TabCoord) => {
    if (!selectedNote) return;
    if (!isTabCoordValidForSnapshot(snapshot, tab)) {
      setError(`Tab must stay within strings 0-5 and frets 0-${maxFret}.`);
      return;
    }
    playNotePreview(tab);
    enqueueOptimisticMutation({
      label: "assign-alt",
      apply: (draft) => {
        const noteId = resolveNoteId(selectedNote.id);
        const note = draft.notes.find((item) => item.id === noteId);
        if (!note) return draft;
        note.tab = [tab[0], tab[1]];
        note.midiNum = 0;
        return draft;
      },
      commit: () => gteApi.assignNoteTab(editorId, resolveNoteId(selectedNote.id), tab),
    });
  };

  const handleApplyChordTabs = (tabs: OptionalTabCoord[]) => {
    if (!selectedChord) return;
    if (tabs.some((tab) => tab[0] === null || tab[1] === null)) {
      setError("Fill in all chord tabs before applying.");
      return;
    }
    const normalized = tabs.map((tab) => [tab[0] as number, tab[1] as number]) as TabCoord[];
    if (normalized.some((tab) => !isTabCoordValidForSnapshot(snapshot, tab))) {
      setError(`Chord tabs must stay within strings 0-5 and frets 0-${maxFret}.`);
      return;
    }
    void runMutation(() => gteApi.setChordTabs(editorId, selectedChord.id, normalized), {
      localApply: (draft) => {
        setChordTabsInSnapshot(draft, selectedChord.id, normalized);
      },
    });
  };

  const handleShiftChordOctave = (direction: number) => {
    if (!selectedChord) return;
    void runMutation(() => gteApi.shiftChordOctave(editorId, selectedChord.id, direction), {
      localApply: (draft) => {
        shiftChordOctaveInSnapshot(draft, selectedChord.id, direction);
      },
    });
  };

  function getMidiFromTab(tab: TabCoord, fallback?: number) {
    const value = snapshot.tabRef?.[tab[0]]?.[tab[1]];
    if (value !== undefined && value !== null) return Number(value);
    if (fallback !== undefined && fallback !== null) return Number(fallback);
    const openStrings = getOpenStringMidiFromSnapshot(snapshot);
    const base = openStrings[tab[0]];
    if (base !== undefined && Number.isFinite(tab[1]) && tab[1] >= 0) {
      return base + tab[1];
    }
    return 0;
  }

  function ensurePreviewAudio() {
    let ctx = previewAudioRef.current;
    let master = previewGainRef.current;
    if (!ctx || ctx.state === "closed" || !master) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = effectivePlaybackVolume;
      master.connect(ctx.destination);
      previewAudioRef.current = ctx;
      previewGainRef.current = master;
    }
    return { ctx, master };
  }

  async function playNotePreview(tab: TabCoord, midiOverride?: number) {
    if (effectivePlaybackVolume <= 0) return;
    const midi = getMidiFromTab(tab, midiOverride);
    if (!Number.isFinite(midi) || midi <= 0) return;

    const instrument = await prepareTrackInstrument(snapshot.instrumentId);
    const { ctx, master } = ensurePreviewAudio();
    void ctx.resume();

    schedulePreparedTrackNote({
      ctx,
      destination: master,
      instrument,
      midi,
      gain: 0.6,
      startTime: ctx.currentTime + 0.005,
      duration: 0.16,
    });
  }

  const stopAudio = () => {
    if (audioRef.current) {
      void audioRef.current.close();
      audioRef.current = null;
    }
    masterGainRef.current = null;
  };

  const scheduleMetronomeClick = (
    ctx: AudioContext,
    destination: AudioNode,
    startTime: number,
    accent: boolean
  ) => {
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
  };

  const schedulePlayback = async (startFrame: number, speedOverride?: number) => {
    const runPlaybackSpeed = normalizePlaybackSpeed(speedOverride ?? effectivePlaybackSpeed);
    const playbackStartFrame =
      effectivePracticeLoopEnabled && effectivePracticeLoopRange
        ? effectivePracticeLoopRange.startFrame
        : startFrame;
    const playbackEndFrame =
      effectivePracticeLoopEnabled && effectivePracticeLoopRange
        ? effectivePracticeLoopRange.endFrame
        : timelineEnd;
    let endFrame = Math.max(playbackStartFrame, playbackEndFrame);
    const events: Array<{
      start: number;
      duration: number;
      midi: number;
      gain: number;
      stringIndex?: number;
    }> = [];

    const pushEvent = (
      startTime: number,
      length: number,
      midi: number,
      gain: number,
      stringIndex?: number
    ) => {
      const eventStart = Math.round(startTime);
      const eventEnd = Math.round(startTime + length);
      if (eventEnd <= playbackStartFrame || eventStart >= playbackEndFrame) return;
      const trimmedStart = Math.max(eventStart, playbackStartFrame);
      const trimmedEnd = Math.min(eventEnd, playbackEndFrame);
      const durationFrames = trimmedEnd - trimmedStart;
      if (durationFrames <= 0) return;
      endFrame = Math.max(endFrame, trimmedEnd);
      events.push({
        start: frameDeltaToSeconds(trimmedStart - playbackStartFrame, playbackFps, runPlaybackSpeed),
        duration: frameDeltaToSeconds(durationFrames, playbackFps, runPlaybackSpeed),
        midi,
        gain,
        stringIndex,
      });
    };

    snapshot.notes.forEach((note) => {
      const key = `note-${note.id}`;
      const gain = conflictInfo.conflictKeys.has(key) ? 0.25 : 0.55;
      const midi = Number.isFinite(note.midiNum) && note.midiNum > 0 ? note.midiNum : getMidiFromTab(note.tab);
      pushEvent(note.startTime, note.length, midi, gain, note.tab[0]);
    });
    snapshot.chords.forEach((chord) => {
      chord.currentTabs.forEach((tab, idx) => {
        const key = `chord-${chord.id}-${idx}`;
        const gain = conflictInfo.conflictKeys.has(key) ? 0.25 : 0.5;
        const midi = getMidiFromTab(tab, chord.originalMidi[idx]);
        pushEvent(chord.startTime, chord.length, midi, gain, tab[0]);
      });
    });

    const instrument = await prepareTrackInstrument(snapshot.instrumentId);
    const ctx = new AudioContext();
    void ctx.resume();
    const latencySec =
      (Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0) +
      (Number.isFinite((ctx as AudioContext).outputLatency)
        ? (ctx as AudioContext).outputLatency
        : 0);
    const base = ctx.currentTime + latencySec;

    const master = ctx.createGain();
    master.gain.value = effectivePlaybackVolume;
    master.connect(ctx.destination);
    masterGainRef.current = master;
    const countInSec = effectiveCountInEnabled
      ? frameDeltaToSeconds(framesPerMeasure, playbackFps, runPlaybackSpeed)
      : 0;
    const playBase = base + countInSec;

    if (effectiveMetronomeEnabled || effectiveCountInEnabled) {
      buildMetronomeClicks({
        startFrame: playbackStartFrame,
        endFrame,
        framesPerBar: framesPerMeasure,
        beatsPerBar: timeSignature,
        fps: playbackFps,
        playbackSpeed: runPlaybackSpeed,
        countInBars: effectiveCountInEnabled ? 1 : 0,
      }).forEach((click) => {
        if (!effectiveMetronomeEnabled && click.timeSec >= 0) return;
        scheduleMetronomeClick(ctx, master, playBase + click.timeSec, click.accent);
      });
    }

    const schedulePluck = (evt: {
      start: number;
      duration: number;
      midi: number;
      gain: number;
      stringIndex?: number;
    }) => {
      if (!Number.isFinite(evt.midi) || evt.midi <= 0) return;
      schedulePreparedTrackNote({
        ctx,
        destination: master,
        instrument,
        midi: evt.midi,
        gain: evt.gain,
        startTime: playBase + evt.start,
        duration: Math.max(0.05, evt.duration),
      });
    };

    events.forEach((evt) => schedulePluck(evt));
    return { ctx, endFrame, startFrame: playbackStartFrame, startTimeSec: playBase };
  };

  const stopPlayback = () => {
    playbackStartRequestRef.current += 1;
    playbackStartPendingRef.current = false;
    if (playheadRafRef.current !== null) {
      window.cancelAnimationFrame(playheadRafRef.current);
      playheadRafRef.current = null;
    }
    playheadStartTimeRef.current = null;
    playheadEndFrameRef.current = null;
    playheadAudioStartRef.current = null;
    stopAudio();
    setIsPlaying(false);
  };

  const startPlayback = async (startFrameOverride?: number, speedOverride?: number) => {
    if (playheadRafRef.current !== null || playbackStartPendingRef.current) return;
    playbackStartPendingRef.current = true;
    const requestId = playbackStartRequestRef.current + 1;
    playbackStartRequestRef.current = requestId;
    const requestedStartFrame = clamp(
      Math.round(startFrameOverride ?? playheadFrameRef.current),
      0,
      timelineEnd
    );
    const startFrame =
      effectivePracticeLoopEnabled && effectivePracticeLoopRange
        ? effectivePracticeLoopRange.startFrame
        : requestedStartFrame;
    stopAudio();
    const runPlaybackSpeed = normalizePlaybackSpeed(speedOverride ?? effectivePlaybackSpeed);
    const scheduled = await schedulePlayback(startFrame, runPlaybackSpeed);
    playbackStartPendingRef.current = false;
    if (playbackStartRequestRef.current !== requestId) {
      if (scheduled?.ctx) {
        void scheduled.ctx.close();
      }
      return;
    }
    if (scheduled?.ctx) {
      audioRef.current = scheduled.ctx;
    }
    playheadAudioStartRef.current = scheduled?.startTimeSec ?? null;
    setEffectivePlayheadFrame(startFrame);
    playheadEndFrameRef.current = scheduled?.endFrame ?? timelineEnd;
    playheadStartFrameRef.current = scheduled?.startFrame ?? startFrame;
    playheadStartTimeRef.current = performance.now();
    setIsPlaying(true);
    const tick = (now: number) => {
      if (playheadStartTimeRef.current === null) return;
      let elapsed = (now - playheadStartTimeRef.current) / 1000;
      if (audioRef.current && playheadAudioStartRef.current !== null) {
        elapsed = audioRef.current.currentTime - playheadAudioStartRef.current;
      }
      if (elapsed < 0) elapsed = 0;
      const nextFrame = playheadStartFrameRef.current + elapsed * playbackFps * runPlaybackSpeed;
      const endFrame = playheadEndFrameRef.current ?? timelineEnd;
      if (nextFrame >= endFrame) {
        if (effectivePracticeLoopEnabled && effectivePracticeLoopRange) {
          const nextSpeed = effectiveSpeedTrainerEnabled
            ? nextSpeedTrainerValue(runPlaybackSpeed, effectiveSpeedTrainerStep, effectiveSpeedTrainerTarget)
            : runPlaybackSpeed;
          if (effectiveSpeedTrainerEnabled) {
            setEffectivePlaybackSpeed(nextSpeed);
          }
          setEffectivePlayheadFrame(effectivePracticeLoopRange.startFrame);
          stopPlayback();
          window.setTimeout(() => {
            void startPlayback(effectivePracticeLoopRange.startFrame, nextSpeed);
          }, 0);
          return;
        }
        setEffectivePlayheadFrame(endFrame);
        stopPlayback();
        return;
      }
      setEffectivePlayheadFrame(nextFrame);
      playheadRafRef.current = window.requestAnimationFrame(tick);
    };
    playheadRafRef.current = window.requestAnimationFrame(tick);
  };

  const togglePlayback = useCallback(() => {
    if (onGlobalPlaybackToggle) {
      onGlobalPlaybackToggle();
      return;
    }
    if (isPlaying) {
      stopPlayback();
    } else {
      const atTimelineEnd = Math.round(playheadFrameRef.current) >= timelineEnd;
      void startPlayback(atTimelineEnd ? 0 : undefined);
    }
  }, [isPlaying, onGlobalPlaybackToggle, timelineEnd]);

  useEffect(() => {
    if (!isActive && !useExternalPlayback && isPlaying) {
      stopPlayback();
    }
  }, [isActive, isPlaying, useExternalPlayback]);

  useEffect(() => {
    if (!selectionClearEpoch) return;
    if (selectionClearExemptEditorId && selectionClearExemptEditorId === editorId) return;
    setSelectedNoteIds([]);
    setSelectedChordIds([]);
    setSelection(null);
    selectionRef.current = null;
    setDraftNote(null);
    setDraftNoteAnchor(null);
    setNoteMenuAnchor(null);
    setNoteMenuNoteId(null);
    setNoteMenuDraft(null);
    setChordMenuAnchor(null);
    setChordMenuChordId(null);
    setChordMenuDraft(null);
    setSelectedCutBoundaryIndex(null);
    setKeyboardAddMode(null);
  }, [editorId, selectionClearEpoch, selectionClearExemptEditorId]);

  useEffect(() => {
    if (!barSelectionClearEpoch) return;
    if (barSelectionClearExemptEditorId && barSelectionClearExemptEditorId === editorId) return;
    setSelectedBarIndices([]);
    setBarSelectionAnchor(null);
    setLastBarInsertIndex(null);
  }, [barSelectionClearEpoch, barSelectionClearExemptEditorId, editorId]);

  useEffect(() => {
    if (!selectedBarIndices.length) return;
    const handleMouseDownCapture = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const barSelector = target.closest<HTMLElement>("[data-bar-select='true']");
      if (barSelector?.dataset.barSelectEditor === editorId) return;
      const barMenu = target.closest<HTMLElement>("[data-mobile-bar-menu='true']");
      if (barMenu?.dataset.mobileBarMenuEditor === editorId) return;
      setSelectedBarIndices([]);
      setBarSelectionAnchor(null);
      setLastBarInsertIndex(null);
    };
    window.addEventListener("mousedown", handleMouseDownCapture, true);
    return () => {
      window.removeEventListener("mousedown", handleMouseDownCapture, true);
    };
  }, [editorId, selectedBarIndices.length]);

  useEffect(() => {
    if (activeBarDrag) return;
    setBarDropIndex(null);
  }, [activeBarDrag]);

  useEffect(() => {
    if (!isMobileCanvasMode) return;
    setToolbarOpen(false);
    setSliceToolActive(false);
    setCutToolActive(false);
    setScaleToolActive(false);
    setDraftNote(null);
    setDraftNoteAnchor(null);
    setNoteMenuAnchor(null);
    setNoteMenuNoteId(null);
    setNoteMenuDraft(null);
    setChordMenuAnchor(null);
    setChordMenuChordId(null);
    setChordMenuDraft(null);
    setEditingChordId(null);
    setEditingChordAnchor(null);
    setChordNoteMenuAnchor(null);
    setChordNoteMenuIndex(null);
    setChordNoteMenuDraft(null);
    setSelectedNoteIds([]);
    setSelectedChordIds([]);
    setKeyboardAddMode(null);
  }, [isMobileCanvasMode]);

  const getKeyboardGridStepFrames = useCallback(() => {
    const beats = Math.max(1, Math.min(64, Math.round(timeSignature)));
    return Math.max(1, Math.floor(FIXED_FRAMES_PER_BAR / beats));
  }, [timeSignature]);

  const snapKeyboardCursorTimeToGrid = useCallback(
    (time: number) => {
      const step = getKeyboardGridStepFrames();
      const maxTime = Math.max(0, timelineEnd - 1);
      const safeTime = clamp(Math.round(time), 0, maxTime);
      const index = Math.round(safeTime / step);
      return clamp(index * step, 0, maxTime);
    },
    [clamp, getKeyboardGridStepFrames, timelineEnd]
  );

  const getCenteredKeyboardCursor = useCallback((): KeyboardGridCursor => {
    const container = timelineOuterRef.current;
    const centerFrameRaw = container
      ? Math.round((container.scrollLeft + container.clientWidth / 2) / Math.max(scale, 0.0001))
      : Math.round(playheadFrameRef.current);
    const centeredTime = snapKeyboardCursorTimeToGrid(centerFrameRaw);
    return { time: centeredTime, stringIndex: 3 };
  }, [scale, snapKeyboardCursorTimeToGrid]);

  const resolveKeyboardCursor = useCallback((): KeyboardGridCursor => {
    const current = keyboardGridCursorRef.current;
    if (current) {
      return {
        time: snapKeyboardCursorTimeToGrid(current.time),
        stringIndex: clamp(Math.round(current.stringIndex), 0, 5),
      };
    }
    const selectedId = selectedNoteIdsRef.current[0];
    if (Number.isInteger(selectedId)) {
      const resolvedId = resolveNoteId(selectedId);
      const selected = snapshotRef.current.notes.find((note) => note.id === resolvedId);
      if (selected) {
        return {
          time: snapKeyboardCursorTimeToGrid(selected.startTime),
          stringIndex: clamp(Math.round(selected.tab[0]), 0, 5),
        };
      }
    }
    return getCenteredKeyboardCursor();
  }, [clamp, getCenteredKeyboardCursor, resolveNoteId, snapKeyboardCursorTimeToGrid]);

  const getNoteIdsOnCursorGrid = useCallback((cursor: KeyboardGridCursor, cellWidthFrames: number) => {
    const cellStart = Math.round(cursor.time);
    const cellEnd = cellStart + Math.max(1, Math.round(cellWidthFrames));
    return snapshotRef.current.notes
      .filter((note) => {
        if (note.tab[0] !== cursor.stringIndex) return false;
        const noteStart = Math.round(note.startTime);
        const noteEnd = Math.max(noteStart + 1, Math.round(note.startTime + note.length));
        return noteStart < cellEnd && noteEnd > cellStart;
      })
      .map((note) => note.id);
  }, []);

  const getOrderedNoteIdsOnCursorGrid = useCallback(
    (cursor: KeyboardGridCursor, cellWidthFrames: number) => {
      const cellStart = Math.round(cursor.time);
      const cellEnd = cellStart + Math.max(1, Math.round(cellWidthFrames));
      return snapshotRef.current.notes
        .filter((note) => {
          if (note.tab[0] !== cursor.stringIndex) return false;
          const noteStart = Math.round(note.startTime);
          const noteEnd = Math.max(noteStart + 1, Math.round(note.startTime + note.length));
          return noteStart < cellEnd && noteEnd > cellStart;
        })
        .sort((a, b) => a.startTime - b.startTime || a.id - b.id)
        .map((note) => note.id);
    },
    []
  );

  const getGridCycleKey = useCallback((cursor: KeyboardGridCursor, cellWidthFrames: number) => {
    const cellStart = Math.round(cursor.time);
    const cellEnd = cellStart + Math.max(1, Math.round(cellWidthFrames));
    return `${cursor.stringIndex}|${cellStart}|${cellEnd}`;
  }, []);

  const setKeyboardSelection = useCallback((cursor: KeyboardGridCursor, noteId: number | null) => {
    setKeyboardGridCursor(cursor);
    setSelectedCutBoundaryIndex(null);
    setDraftNote(null);
    setDraftNoteAnchor(null);
    setNoteMenuAnchor(null);
    setNoteMenuNoteId(null);
    setNoteMenuDraft(null);
    setChordMenuAnchor(null);
    setChordMenuChordId(null);
    setChordMenuDraft(null);
    if (noteId === null) {
      setSelectedNoteIds([]);
      setSelectedChordIds([]);
      return;
    }
    setSelectedNoteIds([noteId]);
    setSelectedChordIds([]);
  }, []);

  const normalizeTypedFretText = useCallback(
    (previous: string, digit: string) => {
      const merged = `${previous}${digit}`.replace(/^0+(?=\d)/, "");
      const mergedValue = merged === "" ? null : Number(merged);
      if (mergedValue !== null && Number.isInteger(mergedValue) && mergedValue >= 0 && mergedValue <= maxFret) {
        return merged;
      }
      const digitValue = Number(digit);
      if (Number.isInteger(digitValue) && digitValue >= 0 && digitValue <= maxFret) {
        return String(digitValue);
      }
      return previous;
    },
    [maxFret]
  );

  const assignNoteFretById = useCallback(
    (rawNoteId: number, fretValue: number, options?: { playPreview?: boolean }) => {
      if (!Number.isInteger(fretValue) || fretValue < 0 || fretValue > maxFret) return false;
      const resolvedCurrentId = resolveNoteId(rawNoteId);
      const current = snapshotRef.current.notes.find((note) => note.id === resolvedCurrentId);
      if (!current) return false;
      if (current.tab[1] === fretValue) return true;
      const nextTab: TabCoord = [current.tab[0], fretValue];
      if (options?.playPreview) {
        playNotePreview(nextTab);
      }
      enqueueOptimisticMutation({
        label: "keyboard-fret",
        apply: (draft) => {
          const noteId = resolveNoteId(rawNoteId);
          const note = draft.notes.find((item) => item.id === noteId);
          if (!note) return draft;
          note.tab = [nextTab[0], nextTab[1]];
          note.midiNum = 0;
          return draft;
        },
        commit: () => {
          const noteId = resolveNoteId(rawNoteId);
          return gteApi.assignNoteTab(editorId, noteId, nextTab);
        },
      });
      return true;
    },
    [editorId, enqueueOptimisticMutation, maxFret, playNotePreview, resolveNoteId]
  );

  const createKeyboardNoteAtCursor = useCallback(
    (cursor: KeyboardGridCursor, fretDigit: string) => {
      const fretValue = Number(fretDigit);
      if (!Number.isInteger(fretValue) || fretValue < 0 || fretValue > maxFret) return;
      const rawLength = clampEventLength(lastAddedNoteLengthRef.current);
      const snapped = snapNoteToGrid(cursor.time, rawLength);
      const tab: TabCoord = [cursor.stringIndex, fretValue];
      const tempId = getTempNoteId();
      enqueueOptimisticMutation({
        label: "keyboard-add-note",
        createdNotes: [{ tempId, signature: noteSignature(snapped.startTime, snapped.length, tab) }],
        apply: (draft) => {
          draft.notes.push({
            id: tempId,
            startTime: snapped.startTime,
            length: snapped.length,
            midiNum: 0,
            tab: [tab[0], tab[1]],
            optimals: [],
          });
          return draft;
        },
        commit: () =>
          gteApi.addNote(editorId, {
            tab,
            startTime: snapped.startTime,
            length: snapped.length,
            snapToGrid: snapToGridEnabled,
          }),
      });
      lastAddedNoteLengthRef.current = clampEventLength(snapped.length);
      setKeyboardGridCursor({ time: snapped.startTime, stringIndex: cursor.stringIndex });
      setKeyboardAddMode({ noteId: tempId, fretText: String(fretValue) });
      setSelectedNoteIds([tempId]);
      setSelectedChordIds([]);
      setDraftNote(null);
      setDraftNoteAnchor(null);
      setNoteMenuAnchor(null);
      setNoteMenuNoteId(null);
      setNoteMenuDraft(null);
      setChordMenuAnchor(null);
      setChordMenuChordId(null);
      setChordMenuDraft(null);
    },
    [editorId, enqueueOptimisticMutation, getTempNoteId, maxFret, noteSignature, snapNoteToGrid, snapToGridEnabled]
  );

  const finalizeKeyboardAddMode = useCallback(
    (options?: { playPreview?: boolean }) => {
      const active = keyboardAddModeRef.current;
      if (!active) return;
      setKeyboardAddMode(null);
      noteFretTypingBufferRef.current = "";
      noteFretTypingAtRef.current = 0;
      if (!options?.playPreview) return;
      const resolvedId = resolveNoteId(active.noteId);
      const note = snapshotRef.current.notes.find((item) => item.id === resolvedId);
      if (!note) return;
      playNotePreview([note.tab[0], note.tab[1]]);
    },
    [playNotePreview, resolveNoteId]
  );

  const getDirectionalCursorFromSelectedNote = useCallback(
    (
      note: { startTime: number; length: number; tab: TabCoord },
      key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
      step: number
    ) => {
      const maxTime = Math.max(0, timelineEnd - 1);
      const safeStart = clamp(note.startTime, 0, maxTime);
      const safeEnd = clamp(note.startTime + Math.max(1, Math.round(note.length)), 0, timelineEnd);
      const safeStep = Math.max(1, step);
      const ratioStart = safeStart / safeStep;
      let index = Math.round(ratioStart);
      if (key === "ArrowRight") {
        index = Math.max(index + 1, Math.ceil(safeEnd / safeStep));
      } else if (key === "ArrowLeft") {
        index = Math.floor((safeStart - 1) / safeStep);
      }
      return {
        time: clamp(Math.round(index * safeStep), 0, maxTime),
        stringIndex: clamp(Math.round(note.tab[0]), 0, 5),
      };
    },
    [clamp, timelineEnd]
  );

  const [noteForm, setNoteForm] = useState<NoteFormState>({
    stringIndex: null,
    fret: null,
    startTime: null,
    length: null,
  });

  const [chordForm, setChordForm] = useState<ChordFormState>({
    startTime: null,
    length: null,
  });
  const [chordTabsForm, setChordTabsForm] = useState<OptionalTabCoord[]>([]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => {
      setError(null);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [error]);

  useEffect(() => {
    if (selectedNote) {
      setNoteForm({
        stringIndex: selectedNote.tab[0],
        fret: selectedNote.tab[1],
        startTime: selectedNote.startTime,
        length: selectedNote.length,
      });
    }
  }, [selectedNote]);

  useEffect(() => {
    if (selectedChord) {
      setChordForm({
        startTime: selectedChord.startTime,
        length: selectedChord.length,
      });
      setChordTabsForm(
        selectedChord.currentTabs.map((tab) => [tab[0], tab[1]] as OptionalTabCoord)
      );
    } else {
      setChordTabsForm([]);
    }
  }, [selectedChord]);

  useEffect(() => {
    if (!isActive || mobileViewport) return;
    if (selectedNoteIds.length !== 1 || !selectedNote) return;
    const next: KeyboardGridCursor = {
      time: snapKeyboardCursorTimeToGrid(selectedNote.startTime),
      stringIndex: clamp(Math.round(selectedNote.tab[0]), 0, 5),
    };
    setKeyboardGridCursor((prev) => (prev ? prev : next));
  }, [clamp, isActive, mobileViewport, selectedNote, selectedNoteIds.length, snapKeyboardCursorTimeToGrid]);

  useEffect(() => {
    if (!isActive || mobileViewport) return;
    if (selectedNoteIds.length > 0) return;
    if (keyboardGridCursorRef.current) return;
    setKeyboardGridCursor(getCenteredKeyboardCursor());
  }, [getCenteredKeyboardCursor, isActive, mobileViewport, selectedNoteIds.length]);

  useEffect(() => {
    if (selectedNoteIds.length !== 1) {
      noteFretTypingBufferRef.current = "";
      noteFretTypingAtRef.current = 0;
    }
  }, [selectedNoteIds.length]);

  useEffect(() => {
    if (!keyboardAddMode) return;
    const resolvedId = resolveNoteId(keyboardAddMode.noteId);
    const stillExists = snapshot.notes.some((note) => note.id === resolvedId);
    if (!stillExists) {
      setKeyboardAddMode(null);
    }
  }, [keyboardAddMode, resolveNoteId, snapshot.notes]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = isShortcutTextEntryTarget(target);
      const scaleModeSelect = target?.closest<HTMLElement>("[data-scale-mode-select='true']");
      if (!isTyping) {
        blurFocusedShortcutControl(target);
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
        if (isTyping) return;
        event.preventDefault();
        if (event.shiftKey) {
          requestRedo();
        } else {
          requestUndo();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "y" || event.key === "Y")) {
        if (isTyping) return;
        event.preventDefault();
        requestRedo();
        return;
      }
      if (event.key === "Escape") {
        setKeyboardAddMode(null);
        noteFretTypingBufferRef.current = "";
        noteFretTypingAtRef.current = 0;
        if (scaleToolActive) {
          event.preventDefault();
          deactivateScaleTool();
          return;
        }
        if (editingChordId !== null) {
          exitChordEdit();
          return;
        }
        setSelectedNoteIds([]);
        setSelectedChordIds([]);
        setDraftNote(null);
        setDraftNoteAnchor(null);
        cancelSegmentEdit();
        setSelectedCutBoundaryIndex(null);
        setNoteMenuAnchor(null);
        setNoteMenuNoteId(null);
        setNoteMenuDraft(null);
        setChordMenuAnchor(null);
        setChordMenuChordId(null);
        setChordMenuDraft(null);
        return;
      }
      if (event.key === "Enter" && scaleToolActive) {
        if (isTyping && !target?.closest("[data-scale-hud='true']")) return;
        event.preventDefault();
        commitScaleTool();
        return;
      }
      if (event.key === "Enter" && editingChordId !== null) {
        if (isTyping || chordNoteMenuIndex !== null) return;
        exitChordEdit();
        return;
      }
      if (
        event.code === "KeyS" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (isTyping && !scaleModeSelect) return;
        event.preventDefault();
        if (scaleModeSelect) {
          scaleModeSelect.blur();
        }
        if (!scaleToolActive) {
          activateScaleTool();
        }
        return;
      }
      if (
        event.code === "KeyH" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (isTyping && !scaleModeSelect) return;
        event.preventDefault();
        if (scaleModeSelect) {
          scaleModeSelect.blur();
        }
        cycleScaleToolModeWithShortcut();
        return;
      }
      if (
        scaleToolActive &&
        !isTyping &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (/^\d$/.test(event.key) || event.key === "." || event.key === "Backspace")
      ) {
        event.preventDefault();
        const now = Date.now();
        const lastTyped = scaleFactorTypingAtRef.current;
        let buffer = scaleFactorTypingRef.current ?? "";
        if (!buffer || now - lastTyped > 1400) {
          buffer = "";
        }
        if (event.key === "Backspace") {
          buffer = buffer.slice(0, -1);
        } else if (event.key === ".") {
          if (buffer.includes(".")) return;
          buffer = buffer.length ? `${buffer}.` : "0.";
        } else {
          buffer += event.key;
        }
        scaleFactorTypingRef.current = buffer;
        scaleFactorTypingAtRef.current = now;
        if (!buffer) {
          setScaleFactorInput("");
          return;
        }
        handleScaleFactorInputChange(buffer);
        return;
      }
      const isArrowKey =
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown";
      const isDigitKey = /^\d$/.test(event.key);
      const isPlusKey =
        event.code === "NumpadAdd" ||
        event.key === "+" ||
        (event.key === "=" && event.shiftKey);
      const isMinusKey = event.code === "NumpadSubtract" || event.key === "-";
      const allowCtrlOrMetaForArrow = isArrowKey && (event.ctrlKey || event.metaKey);
      if (
        !mobileViewport &&
        !isTyping &&
        !event.altKey &&
        ((!event.ctrlKey && !event.metaKey) || allowCtrlOrMetaForArrow)
      ) {
        if (event.key === "Enter" && keyboardAddModeRef.current) {
          event.preventDefault();
          finalizeKeyboardAddMode({ playPreview: true });
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const cursor = resolveKeyboardCursor();
          const step = getKeyboardGridStepFrames();
          const orderedNoteIds = getOrderedNoteIdsOnCursorGrid(cursor, step);
          setKeyboardGridCursor(cursor);
          setSelectedCutBoundaryIndex(null);
          setDraftNote(null);
          setDraftNoteAnchor(null);
          setNoteMenuAnchor(null);
          setNoteMenuNoteId(null);
          setNoteMenuDraft(null);
          setChordMenuAnchor(null);
          setChordMenuChordId(null);
          setChordMenuDraft(null);
          setSelectedChordIds([]);
          if (event.shiftKey) {
            enterGridCycleRef.current = null;
            setSelectedNoteIds((prev) => {
              const merged = new Set(prev);
              orderedNoteIds.forEach((id) => merged.add(id));
              return Array.from(merged);
            });
            return;
          }
          if (orderedNoteIds.length <= 1) {
            enterGridCycleRef.current = null;
            setSelectedNoteIds(orderedNoteIds);
            return;
          }
          const gridKey = getGridCycleKey(cursor, step);
          const previousCycle = enterGridCycleRef.current;
          let nextIndex = 0;
          if (
            previousCycle &&
            previousCycle.gridKey === gridKey &&
            previousCycle.order.length === orderedNoteIds.length &&
            previousCycle.order.every((id, idx) => id === orderedNoteIds[idx])
          ) {
            nextIndex = (previousCycle.index + 1) % orderedNoteIds.length;
          }
          enterGridCycleRef.current = {
            gridKey,
            order: orderedNoteIds,
            index: nextIndex,
          };
          setSelectedNoteIds([orderedNoteIds[nextIndex]]);
          return;
        }

        if ((isPlusKey || isMinusKey) && selectedNoteIdsRef.current.length === 1 && !keyboardAddModeRef.current) {
          const selectedId = resolveNoteId(selectedNoteIdsRef.current[0]);
          const current = snapshotRef.current.notes.find((note) => note.id === selectedId);
          if (!current) return;
          event.preventDefault();
          noteFretTypingBufferRef.current = "";
          noteFretTypingAtRef.current = 0;
          const nextFret = clamp(current.tab[1] + (isPlusKey ? 1 : -1), 0, maxFret);
          setNoteMenuDraft((prev) => (prev ? { ...prev, fret: String(nextFret) } : prev));
          void assignNoteFretById(current.id, nextFret, { playPreview: true });
          return;
        }

        if (isDigitKey) {
          event.preventDefault();
          const activeAddMode = keyboardAddModeRef.current;
          if (activeAddMode) {
            const nextText = normalizeTypedFretText(activeAddMode.fretText, event.key);
            if (nextText !== activeAddMode.fretText) {
              const nextFret = Number(nextText);
              if (Number.isInteger(nextFret)) {
                assignNoteFretById(activeAddMode.noteId, nextFret);
                setKeyboardAddMode((prev) => (prev ? { ...prev, fretText: nextText } : prev));
              }
            }
            return;
          }

          const selectedId = selectedNoteIdsRef.current.length === 1 ? selectedNoteIdsRef.current[0] : null;
          if (selectedId !== null) {
            const now = Date.now();
            const withinTypingWindow = now - noteFretTypingAtRef.current <= KEYBOARD_FRET_TYPE_TIMEOUT_MS;
            const base = withinTypingWindow ? noteFretTypingBufferRef.current : "";
            const nextText = normalizeTypedFretText(base, event.key);
            if (nextText) {
              noteFretTypingBufferRef.current = nextText;
              noteFretTypingAtRef.current = now;
              const nextFret = Number(nextText);
              if (Number.isInteger(nextFret)) {
                assignNoteFretById(selectedId, nextFret);
              }
            }
            return;
          }

          const cursor = resolveKeyboardCursor();
          const step = getKeyboardGridStepFrames();
          const noteIdsOnGrid = getNoteIdsOnCursorGrid(cursor, step);
          if (noteIdsOnGrid.length > 0) {
            noteFretTypingBufferRef.current = "";
            noteFretTypingAtRef.current = 0;
            return;
          }
          noteFretTypingBufferRef.current = event.key;
          noteFretTypingAtRef.current = Date.now();
          createKeyboardNoteAtCursor(cursor, event.key);
          return;
        }

        if (isArrowKey) {
          event.preventDefault();
          if (keyboardAddModeRef.current) {
            finalizeKeyboardAddMode({ playPreview: true });
          }
          noteFretTypingBufferRef.current = "";
          noteFretTypingAtRef.current = 0;
          enterGridCycleRef.current = null;
          const step = getKeyboardGridStepFrames();
          const selectedId = selectedNoteIdsRef.current.length === 1 ? selectedNoteIdsRef.current[0] : null;
          const selectedNoteGroup = Array.from(
            new Set(selectedNoteIdsRef.current.map((id) => resolveNoteId(id)))
          )
            .map((id) => snapshotRef.current.notes.find((note) => note.id === id))
            .filter((note): note is (typeof snapshotRef.current.notes)[number] => Boolean(note));
          if ((event.ctrlKey || event.metaKey) && selectedNoteGroup.length > 1) {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              const deltaString = event.key === "ArrowUp" ? -1 : 1;
              const updates = selectedNoteGroup
                .map((note) => ({
                  id: note.id,
                  nextString: clamp(note.tab[0] + deltaString, 0, 5),
                  fret: note.tab[1],
                }))
                .filter((item, index) => item.nextString !== selectedNoteGroup[index].tab[0]);
              if (!updates.length) return;
              playNotePreview([updates[0].nextString, updates[0].fret]);
              enqueueOptimisticMutation({
                label: "keyboard-shift-arrow-string-multi",
                apply: (draft) => {
                  updates.forEach((update) => {
                    const note = draft.notes.find((item) => item.id === update.id);
                    if (!note) return;
                    note.tab = [update.nextString, note.tab[1]];
                    note.midiNum = 0;
                  });
                  return draft;
                },
                commit: async () => {
                  let last: { snapshot?: EditorSnapshot } | null = null;
                  for (const update of updates) {
                    last = await gteApi.assignNoteTab(editorId, update.id, [update.nextString, update.fret]);
                  }
                  return last ?? {};
                },
              });
              const cursor = resolveKeyboardCursor();
              setKeyboardGridCursor({
                time: cursor.time,
                stringIndex: clamp(cursor.stringIndex + deltaString, 0, 5),
              });
              return;
            }
            const desiredDelta = event.key === "ArrowLeft" ? -step : step;
            let minDelta = -Infinity;
            let maxDelta = Infinity;
            selectedNoteGroup.forEach((note) => {
              minDelta = Math.max(minDelta, -note.startTime);
              maxDelta = Math.min(maxDelta, timelineEnd - Math.max(1, Math.round(note.length)) - note.startTime);
            });
            const appliedDelta = clamp(desiredDelta, minDelta, maxDelta);
            if (!Number.isFinite(appliedDelta) || appliedDelta === 0) return;
            const updates = selectedNoteGroup.map((note) => ({
              id: note.id,
              nextStart: note.startTime + appliedDelta,
            }));
            enqueueOptimisticMutation({
              label: "keyboard-shift-arrow-time-multi",
              apply: (draft) => {
                updates.forEach((update) => {
                  const note = draft.notes.find((item) => item.id === update.id);
                  if (!note) return;
                  note.startTime = update.nextStart;
                });
                return draft;
              },
              commit: async () => {
                let last: { snapshot?: EditorSnapshot } | null = null;
                for (const update of updates) {
                  last = await gteApi.setNoteStartTime(
                    editorId,
                    update.id,
                    update.nextStart,
                    snapToGridEnabled
                  );
                }
                return last ?? {};
              },
            });
            const cursor = resolveKeyboardCursor();
            setKeyboardGridCursor({
              time: snapKeyboardCursorTimeToGrid(cursor.time + appliedDelta),
              stringIndex: cursor.stringIndex,
            });
            return;
          }
          if ((event.ctrlKey || event.metaKey) && selectedId !== null) {
            const resolvedId = resolveNoteId(selectedId);
            const selected = snapshotRef.current.notes.find((note) => note.id === resolvedId);
            if (!selected) return;
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              const deltaString = event.key === "ArrowUp" ? -1 : 1;
              const nextString = clamp(selected.tab[0] + deltaString, 0, 5);
              if (nextString === selected.tab[0]) return;
              const nextTab: TabCoord = [nextString, selected.tab[1]];
              playNotePreview(nextTab);
              enqueueOptimisticMutation({
                label: "keyboard-shift-arrow-string",
                apply: (draft) => {
                  const note = draft.notes.find((item) => item.id === resolvedId);
                  if (!note) return draft;
                  note.tab = [nextTab[0], nextTab[1]];
                  note.midiNum = 0;
                  return draft;
                },
                commit: () => gteApi.assignNoteTab(editorId, resolvedId, nextTab),
              });
              setKeyboardGridCursor({
                time: snapKeyboardCursorTimeToGrid(selected.startTime),
                stringIndex: nextString,
              });
              return;
            }
            const delta = event.key === "ArrowLeft" ? -step : step;
            const maxStart = Math.max(0, timelineEnd - Math.max(1, Math.round(selected.length)));
            const rawNext = selected.startTime + delta;
            const snappedNext = clamp(snapKeyboardCursorTimeToGrid(rawNext), 0, maxStart);
            if (snappedNext === selected.startTime) return;
            enqueueOptimisticMutation({
              label: "keyboard-shift-arrow-time",
              apply: (draft) => {
                const note = draft.notes.find((item) => item.id === resolvedId);
                if (!note) return draft;
                note.startTime = snappedNext;
                return draft;
              },
              commit: () => gteApi.setNoteStartTime(editorId, resolvedId, snappedNext, snapToGridEnabled),
            });
            setKeyboardGridCursor({ time: snappedNext, stringIndex: selected.tab[0] });
            return;
          }

          const selectedForCursor =
            selectedId !== null
              ? snapshotRef.current.notes.find((note) => note.id === resolveNoteId(selectedId)) ?? null
              : null;
          const currentKeyboardCursor = keyboardGridCursorRef.current;
          const baseCursor = currentKeyboardCursor
            ? currentKeyboardCursor
            : selectedForCursor
              ? getDirectionalCursorFromSelectedNote(
                  selectedForCursor,
                  event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
                  step
                )
              : resolveKeyboardCursor();
          const nextCursor: KeyboardGridCursor = { ...baseCursor };
          if (event.key === "ArrowLeft") {
            nextCursor.time = snapKeyboardCursorTimeToGrid(baseCursor.time - step);
          } else if (event.key === "ArrowRight") {
            nextCursor.time = snapKeyboardCursorTimeToGrid(baseCursor.time + step);
          }
          if (event.key === "ArrowUp") {
            nextCursor.stringIndex = clamp(baseCursor.stringIndex - 1, 0, 5);
          } else if (event.key === "ArrowDown") {
            nextCursor.stringIndex = clamp(baseCursor.stringIndex + 1, 0, 5);
          }
          setKeyboardGridCursor(nextCursor);
          setSelectedCutBoundaryIndex(null);
          setDraftNote(null);
          setDraftNoteAnchor(null);
          setNoteMenuAnchor(null);
          setNoteMenuNoteId(null);
          setNoteMenuDraft(null);
          setChordMenuAnchor(null);
          setChordMenuChordId(null);
          setChordMenuDraft(null);
          setSelectedChordIds([]);
          return;
        }
      }
      if (event.key === "t" || event.key === "T") {
        if (isTyping) return;
        event.preventDefault();
        setToolbarOpen((prev) => !prev);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "c" || event.key === "C")) {
        if (isTyping) return;
        if (selectedBarIndices.length > 0 && onRequestSelectedBarsCopy) {
          event.preventDefault();
          handleCopySelectedBars();
          return;
        }
        event.preventDefault();
        void handleCopySelection();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "v" || event.key === "V")) {
        if (isTyping) return;
        if (barClipboardAvailable && onRequestSelectedBarsPaste && lastBarInsertIndex !== null) {
          event.preventDefault();
          handlePasteSelectedBars();
          return;
        }
        event.preventDefault();
        void handlePaste();
        return;
      }
      if (event.key === "a" || event.key === "A") {
        if (isTyping) return;
        event.preventDefault();
        const allSelected =
          selectedNoteIds.length === snapshot.notes.length &&
          selectedChordIds.length === snapshot.chords.length;
        if (allSelected) {
          setSelectedNoteIds([]);
          setSelectedChordIds([]);
        } else {
          setSelectedNoteIds(snapshot.notes.map((note) => note.id));
          setSelectedChordIds(snapshot.chords.map((chord) => chord.id));
        }
        return;
      }
      if (event.code === "Space") {
        if (isTyping) return;
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (
        event.code === "KeyG" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (isTyping) return;
        event.preventDefault();
        setSnapToGridEnabled((prev) => !prev);
        return;
      }
      if (event.key === "c" || event.key === "C") {
        if (isTyping) return;
        if (guardSingleTrackSelectionAction("Make Chord")) return;
        void handleMakeChord();
        return;
      }
      if (event.key === "l" || event.key === "L") {
        if (isTyping) return;
        if (guardSingleTrackSelectionAction("Disband")) return;
        if (activeChordIds.length) {
          const chordIds = [...activeChordIds];
          void runMutation(async () => {
            const latestSnapshot = await disbandChordIds(chordIds);
            return latestSnapshot ? { snapshot: latestSnapshot } : {};
          }, {
            localApply: (draft) => {
              chordIds.forEach((chordId) => disbandChordInSnapshot(draft, chordId));
            },
          });
          setSelectedChordIds([]);
        }
        return;
      }
      if (event.key === "k" || event.key === "K") {
        if (isTyping) return;
        event.preventDefault();
        toggleCutTool();
        return;
      }
      if (
        event.code === "KeyS" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (isTyping) return;
        event.preventDefault();
        toggleSliceTool();
        return;
      }
      if (event.key === "j" || event.key === "J") {
        if (isTyping) return;
        if (guardSingleTrackSelectionAction("Join")) return;
        if (selectedNoteIds.length > 0) {
          event.preventDefault();
          handleJoinSelectedNotes();
        }
        return;
      }
      if (event.key === "o" || event.key === "O") {
        if (isTyping) return;
        if (guardSingleTrackSelectionAction("Optimize")) return;
        if (selectedNoteIds.length > 0) {
          event.preventDefault();
          handleAssignOptimals();
        }
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (
        isTyping
      ) {
        return;
      }
      if (selectedBarIndices.length > 0 && onRequestSelectedBarsDelete) {
        event.preventDefault();
        handleDeleteSelectedBars();
        return;
      }
      if (selectedCutBoundaryIndex !== null) {
        event.preventDefault();
        void runMutation(() => gteApi.deleteCutBoundary(editorId, selectedCutBoundaryIndex), {
          localApply: (draft) => {
            deleteCutBoundaryInSnapshot(draft, selectedCutBoundaryIndex);
          },
        });
        setSelectedCutBoundaryIndex(null);
        return;
      }
      if (selectedNoteIds.length > 0) {
        const noteIdsToDelete = Array.from(new Set(selectedNoteIds));
        const deleteSelectedNotesFromSnapshot = (draft: EditorSnapshot) => {
          noteIdsToDelete.forEach((id) => removeNoteFromSnapshot(draft, id));
          return draft;
        };
        const nextSnapshot = deleteSelectedNotesFromSnapshot(cloneSnapshot(snapshotRef.current));
        enqueueOptimisticMutation({
          label: "delete-selected-notes",
          apply: deleteSelectedNotesFromSnapshot,
          commit: async () => gteApi.applySnapshot(editorId, nextSnapshot),
        });
        setSelectedNoteIds([]);
      } else if (activeChordIds.length > 0) {
        const chordIdsToDelete = Array.from(new Set(activeChordIds));
        const deleteSelectedChordsFromSnapshot = (draft: EditorSnapshot) => {
          chordIdsToDelete.forEach((id) => removeChordFromSnapshot(draft, id));
          return draft;
        };
        const nextSnapshot = deleteSelectedChordsFromSnapshot(cloneSnapshot(snapshotRef.current));
        enqueueOptimisticMutation({
          label: "delete-selected-chords",
          apply: deleteSelectedChordsFromSnapshot,
          commit: async () => gteApi.applySnapshot(editorId, nextSnapshot),
        });
        setSelectedChordIds([]);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    isActive,
    selectedNoteIds,
    selectedChordIds,
    activeChordIds,
    selectedCutBoundaryIndex,
    editorId,
    runMutation,
    requestUndo,
    requestRedo,
    toggleCutTool,
    guardSingleTrackSelectionAction,
    toggleSliceTool,
    togglePlayback,
    activateScaleTool,
    cycleScaleToolModeWithShortcut,
    commitScaleTool,
    deactivateScaleTool,
    handleScaleFactorInputChange,
    setSnapToGridEnabled,
    scaleToolActive,
    cloneSnapshot,
    barClipboardAvailable,
    handleCopySelectedBars,
    handleDeleteSelectedBars,
    handlePasteSelectedBars,
    lastBarInsertIndex,
    onRequestSelectedBarsCopy,
    onRequestSelectedBarsDelete,
    onRequestSelectedBarsPaste,
    selectedBarIndices,
    assignNoteFretById,
    clamp,
    createKeyboardNoteAtCursor,
    enqueueOptimisticMutation,
    finalizeKeyboardAddMode,
    getGridCycleKey,
    getKeyboardGridStepFrames,
    getOrderedNoteIdsOnCursorGrid,
    getNoteIdsOnCursorGrid,
    maxFret,
    mobileViewport,
    normalizeTypedFretText,
    playNotePreview,
    resolveKeyboardCursor,
    resolveNoteId,
    setKeyboardSelection,
    getDirectionalCursorFromSelectedNote,
    snapKeyboardCursorTimeToGrid,
    snapToGridEnabled,
    timelineEnd,
  ]);

  useEffect(() => {
    const handlePointerStart = (target: HTMLElement | null, shiftKey: boolean) => {
      if (!target) return;
      if (keyboardAddModeRef.current) {
        finalizeKeyboardAddMode({ playPreview: true });
      }
      if (shiftKey && target.closest("[data-gte-track='true']")) return;
      if (!target.closest("[data-cut-edit]")) {
        commitSegmentEditIfActive();
      }
      if (editingChordId !== null) {
        if (chordNoteMenuRef.current && chordNoteMenuRef.current.contains(target)) return;
        if (chordEditPanelRef.current && chordEditPanelRef.current.contains(target)) return;
        if (toolbarRef.current && toolbarRef.current.contains(target)) return;
        if (target.closest("[data-gte-floating-ui='true']")) return;
        if (timelineRef.current && timelineRef.current.contains(target)) {
          setChordNoteMenuAnchor(null);
          setChordNoteMenuIndex(null);
          setChordNoteMenuDraft(null);
        }
        return;
      }
      if (contextMenuRef.current && contextMenuRef.current.contains(target)) return;
      if (contextMenu) {
        setContextMenu(null);
      }
      if (target.closest("button, a, input, textarea, select")) return;
      if (target.closest("[data-gte-floating-ui='true']")) return;
      if (draftPopupRef.current && draftPopupRef.current.contains(target)) return;
      if (noteMenuRef.current && noteMenuRef.current.contains(target)) return;
      if (chordMenuRef.current && chordMenuRef.current.contains(target)) return;
      if (toolbarRef.current && toolbarRef.current.contains(target)) return;
      if (timelineRef.current && timelineRef.current.contains(target)) return;
      setSelectedNoteIds([]);
      setSelectedChordIds([]);
      setDraftNote(null);
      setDraftNoteAnchor(null);
      setNoteMenuAnchor(null);
      setNoteMenuNoteId(null);
      setNoteMenuDraft(null);
      setChordMenuAnchor(null);
      setChordMenuChordId(null);
      setChordMenuDraft(null);
    };

    const handleMouseDown = (event: globalThis.MouseEvent) => {
      handlePointerStart(event.target as HTMLElement | null, event.shiftKey);
    };

    const handleTouchStart = (event: globalThis.TouchEvent) => {
      handlePointerStart(event.target as HTMLElement | null, false);
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("touchstart", handleTouchStart);
    };
  }, [commitSegmentEditIfActive, contextMenu, editingChordId, finalizeKeyboardAddMode]);

  const workspaceClass = embedded
    ? `relative w-full min-w-0 max-w-full overflow-x-hidden border bg-white transition-[border-color,box-shadow] ${
        isMobileEditMode
          ? "flex h-full min-h-0 flex-col p-1.5"
          : `${compactEmbeddedMobile ? "rounded-lg p-1.5" : "rounded-xl p-2"} space-y-2`
      } ${
        isActive
          ? "border-sky-300 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.22),0_1px_2px_rgba(15,23,42,0.04)]"
          : "border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      }`
    : "relative min-w-0 rounded-2xl border border-slate-200 bg-white p-5 space-y-5 -ml-3 w-[calc(100%+0.75rem)]";

  const keyboardCursorMarker = useMemo<KeyboardCursorMarker | null>(() => {
    if (mobileViewport || !isActive || !keyboardGridCursor) return null;
    const step = getKeyboardGridStepFrames();
    const safeTime = snapKeyboardCursorTimeToGrid(keyboardGridCursor.time);
    const rowIndex = rowFrames > 0 ? clamp(Math.floor(safeTime / rowFrames), 0, rows - 1) : 0;
    const rowStart = rowIndex * rowFrames;
    const rowBarCount = getRowBarCount(rowIndex);
    const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
    const rowWidth = availableFrames * scale;
    const cellWidth = Math.max(8, step * scale);
    const left = clamp((safeTime - rowStart) * scale, 0, Math.max(0, rowWidth - cellWidth));
    const stringIndex = clamp(Math.round(keyboardGridCursor.stringIndex), 0, 5);
    const top = rowIndex * rowStride + stringIndex * ROW_HEIGHT;
    return { left, top, width: cellWidth, height: ROW_HEIGHT };
  }, [
    clamp,
    framesPerMeasure,
    getKeyboardGridStepFrames,
    isActive,
    keyboardGridCursor,
    mobileViewport,
    rowFrames,
    rowStride,
    rows,
    scale,
    snapKeyboardCursorTimeToGrid,
    timelineEnd,
  ]);

  useEffect(() => {
    if (mobileViewport || !isActive || !keyboardCursorMarker) return;
    const container = timelineOuterRef.current;
    if (!container) return;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    if (maxScroll <= 0) return;

    const edgePadding = 48;
    const cursorLeft = keyboardCursorMarker.left;
    const cursorRight = keyboardCursorMarker.left + keyboardCursorMarker.width;
    const visibleLeft = container.scrollLeft + edgePadding;
    const visibleRight = container.scrollLeft + container.clientWidth - edgePadding;

    let nextScrollLeft = container.scrollLeft;
    if (cursorLeft < visibleLeft) {
      nextScrollLeft = Math.max(0, cursorLeft - edgePadding);
    } else if (cursorRight > visibleRight) {
      nextScrollLeft = Math.min(maxScroll, cursorRight + edgePadding - container.clientWidth);
    }

    if (Math.abs(nextScrollLeft - container.scrollLeft) < 1) return;
    container.scrollTo({ left: nextScrollLeft });
  }, [isActive, keyboardCursorMarker, mobileViewport]);

  const showMobileEditRail = isMobileEditMode && isActive;
  const showMobileInlineNoteSettings =
    isMobileEditMode &&
    isActive &&
    Boolean(selectedNote && noteMenuNoteId === selectedNote.id && noteMenuDraft && selectedNoteIds.length === 1);
  const showMobileInlineToolbar = isMobileEditMode && isActive && showToolbarUi;
  const mobileNoteFingeringOptions = useMemo(
    () => [
      ...(noteAlternates?.possibleTabs || []).map((tab) => ({
        key: `open-${tab[0]}-${tab[1]}`,
        label: `${stringLabels[tab[0]]}${tab[1]}`,
        value: `${tab[0]}:${tab[1]}`,
      })),
      ...(noteAlternates?.blockedTabs || []).map((tab) => ({
        key: `blocked-${tab[0]}-${tab[1]}`,
        label: `${stringLabels[tab[0]]}${tab[1]} blocked`,
        value: `${tab[0]}:${tab[1]}`,
      })),
    ],
    [noteAlternates]
  );

  const renderToolbarPanel = (inlineMobile: boolean) => (
    <div
      ref={toolbarRef}
      data-gte-floating-ui="true"
      className={
        inlineMobile
          ? "h-full min-h-0 w-full min-w-0 overflow-y-auto rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-lg"
          : "fixed bottom-5 left-1/2 z-[9998] w-[min(980px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
      }
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-700">Toolbar</span>
        <button
          type="button"
          onClick={() => setToolbarOpen(false)}
          className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          x
        </button>
      </div>
      <div className={mobileViewport ? "flex items-start gap-2 overflow-x-auto pb-1" : "flex flex-wrap items-start gap-2"}>
        <div className={`${mobileViewport ? "shrink-0" : "min-w-0 flex-1"} rounded-md border border-slate-200 bg-white p-1.5`}>
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            Notes & chords
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => {
                void handleMakeChord();
              }}
              disabled={chordizeCandidateCount < 2 || selectionActionsLocked}
              title={
                selectionActionsLocked
                  ? "Disabled while notes/chords are selected in multiple tracks"
                  : "Make Chord - Shortcut: C"
              }
              className="group relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">C</span>
              <img
                src={STREAMLINE_TOOLBAR_ICONS.chordize}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5 brightness-0 invert"
              />
              <span className="text-[9px] leading-none">Make Chord</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeChordIds.length) {
                  const chordIds = [...activeChordIds];
                  void runMutation(async () => {
                    const latestSnapshot = await disbandChordIds(chordIds);
                    return latestSnapshot ? { snapshot: latestSnapshot } : {};
                  }, {
                    localApply: (draft) => {
                      chordIds.forEach((chordId) => disbandChordInSnapshot(draft, chordId));
                    },
                  });
                  setSelectedChordIds([]);
                }
              }}
              disabled={activeChordIds.length === 0 || selectionActionsLocked}
              title={
                selectionActionsLocked
                  ? "Disabled while notes/chords are selected in multiple tracks"
                  : "Disband - Shortcut: L"
              }
              className="group relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">L</span>
              <img
                src={STREAMLINE_TOOLBAR_ICONS.disband}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5"
              />
              <span className="text-[9px] leading-none">Disband</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void handleAssignOptimals();
              }}
              disabled={selectedNoteIds.length === 0 || selectionActionsLocked}
              title={
                selectionActionsLocked
                  ? "Disabled while notes/chords are selected in multiple tracks"
                  : "Optimize - Shortcut: O"
              }
              className="group relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">O</span>
              <img
                src={STREAMLINE_TOOLBAR_ICONS.optimize}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5"
              />
              <span className="text-[9px] leading-none">Optimize</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void handleJoinSelectedNotes();
              }}
              disabled={selectedNoteIds.length < 2 || selectionActionsLocked}
              title={
                selectionActionsLocked
                  ? "Disabled while notes/chords are selected in multiple tracks"
                  : "Join - Shortcut: J"
              }
              className="group relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">J</span>
              <img
                src={STREAMLINE_TOOLBAR_ICONS.join}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5"
              />
              <span className="text-[9px] leading-none">Join</span>
            </button>
            <div className="group relative flex w-[106px] flex-col gap-1">
              <select
                data-scale-mode-select="true"
                value={scaleToolMode}
                onChange={(event) => {
                  const nextMode = event.target.value;
                  if (!isScaleToolMode(nextMode)) return;
                  setScaleToolMode(nextMode);
                  if (scaleToolActive) {
                    applyScalePreview(scaleFactor, { mode: nextMode, syncInput: false });
                  }
                }}
                className="h-5 rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-700"
                title="Scale mode - Shortcut: H"
              >
                <option value="length">Length scaling</option>
                <option value="start">Start-time scaling</option>
                <option value="both">Start + length</option>
              </select>
              <button
                type="button"
                onClick={toggleScaleTool}
                disabled={!scaleToolActive && selectedNoteIds.length + selectedChordIds.length === 0}
                title="Scale - Shortcut: S"
                className={`relative flex h-[27px] w-full items-center justify-center gap-1 rounded-md text-[9px] font-semibold ${
                  scaleToolActive
                    ? "bg-amber-500 text-white"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-100"
                } disabled:cursor-not-allowed disabled:text-slate-400`}
              >
                <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">S</span>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-3.5 w-3.5 ${scaleToolActive ? "fill-white" : "fill-current"}`}
                  aria-hidden="true"
                >
                  <path d="M3 10h18v4H3z" />
                  <path d="M7 6l-4 6 4 6z" />
                  <path d="M17 6l4 6-4 6z" />
                </svg>
                <span className="leading-none">Scale</span>
              </button>
            </div>
            <button
              type="button"
              onClick={toggleSliceTool}
              title="Slice - Shortcut: Shift+S"
              className={`group relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md ${
                sliceToolActive
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">Shift+S</span>
              <img
                src={STREAMLINE_TOOLBAR_ICONS.slice}
                alt=""
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${sliceToolActive ? "brightness-0 invert" : ""}`}
              />
              <span className="text-[9px] leading-none">Slice</span>
            </button>
          </div>
        </div>
        <div className={`${mobileViewport ? "shrink-0" : ""} rounded-md border border-slate-200 bg-white p-1.5`}>
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            Cut segments
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm(
                  "Generate cut-segments from all notes? This will replace the current cut segments."
                );
                if (!ok) return;
                handleGenerateCuts();
              }}
              title="Generate cuts"
              className="group relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">No shortcut</span>
              <img
                src={STREAMLINE_TOOLBAR_ICONS.generate}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5"
              />
              <span className="text-[9px] leading-none">Generate</span>
            </button>
            <button
              type="button"
              onClick={handleMergeRedundantCutRegions}
              disabled={!hasRedundantCutRegions}
              title="Merge adjacent cut regions with the same coord"
              className="group relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">No shortcut</span>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M4 8h10v3H4z" />
                <path d="M4 13h10v3H4z" />
                <path d="M16 6l4 6-4 6v-4h-4v-4h4z" />
              </svg>
              <span className="text-[9px] leading-none">Clean</span>
            </button>
            <button
              type="button"
              onClick={toggleCutTool}
              title="Cut tool - Shortcut: K"
              className={`group relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md ${
                cutToolActive
                  ? "bg-sky-600 text-white"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">K</span>
              <img
                src={STREAMLINE_TOOLBAR_ICONS.cut}
                alt=""
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${cutToolActive ? "brightness-0 invert" : ""}`}
              />
              <span className="text-[9px] leading-none">Cut</span>
            </button>
            <button
              type="button"
              onClick={handleMergeCutBoundary}
              disabled={selectedCutBoundaryIndex === null}
              title="Merge selected boundary"
              className="group relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <span className="pointer-events-none absolute -top-6 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">No shortcut</span>
              <img
                src={STREAMLINE_TOOLBAR_ICONS.merge}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5"
              />
              <span className="text-[9px] leading-none">Merge</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={workspaceClass}
      onMouseDownCapture={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-gte-floating-ui='true']")) return;
        onFocusWorkspace?.();
      }}
      onTouchStartCapture={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-gte-floating-ui='true']")) return;
        onFocusWorkspace?.();
      }}
    >
      {toolbarOpen && showToolbarUi && !mobileViewport && renderToolbarPanel(false)}
      {scaleToolActive && scaleHudPosition && (
        <div
          ref={scaleHudRef}
          data-scale-hud="true"
          className="fixed z-[10000] rounded-md border border-amber-300 bg-white/95 px-2 py-1 shadow-lg backdrop-blur"
          style={{ left: scaleHudPosition.x + 12, top: scaleHudPosition.y + 12 }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-700">
            {scaleToolMode === "length"
              ? "Length scaling"
              : scaleToolMode === "start"
              ? "Start-time scaling"
              : "Start + length"}
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="text-[10px] text-slate-600">x</span>
            <input
              type="text"
              value={scaleFactorInput}
              onChange={(event) => handleScaleFactorInputChange(event.target.value)}
              onBlur={() => setScaleFactorInput(formatScaleFactor(scaleFactor))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitScaleTool();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  deactivateScaleTool();
                }
              }}
              className="w-16 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-700"
            />
          </div>
          <div className="mt-0.5 text-[9px] text-slate-500">Enter or click to apply</div>
        </div>
      )}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[9999] w-36 rounded-md border border-slate-200 bg-white/95 py-1 text-xs shadow-lg backdrop-blur"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === "bar" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  handleCopySelectedBars();
                  setContextMenu(null);
                }}
                disabled={selectedBarIndices.length === 0}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
              >
                Copy bars
              </button>
              <button
                type="button"
                onClick={() => {
                  handlePasteSelectedBars(contextMenu.insertIndex);
                  setContextMenu(null);
                }}
                disabled={!barClipboardAvailable}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
              >
                Paste bars
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteSelectedBars();
                  setContextMenu(null);
                }}
                disabled={selectedBarIndices.length === 0}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50 disabled:text-slate-400"
              >
                Delete bars
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  void handleCopySelection();
                  setContextMenu(null);
                }}
                disabled={selectedNoteIds.length + selectedChordIds.length === 0}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => {
                  void handlePaste(contextMenu.targetFrame);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
              >
                Paste
              </button>
            </>
          )}
        </div>
      )}
      {showPlaybackUi && (
        <div
          data-gte-floating-ui="true"
          className={`fixed left-1/2 z-[9997] -translate-x-1/2 px-2 pointer-events-none ${
            mobileViewport ? "bottom-3 w-[min(calc(100vw-1.25rem),28rem)]" : "bottom-16 w-[min(calc(100vw-2rem),64rem)]"
          }`}
        >
          <div className="relative flex flex-col items-center gap-3 md:min-h-[3.5rem] md:justify-center">
            {!mobileViewport && (
              <button
                type="button"
                onClick={() => setToolbarOpen((prev) => !prev)}
                aria-pressed={toolbarOpen}
                title={toolbarOpen ? "Hide toolbar (T)" : "Show toolbar (T)"}
                className={`pointer-events-auto flex h-12 items-center justify-center rounded-full border px-5 text-sm font-semibold shadow-md backdrop-blur transition ${
                  mobileViewport ? "" : "md:absolute md:left-0"
                } ${
                  toolbarOpen
                    ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-700"
                    : "border-sky-300 bg-sky-100/95 text-sky-900 hover:bg-sky-50"
                }`}
              >
                Toolbar (T)
              </button>
            )}
            {mobileViewport ? (
              <div
                data-gte-floating-ui="true"
                className="pointer-events-auto flex w-full items-center justify-between gap-1 rounded-2xl border border-slate-200 bg-white/96 px-2 py-2 text-slate-700 shadow-lg backdrop-blur"
              >
                <button
                  type="button"
                  onClick={skipToStart}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
                  title="Go to start"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <rect x="4" y="5" width="2" height="14" />
                    <polygon points="18,5 8,12 18,19" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={skipBackwardBar}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
                  title="Previous bar"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <polygon points="17,5 7,12 17,19" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    togglePlayback();
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700"
                  title={effectiveIsPlaying ? "Pause" : "Play"}
                >
                  {effectiveIsPlaying ? (
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
                  onClick={skipForwardBar}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
                  title="Next bar"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <polygon points="7,5 17,12 7,19" />
                  </svg>
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current text-slate-500" aria-hidden="true">
                    <path d="M4 10v4h4l5 4V6L8 10H4z" />
                    <path d="M16 8a4 4 0 0 1 0 8v-2a2 2 0 0 0 0-4V8z" />
                  </svg>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={effectivePlaybackVolume}
                    onChange={(event) => setEffectivePlaybackVolume(Number(event.target.value))}
                    className="w-full min-w-0 accent-slate-700"
                    title="Volume"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEffectivePracticeLoopEnabled(!effectivePracticeLoopEnabled)}
                  disabled={!effectivePracticeLoopRange}
                  aria-pressed={effectivePracticeLoopEnabled}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                    effectivePracticeLoopEnabled ? "bg-emerald-100 text-emerald-800" : "hover:bg-slate-100"
                  }`}
                  title="Loop selected bars"
                >
                  L
                </button>
                <button
                  type="button"
                  onClick={() => setEffectiveMetronomeEnabled(!effectiveMetronomeEnabled)}
                  aria-pressed={effectiveMetronomeEnabled}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
                    effectiveMetronomeEnabled ? "bg-sky-100 text-sky-800" : "hover:bg-slate-100"
                  }`}
                  title="Metronome"
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => setEffectiveCountInEnabled(!effectiveCountInEnabled)}
                  aria-pressed={effectiveCountInEnabled}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
                    effectiveCountInEnabled ? "bg-amber-100 text-amber-800" : "hover:bg-slate-100"
                  }`}
                  title="One-bar count-in"
                >
                  1
                </button>
                <button
                  type="button"
                  onClick={() => setEffectiveSpeedTrainerEnabled(!effectiveSpeedTrainerEnabled)}
                  disabled={!effectivePracticeLoopEnabled}
                  aria-pressed={effectiveSpeedTrainerEnabled}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                    effectiveSpeedTrainerEnabled ? "bg-violet-100 text-violet-800" : "hover:bg-slate-100"
                  }`}
                  title="Speed trainer"
                >
                  T
                </button>
                <select
                  value={effectivePlaybackSpeed}
                  onChange={(event) => setEffectivePlaybackSpeed(Number(event.target.value))}
                  className="h-9 rounded-full border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                  title="Playback speed"
                >
                  {effectivePlaybackSpeedOptions.map((speed) => (
                    <option key={speed} value={speed}>
                      {Math.round(speed * 100)}%
                    </option>
                  ))}
                </select>
                {effectiveSpeedTrainerEnabled && (
                  <>
                    <select
                      value={effectiveSpeedTrainerTarget}
                      onChange={(event) => setEffectiveSpeedTrainerTarget(Number(event.target.value))}
                      className="h-9 rounded-full border border-violet-200 bg-white px-2 text-xs font-semibold text-violet-800"
                      title="Speed trainer target"
                    >
                      {SPEED_TRAINER_TARGET_OPTIONS.map((speed) => (
                        <option key={speed} value={speed}>
                          to {Math.round(speed * 100)}%
                        </option>
                      ))}
                    </select>
                    <select
                      value={effectiveSpeedTrainerStep}
                      onChange={(event) => setEffectiveSpeedTrainerStep(Number(event.target.value))}
                      className="h-9 rounded-full border border-violet-200 bg-white px-2 text-xs font-semibold text-violet-800"
                      title="Speed trainer step"
                    >
                      {SPEED_TRAINER_STEP_OPTIONS.map((step) => (
                        <option key={step} value={step}>
                          +{Math.round(step * 100)}%
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            ) : (
              <div
                data-gte-floating-ui="true"
                className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 py-1.5 text-slate-700 shadow-sm backdrop-blur"
              >
                <button
                  type="button"
                  onClick={requestUndo}
                  disabled={effectiveUndoCount === 0 || busy}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Undo (Ctrl/Cmd+Z)"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <path d="M7 7H3v4h2V9h7a5 5 0 1 1 0 10h-4v2h4a7 7 0 1 0 0-14H7z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={requestRedo}
                  disabled={effectiveRedoCount === 0 || busy}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Redo (Ctrl/Cmd+Shift+Z)"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <path d="M17 7h4v4h-2V9h-7a5 5 0 1 0 0 10h4v2h-4a7 7 0 1 1 0-14h5z" />
                  </svg>
                </button>
                <span className="mx-1 whitespace-nowrap text-[10px] text-slate-500">
                  {!allowBackend
                    ? hasUnsavedChanges
                      ? "Saving local draft..."
                      : "Local draft saved"
                    : isAutosaving
                      ? "Saving..."
                      : hasUnsavedChanges
                        ? "Unsaved changes"
                        : lastSavedAt
                          ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : "Saved"}
                </span>
                <button
                  type="button"
                  onClick={skipToStart}
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
                  onClick={skipBackwardBar}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100"
                  title="Previous bar"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <polygon points="17,5 7,12 17,19" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    togglePlayback();
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700"
                  title={effectiveIsPlaying ? "Pause" : "Play"}
                >
                  {effectiveIsPlaying ? (
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
                  onClick={skipForwardBar}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100"
                  title="Next bar"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                    <polygon points="7,5 17,12 7,19" />
                  </svg>
                </button>
                <div className="flex items-center gap-1 px-1">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-slate-500" aria-hidden="true">
                    <path d="M4 10v4h4l5 4V6L8 10H4z" />
                    <path d="M16 8a4 4 0 0 1 0 8v-2a2 2 0 0 0 0-4V8z" />
                  </svg>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={effectivePlaybackVolume}
                    onChange={(event) => setEffectivePlaybackVolume(Number(event.target.value))}
                    className="w-20 accent-slate-700"
                    title="Volume"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEffectivePracticeLoopEnabled(!effectivePracticeLoopEnabled)}
                  disabled={!effectivePracticeLoopRange}
                  aria-pressed={effectivePracticeLoopEnabled}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                    effectivePracticeLoopEnabled ? "bg-emerald-100 text-emerald-800" : "hover:bg-slate-100"
                  }`}
                  title="Loop selected bars"
                >
                  Loop
                </button>
                <button
                  type="button"
                  onClick={() => setEffectiveMetronomeEnabled(!effectiveMetronomeEnabled)}
                  aria-pressed={effectiveMetronomeEnabled}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                    effectiveMetronomeEnabled ? "bg-sky-100 text-sky-800" : "hover:bg-slate-100"
                  }`}
                  title="Metronome"
                >
                  Met
                </button>
                <button
                  type="button"
                  onClick={() => setEffectiveCountInEnabled(!effectiveCountInEnabled)}
                  aria-pressed={effectiveCountInEnabled}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                    effectiveCountInEnabled ? "bg-amber-100 text-amber-800" : "hover:bg-slate-100"
                  }`}
                  title="One-bar count-in"
                >
                  Count
                </button>
                <button
                  type="button"
                  onClick={() => setEffectiveSpeedTrainerEnabled(!effectiveSpeedTrainerEnabled)}
                  disabled={!effectivePracticeLoopEnabled}
                  aria-pressed={effectiveSpeedTrainerEnabled}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                    effectiveSpeedTrainerEnabled ? "bg-violet-100 text-violet-800" : "hover:bg-slate-100"
                  }`}
                  title="Speed trainer"
                >
                  Train
                </button>
                <select
                  value={effectivePlaybackSpeed}
                  onChange={(event) => setEffectivePlaybackSpeed(Number(event.target.value))}
                  className="h-8 rounded-full border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                  title="Playback speed"
                >
                  {effectivePlaybackSpeedOptions.map((speed) => (
                    <option key={speed} value={speed}>
                      {Math.round(speed * 100)}%
                    </option>
                  ))}
                </select>
                {effectiveSpeedTrainerEnabled && (
                  <>
                    <select
                      value={effectiveSpeedTrainerTarget}
                      onChange={(event) => setEffectiveSpeedTrainerTarget(Number(event.target.value))}
                      className="h-8 rounded-full border border-violet-200 bg-white px-2 text-xs font-semibold text-violet-800"
                      title="Speed trainer target"
                    >
                      {SPEED_TRAINER_TARGET_OPTIONS.map((speed) => (
                        <option key={speed} value={speed}>
                          to {Math.round(speed * 100)}%
                        </option>
                      ))}
                    </select>
                    <select
                      value={effectiveSpeedTrainerStep}
                      onChange={(event) => setEffectiveSpeedTrainerStep(Number(event.target.value))}
                      className="h-8 rounded-full border border-violet-200 bg-white px-2 text-xs font-semibold text-violet-800"
                      title="Speed trainer step"
                    >
                      {SPEED_TRAINER_STEP_OPTIONS.map((step) => (
                        <option key={step} value={step}>
                          +{Math.round(step * 100)}%
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className={`flex flex-wrap items-center ${embedded ? "gap-2" : "gap-3"}`}>
        {!embedded && (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>BPM</span>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="decimal"
            value={bpmInput}
            onChange={(e) => setBpmInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const next = bpmToSecondsPerBar(bpmInput, timeSignature);
              const normalizedBpm = normalizeBpm(bpmInput);
              if (next && normalizedBpm) {
                setSecondsPerBar(next);
                setBpmInput(formatBpm(normalizedBpm));
                void runMutation(() => gteApi.setSecondsPerBar(editorId, next), {
                  localApply: (draft) => {
                    setSecondsPerBarInSnapshot(draft, next);
                  },
                });
              } else {
                setBpmInput(formatBpm(secondsPerBarToBpm(secondsPerBar, timeSignature)));
              }
            }}
            onBlur={() => {
              const next = bpmToSecondsPerBar(bpmInput, timeSignature);
              const normalizedBpm = normalizeBpm(bpmInput);
              if (next && normalizedBpm) {
                setSecondsPerBar(next);
                setBpmInput(formatBpm(normalizedBpm));
                void runMutation(() => gteApi.setSecondsPerBar(editorId, next), {
                  localApply: (draft) => {
                    setSecondsPerBarInSnapshot(draft, next);
                  },
                });
              } else {
                setBpmInput(formatBpm(secondsPerBarToBpm(secondsPerBar, timeSignature)));
              }
            }}
            className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
          />
        </div>
        )}
        {!embedded && (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>Beats/bar</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={64}
              step={1}
              inputMode="numeric"
              value={timeSignatureInput}
              onChange={(e) => setTimeSignatureInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                commitTimeSignatureValue(timeSignatureInput);
              }}
              onBlur={() => {
                commitTimeSignatureValue(timeSignatureInput);
              }}
              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
            />
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  commitTimeSignatureValue(timeSignature + 1);
                }}
                className="flex h-3.5 w-4 items-center justify-center rounded border border-slate-200 bg-white text-[8px] leading-none text-slate-600 hover:bg-slate-50"
                title="Increase beats per bar"
                aria-label="Increase beats per bar"
                disabled={timeSignature >= 64}
              >
                &#9650;
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  commitTimeSignatureValue(timeSignature - 1);
                }}
                className="flex h-3.5 w-4 items-center justify-center rounded border border-slate-200 bg-white text-[8px] leading-none text-slate-600 hover:bg-slate-50"
                title="Decrease beats per bar"
                aria-label="Decrease beats per bar"
                disabled={timeSignature <= 1}
              >
                &#9660;
              </button>
            </div>
          </div>
        </div>
        )}
        {!embedded && (
          <button
            type="button"
            onClick={() => setSnapToGridEnabled((prev) => !prev)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
              snapToGridEnabled
                ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                : "border-slate-200 bg-white text-slate-600"
            }`}
            title="Snap new notes to the beat grid"
          >
            Snap to grid: {snapToGridEnabled ? "On" : "Off"}
          </button>
        )}
        {!embedded && (
          <button
            type="button"
            disabled
            className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500 opacity-80"
            title="Generate tabs is disabled for this update"
          >
            Generate tabs (Disabled)
          </button>
        )}
        {!embedded && (
          <button
            type="button"
            onClick={() => setTabPreviewOpen((prev) => !prev)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              tabPreviewOpen
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tabPreviewOpen ? "Hide tablature" : "View tablature"}
          </button>
        )}
        {!embedded && <div className="text-xs text-slate-600">Scale: {scale}px/frame (auto)</div>}
        {!embedded && (
          <div className="text-xs text-slate-500">
              FPS: {fps} - Beats/bar: {timeSignature}
            </div>
        )}
      </div>

      {tabPreviewOpen && !embedded && (
        <div className="card-outline stack">
          <div className="page-header">
            <h2 className="section-title" style={{ margin: 0, fontSize: "1rem" }}>
              Tablature view
            </h2>
            <button
              type="button"
              onClick={() => setTabPreviewOpen(false)}
              className="button-secondary button-small"
            >
              Close
            </button>
          </div>
          <TabViewer tabText={tabPreviewText} songTitle={snapshot.name || "note2tabs"} />
        </div>
      )}

      {error && isActive && (
        <div className="fixed bottom-4 right-4 z-[10050] max-w-[min(24rem,calc(100vw-1.5rem))] rounded-lg border border-rose-300 bg-rose-50/95 px-3 py-2 text-sm text-rose-800 shadow-lg backdrop-blur">
          {error}
        </div>
      )}

      <div
        className={`min-w-0 ${
          isMobileEditMode
            ? "flex h-full min-h-0 flex-col"
            : embedded
            ? "space-y-2"
            : "space-y-4"
        }`}
      >
        <div
          className={`flex min-w-0 ${
            isMobileEditMode ? "min-h-0 flex-1 items-center" : "items-start"
          } ${compactEmbeddedMobile ? "gap-1.5" : embedded ? "gap-2" : "gap-4"}`}
        >
          <div
            className={`flex flex-col gap-0 ${
              isMobileEditMode ? "pt-0 text-[10px]" : compactEmbeddedMobile ? "pt-4 text-[10px]" : "pt-5 text-xs"
            } text-slate-600`}
          >
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <div
                key={`labels-${rowIdx}`}
                className="flex flex-col gap-0"
                style={{ height: rowBlockHeight, marginBottom: rowIdx < rows - 1 ? ROW_GAP : 0 }}
              >
                {stringLabels.map((label, stringIndex) => (
                  <div
                    key={`label-${rowIdx}-${stringIndex}`}
                    className="flex items-center justify-end pr-2"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className={`min-w-0 flex-1 ${isMobileEditMode ? "min-h-0 overflow-hidden" : "overflow-y-visible"}`}>
            <div
              ref={timelineOuterRef}
              className={`min-w-0 overflow-y-hidden ${
                embedded && !mobileViewport ? "overflow-x-hidden" : "overflow-x-auto"
              } ${embedded && !mobileViewport ? "hide-scrollbar" : ""}`}
              onScroll={handleTimelineOuterScroll}
            >
              <div className="relative pt-5" style={{ width: timelineChromeWidth }}>
                {framesPerMeasure > 0 &&
                  Array.from({ length: barCount }).map((_, barIndex) => {
                    const left = barIndex * framesPerMeasure * scale;
                    const width = Math.max(1, framesPerMeasure * scale);
                    const selected = selectedBarIndexSet.has(barIndex);
                    return (
                      <button
                        key={`bar-select-${barIndex}`}
                        type="button"
                        data-bar-select="true"
                        data-bar-select-editor={editorId}
                        data-bar-index={barIndex}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          if (touchHoldTriggeredRef.current) {
                            touchHoldTriggeredRef.current = false;
                            return;
                          }
                          handleBarSelection(barIndex, event);
                        }}
                        onContextMenu={(event) => handleBarContextMenu(barIndex, event)}
                        draggable={selected && !mobileViewport}
                        onDragStart={(event) => handleSelectedBarDragStart(barIndex, event)}
                        onDragEnd={handleSelectedBarDragEnd}
                        className={`absolute top-0 z-20 flex items-center px-2 text-[10px] ${
                          selected
                            ? "bg-slate-200/90 text-slate-800"
                            : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-800"
                        }`}
                        style={{ left, width, height: 20 }}
                        title={`Select Bar ${barIndex + 1}`}
                        aria-label={`Select Bar ${barIndex + 1}`}
                      >
                        <span className="truncate">Bar {barIndex + 1}</span>
                      </button>
                    );
                  })}
                {framesPerMeasure > 0 &&
                  Array.from({ length: barCount + 1 }).map((_, insertIndex) => {
                    const left = Math.max(
                      0,
                      Math.min(
                        viewportTimelineWidth - 6,
                        insertIndex === barCount ? timelineWidth - 3 : insertIndex * framesPerMeasure * scale - 3
                      )
                    );
                    const isActiveDrop =
                      Boolean(activeBarDrag && onRequestBarDrop) && barDropIndex === insertIndex;
                    const dragEnabled = Boolean(activeBarDrag && onRequestBarDrop);
                    return (
                      <button
                        key={`bar-drop-${insertIndex}`}
                        type="button"
                        aria-hidden={!dragEnabled}
                        tabIndex={-1}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          if (!dragEnabled || !mobileViewport) return;
                          setBarDropIndex(insertIndex);
                          void onRequestBarDrop?.(insertIndex);
                        }}
                        onDragOver={(event) => handleBarDropTargetDragOver(insertIndex, event)}
                        onDragEnter={(event) => handleBarDropTargetDragOver(insertIndex, event)}
                        onDrop={(event) => handleBarDropTargetDrop(insertIndex, event)}
                        onDragLeave={() => {
                          if (barDropIndex === insertIndex) {
                            setBarDropIndex(null);
                          }
                        }}
                        className={`absolute top-0 z-30 flex w-5 -translate-x-1/2 items-center justify-center rounded-full transition-all ${
                          dragEnabled ? "pointer-events-auto" : "pointer-events-none"
                        } ${isActiveDrop ? "bg-sky-500" : "bg-transparent"}`}
                        style={{
                          left,
                          height: 20 + timelineHeight,
                          opacity: dragEnabled ? (isActiveDrop ? 0.95 : mobileViewport ? 0.32 : 0.5) : 0,
                        }}
                        title={dragEnabled ? `Insert bars at ${insertIndex + 1}` : undefined}
                      />
                    );
                  })}
                <button
                  type="button"
                  onClick={handleAddBar}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                    className="absolute z-40 flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white/95 text-base font-semibold text-slate-600 shadow-sm hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900"
                    style={{
                    left: Math.max(0, Math.min(timelineChromeWidth - 28, timelineWidth + 10)),
                      top: 20 + Math.max(0, Math.round(rowHeight / 2) - 14),
                    }}
                  title="Add bar to end"
                  aria-label="Add bar to end"
                >
                  +
                </button>
                <div
                  ref={timelineRef}
                  data-track-reorder-block="true"
                  className={`relative rounded-xl border border-slate-200 bg-white ${
                    cutToolActive || sliceToolActive
                      ? "cursor-crosshair"
                    : scaleToolActive
                    ? "cursor-ew-resize"
                    : ""
                }`}
                style={{ height: timelineHeight }}
                onMouseDown={handleTimelineMouseDown}
                onContextMenu={handleTimelineContextMenu}
                onMouseMove={(event) => {
                  if (!sliceToolActive) return;
                  const target = getPointerFrame(event.clientX, event.clientY);
                  if (target) setSliceCursor(target);
                }}
                onMouseLeave={() => {
                  if (sliceToolActive) setSliceCursor(null);
                }}
              >
                {selectedBarIndices.map((barIndex) => {
                  if (framesPerMeasure <= 0 || barIndex < 0 || barIndex >= barCount) return null;
                  const left = barIndex * framesPerMeasure * scale;
                  const width = Math.max(1, framesPerMeasure * scale);
                  return (
                    <div
                      key={`bar-highlight-${barIndex}`}
                      className="absolute top-0 pointer-events-none bg-slate-300/28"
                      style={{ left, width, height: rowHeight }}
                    />
                  );
                })}
                {selectedBarIndices.map((barIndex) => {
                  if (framesPerMeasure <= 0 || barIndex < 0 || barIndex >= barCount) return null;
                  const left = barIndex * framesPerMeasure * scale;
                  const width = Math.max(1, framesPerMeasure * scale);
                  return (
                    <button
                      key={`bar-surface-${barIndex}`}
                      type="button"
                      data-bar-select="true"
                      data-bar-select-editor={editorId}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                      }}
                      onContextMenu={(event) => handleBarContextMenu(barIndex, event)}
                      draggable
                      onDragStart={(event) => handleSelectedBarDragStart(barIndex, event)}
                      onDragEnd={handleSelectedBarDragEnd}
                      className="absolute top-0 z-20 cursor-grab bg-transparent"
                      style={{ left, width, height: rowHeight }}
                      title={`Selected Bar ${barIndex + 1}`}
                      aria-label={`Selected Bar ${barIndex + 1}`}
                    />
                  );
                })}
                {Array.from({ length: rows }).map((_, rowIdx) => {
                  const rowTop = rowIdx * rowStride;
                  const rowBarCount = getRowBarCount(rowIdx);
                  const rowWidth = Math.max(1, rowBarCount) * framesPerMeasure * scale;
                  const beatsPerBar = Math.max(1, Math.round(timeSignature));
                  const beatWidth = framesPerMeasure > 0 ? (framesPerMeasure / beatsPerBar) * scale : 0;
                  return (
                    <div key={`row-${rowIdx}`} className="absolute left-0" style={{ top: rowTop, width: rowWidth }}>
                      {[...Array(6)].map((_, idx) => (
                        <div
                          key={`row-${rowIdx}-line-${idx}`}
                          className="absolute left-0 border-t border-slate-200"
                          style={{ top: idx * ROW_HEIGHT, width: rowWidth }}
                        />
                      ))}
                      {framesPerMeasure > 0 &&
                        rowBarCount > 0 &&
                        beatsPerBar > 1 &&
                        [...Array(rowBarCount * beatsPerBar - 1)].map((_, beatIdx) => {
                          const beat = beatIdx + 1;
                          if (beat % beatsPerBar === 0) return null;
                          const left = beat * beatWidth;
                          return (
                            <div
                              key={`row-${rowIdx}-beat-${beat}`}
                              className={`absolute top-0 h-full w-px pointer-events-none ${
                                snapToGridEnabled ? "bg-emerald-300/60" : "bg-slate-200/70"
                              }`}
                              style={{ left, height: rowHeight }}
                            />
                          );
                        })}
                      {framesPerMeasure > 0 &&
                        [...Array(rowBarCount + 1)].map((_, edgeIdx) => {
                          const rawDividerX = edgeIdx * framesPerMeasure * scale;
                          const dividerX =
                            edgeIdx === rowBarCount ? Math.max(0, rowWidth - 2) : rawDividerX;
                          const isOuterEdge = edgeIdx === 0 || edgeIdx === rowBarCount;
                          return (
                            <div
                              key={`row-${rowIdx}-bar-edge-${edgeIdx}`}
                              className={`absolute top-0 w-[2px] pointer-events-none ${
                                isOuterEdge ? "bg-slate-300/90" : "bg-slate-400"
                              }`}
                              style={{ left: dividerX, height: rowHeight }}
                            />
                          );
                        })}
                      <div
                        className="absolute left-0 border-b border-slate-200"
                        style={{ top: rowHeight, width: rowWidth }}
                      />
                    </div>
                  );
                })}

                {keyboardCursorMarker && (
                  <div
                    className="absolute z-20 pointer-events-none"
                    style={{
                      left: keyboardCursorMarker.left,
                      top: keyboardCursorMarker.top,
                      width: keyboardCursorMarker.width,
                      height: keyboardCursorMarker.height,
                    }}
                  >
                    <div className="h-full w-full rounded-sm border border-slate-400/75 bg-slate-300/45" />
                  </div>
                )}

                {sliceToolActive && sliceCursor && (() => {
                  const rowStart = sliceCursor.rowIndex * rowFrames;
                  const left = (sliceCursor.time - rowStart) * scale;
                  const top = sliceCursor.rowIndex * rowStride;
                  return (
                    <div
                      className="absolute pointer-events-none"
                      style={{ left, top, height: rowHeight, width: 2, zIndex: 20 }}
                    >
                      <div className="h-full w-[2px] rounded-full bg-indigo-500/70" />
                    </div>
                  );
                })()}

                {(() => {
                  if (framesPerMeasure <= 0) return null;
                  const safeFrame = clamp(Math.round(effectivePlayheadFrame), 0, timelineEnd);
                  const rowIndex = rowFrames > 0 ? clamp(Math.floor(safeFrame / rowFrames), 0, rows - 1) : 0;
                  const rowBarCount = getRowBarCount(rowIndex);
                  const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
                  const rowStart = rowIndex * rowFrames;
                  const left = (safeFrame - rowStart) * scale;
                  const top = rowIndex * rowStride;
                  const height = rowBlockHeight;
                  return (
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (effectiveIsPlaying) togglePlayback();
                        setPlayheadDragging(true);
                        const target = getPointerFrame(event.clientX, event.clientY);
                        if (target) setEffectivePlayheadFrame(target.time);
                      }}
                      className={`absolute z-30 cursor-col-resize`}
                      style={{ left, top, height, width: 2, transform: "translateX(-1px)" }}
                    >
                      <span
                        className={`absolute left-0 top-0 h-full w-[2px] rounded-full ${
                          effectiveIsPlaying ? "bg-rose-500" : "bg-rose-400/70"
                        }`}
                      />
                    </button>
                  );
                })()}

                {showPlayingCoordinates && cutBoundaries.map((boundary) => {
                  if (framesPerMeasure <= 0) return null;
                  const rowIndex = Math.floor(boundary.time / rowFrames);
                  if (rowIndex < 0 || rowIndex >= rows) return null;
                  const rowBarCount = getRowBarCount(rowIndex);
                  const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
                  const rowStart = rowIndex * rowFrames;
                  const boundaryTime = clamp(boundary.time, rowStart, rowStart + availableFrames);
                  const left = (boundaryTime - rowStart) * scale;
                  const segmentTop = rowIndex * rowStride + rowHeight + CUT_SEGMENT_OFFSET;
                  const top = segmentTop - CUT_BOUNDARY_OVERHANG;
                  const height = CUT_SEGMENT_HEIGHT + CUT_BOUNDARY_OVERHANG;
                  const selected = selectedCutBoundaryIndex === boundary.index;
                  return (
                    <button
                      key={`cut-boundary-${boundary.index}`}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedCutBoundaryIndex(boundary.index);
                        setSegmentDragIndex(boundary.index);
                        setSelectedNoteIds([]);
                        setSelectedChordIds([]);
                      }}
                      className="absolute cursor-pointer"
                      style={{ left, top, height, width: 10, transform: "translateX(-5px)" }}
                    >
                      <span
                        className={`absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent ${
                          selected ? "border-t-sky-600" : "border-t-sky-300/80"
                        }`}
                      />
                      <span
                        className={`absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 rounded-full ${
                          selected ? "bg-sky-600" : "bg-sky-300/90"
                        }`}
                      />
                    </button>
                  );
                })}

                {showPlayingCoordinates && segmentEdits.map((segment, segIndex) => {
                  if (framesPerMeasure <= 0) return null;
                  const startRow = Math.floor(segment.start / rowFrames);
                  const endRow = Math.floor((Math.max(segment.end - 1, segment.start)) / rowFrames);
                  const pieces = [];
                  for (let rowIdx = startRow; rowIdx <= endRow; rowIdx += 1) {
                    if (rowIdx < 0 || rowIdx >= rows) continue;
                    const rowBarCount = getRowBarCount(rowIdx);
                    const availableFrames = Math.max(1, rowBarCount * framesPerMeasure);
                    const rowStart = rowIdx * rowFrames;
                    const rowEnd = rowStart + availableFrames;
                    const segStart = Math.max(segment.start, rowStart);
                    const segEnd = Math.min(segment.end, rowEnd);
                    if (segEnd <= segStart) continue;
                    const left = (segStart - rowStart) * scale;
                    const width = Math.max(CUT_SEGMENT_MIN_WIDTH, (segEnd - segStart) * scale);
                    const top = rowIdx * rowStride + rowHeight + CUT_SEGMENT_OFFSET;
                    const rowPixelWidth = availableFrames * scale;
                    const cutCoordEditorWidth = 148;
                    const editorAnchorLeft = left + width / 2 - cutCoordEditorWidth / 2;
                    const editorLeft = Math.max(
                      0,
                      Math.min(Math.max(0, rowPixelWidth - cutCoordEditorWidth), editorAnchorLeft)
                    );
                    const editorTop = Math.max(0, top - 42);
                    const stringLabel =
                      segment.stringIndex !== null && stringLabels[segment.stringIndex]
                        ? stringLabels[segment.stringIndex]
                        : "?";
                    const fretLabel = segment.fret !== null ? segment.fret : "?";
                    const isEditing = editingSegmentIndex === segIndex;
                    pieces.push(
                      <div
                        key={`cut-${segIndex}-row-${rowIdx}`}
                        className="absolute rounded-md border border-sky-300 bg-sky-200/60 px-2 py-1 text-[10px] text-slate-700"
                        style={{ top, left, width, height: CUT_SEGMENT_HEIGHT }}
                        title="Playing coordinates"
                        aria-label="Playing coordinates"
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <button
                          type="button"
                          className={`flex h-full w-full items-center justify-center rounded text-[10px] font-semibold text-slate-700 hover:text-slate-900 ${
                            cutToolActive ? "cursor-crosshair" : "cursor-pointer"
                          }`}
                          title="Playing coordinates"
                          aria-label="Playing coordinates"
                          onClick={(event) => {
                            if (cutToolActive) {
                              event.preventDefault();
                              event.stopPropagation();
                              if (!timelineRef.current) return;
                              if (segEnd - segStart <= 1) return;
                              const rect = timelineRef.current.getBoundingClientRect();
                              const clickX = clamp(event.clientX - rect.left, 0, timelineWidth);
                              const relativeX = clamp(clickX - left, 0, width);
                              const ratio = width > 0 ? relativeX / width : 0;
                              const rawTime = segStart + Math.round((segEnd - segStart) * ratio);
                              const cutTime = clamp(rawTime, segStart + 1, segEnd - 1);
                              if (cutTime <= segStart || cutTime >= segEnd) return;
                              void runMutation(() => gteApi.insertCutAt(editorId, cutTime), {
                                localApply: (draft) => {
                                  insertCutAtInSnapshot(draft, cutTime);
                                },
                              });
                              return;
                            }
                            startSegmentEdit(segIndex, segment);
                          }}
                        >
                          {stringLabel}
                          {fretLabel}
                        </button>
                      </div>
                    );
                    if (isEditing) {
                      pieces.push(
                        <div
                          key={`cut-${segIndex}-row-${rowIdx}-editor`}
                          className="absolute z-30 w-[9.25rem] rounded-lg border border-sky-300 bg-white/98 p-1.5 shadow-md"
                          style={{ top: editorTop, left: editorLeft }}
                          data-cut-edit
                          onMouseDown={(event) => {
                            event.stopPropagation();
                          }}
                          onBlur={(event) => {
                            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                            commitSegmentEdit();
                          }}
                        >
                          <div className="grid grid-cols-2 gap-1.5">
                            {(
                              [
                                { field: "stringIndex", label: "String", value: segmentCoordDraft?.stringIndex ?? "", max: 5 },
                                { field: "fret", label: "Fret", value: segmentCoordDraft?.fret ?? "", max: maxFret },
                              ] as const
                            ).map(({ field, label, value, max }) => {
                              const parsedValue = Number(value);
                              const stringDisplay =
                                Number.isInteger(parsedValue) && stringLabels[parsedValue]
                                  ? stringLabels[parsedValue]
                                  : "?";
                              return (
                                <div
                                  key={`seg-${segIndex}-${field}-editor`}
                                  className="flex items-stretch gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-1"
                                >
                                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                                    <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-400">
                                      {label}
                                    </span>
                                    {field === "stringIndex" ? (
                                      <div className="mt-0.5 h-5 text-[11px] font-semibold leading-5 text-slate-700">
                                        {stringDisplay}
                                      </div>
                                    ) : (
                                      <input
                                        type="number"
                                        min={0}
                                        max={max}
                                        inputMode="numeric"
                                        enterKeyHint="done"
                                        className="mt-0.5 h-5 w-full border-0 bg-transparent p-0 text-[11px] font-semibold text-slate-700 outline-none"
                                        value={value}
                                        onChange={(event) =>
                                          setSegmentCoordDraft((prev) =>
                                            prev ? { ...prev, [field]: event.target.value } : prev
                                          )
                                        }
                                        onFocus={(event) => event.currentTarget.select()}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            commitSegmentEdit();
                                          }
                                          if (event.key === "Escape") {
                                            event.preventDefault();
                                            cancelSegmentEdit();
                                          }
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      type="button"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => adjustSegmentCoordinateDraft(field, 1)}
                                      className="flex h-3 w-4 items-center justify-center rounded border border-slate-200 bg-white text-[8px] text-slate-600"
                                      aria-label={`Increase ${label.toLowerCase()}`}
                                    >
                                      &#9650;
                                    </button>
                                    <button
                                      type="button"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => adjustSegmentCoordinateDraft(field, -1)}
                                      className="flex h-3 w-4 items-center justify-center rounded border border-slate-200 bg-white text-[8px] text-slate-600"
                                      aria-label={`Decrease ${label.toLowerCase()}`}
                                    >
                                      &#9660;
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                  }
                  return pieces;
                })}

                {selection && (
                  <div
                    className="absolute border border-blue-400/70 bg-blue-500/10 pointer-events-none"
                    style={{
                      left: Math.min(selection.startX, selection.endX),
                      top: Math.min(selection.startY, selection.endY),
                      width: Math.abs(selection.endX - selection.startX),
                      height: Math.abs(selection.endY - selection.startY),
                    }}
                  />
                )}

                {snapshot.notes.flatMap((note) => {
                  const scalePreview = scaleToolActive ? scalePreviewNotes[note.id] : undefined;
                  const preview =
                    dragging?.type === "note" && dragging.id === note.id ? dragPreview : null;
                  const multiDelta =
                    multiDragDelta !== null && selectedNoteIds.includes(note.id) ? multiDragDelta : null;
                  const displayStart = scalePreview
                    ? scalePreview.startTime
                    : multiDelta !== null
                    ? note.startTime + multiDelta
                    : preview?.startTime ?? note.startTime;
                  const displayString = preview?.stringIndex ?? note.tab[0];
                  const displayLength = scalePreview
                    ? scalePreview.length
                    : resizingNote?.id === note.id && resizePreviewLength !== null
                    ? resizePreviewLength
                    : note.length;
                  const segments = getSpanSegments(displayStart, displayLength);
                  const endTime = displayStart + Math.max(1, Math.round(displayLength));
                  return segments.map((segment, idx) => {
                    const isLast = segment.segEnd >= endTime;
                    return (
                      <button
                        key={`note-${note.id}-seg-${segment.rowIndex}-${idx}`}
                        type="button"
                        onMouseDown={(event) => {
                          if (mobileViewport) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                          }
                          startNoteDrag(
                            note.id,
                            note.tab[0],
                            note.tab[1],
                            note.startTime,
                            note.length,
                            event
                          );
                        }}
                        onTouchStart={(event) => {
                          if (isMobileCanvasMode) return;
                          event.stopPropagation();
                          scheduleTouchHold(event, (pointer) =>
                            startNoteDrag(
                              note.id,
                              note.tab[0],
                              note.tab[1],
                              note.startTime,
                              note.length,
                              pointer
                            )
                          );
                        }}
                        onTouchMove={cancelTouchHoldOnMove}
                        onTouchEnd={() => clearTouchHold()}
                        onTouchCancel={() => clearTouchHold()}
                        onClick={(event) => {
                          if (touchHoldTriggeredRef.current) {
                            touchHoldTriggeredRef.current = false;
                            return;
                          }
                          if (multiDragMovedRef.current) {
                            multiDragMovedRef.current = false;
                            return;
                          }
                          if (singleDragMovedRef.current) {
                            singleDragMovedRef.current = false;
                            return;
                          }
                          if (isMobileCanvasMode) {
                            return;
                          }
                          playNotePreview([note.tab[0], note.tab[1]]);
                          if (mobileViewport) {
                            const previousSelected = selectedNoteIdsRef.current;
                            const alreadySelected = previousSelected.includes(note.id);
                            const nextSelected = alreadySelected
                              ? previousSelected.filter((value) => value !== note.id)
                              : [...previousSelected, note.id];
                            setSelectedNoteIds(nextSelected);
                            if (selectedChordIdsRef.current.length) {
                              setSelectedChordIds([]);
                            }
                            if (nextSelected.length === 1 && nextSelected[0] === note.id) {
                              openNoteMenu(note.id, note.tab[1], note.length, event);
                            } else {
                              setNoteMenuAnchor(null);
                              setNoteMenuNoteId(null);
                              setNoteMenuDraft(null);
                            }
                            return;
                          }
                          if (selectedNoteIds.length > 1) return;
                          openNoteMenu(note.id, note.tab[1], note.length, event);
                        }}
                        className={`absolute rounded-md px-1 text-[11px] font-semibold text-slate-900 ${
                          scaleToolActive ? "cursor-ew-resize" : "cursor-grab"
                        } ${
                          selectedNoteIds.includes(note.id)
                            ? "bg-amber-400"
                            : conflictInfo.noteConflicts.has(note.id)
                            ? "bg-red-400/80"
                            : "bg-emerald-400"
                        } ${
                          editingChordId !== null
                            ? "opacity-30 pointer-events-none"
                            : isMobileCanvasMode
                            ? "pointer-events-none"
                            : ""
                        }`}
                        style={{
                          top: segment.rowIndex * rowStride + displayString * ROW_HEIGHT + (mobileViewport ? 1 : 4),
                          left: segment.inRowStart * scale,
                          width: Math.max(10, segment.length * scale),
                          height: mobileViewport ? ROW_HEIGHT - 2 : ROW_HEIGHT - 8,
                          touchAction: mobileViewport ? "none" : undefined,
                        }}
                      >
                        {idx === 0 ? note.tab[1] : null}
                        {isLast && (
                          <span
                            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedNoteIds([note.id]);
                              setSelectedChordIds([]);
                              setDraftNote(null);
                              setDraftNoteAnchor(null);
                              setResizingChord(null);
                              setResizeChordPreviewLength(null);
                              setResizingNote({
                                id: note.id,
                                startTime: note.startTime,
                                length: note.length,
                              });
                              setResizePreviewLength(note.length);
                            }}
                          />
                        )}
                      </button>
                    );
                  });
                })}

                {snapshot.chords.flatMap((chord) => {
                  const scalePreview = scaleToolActive ? scalePreviewChords[chord.id] : undefined;
                  const preview =
                    dragging?.type === "chord" && dragging.id === chord.id ? dragPreview : null;
                  const multiDelta =
                    multiDragDelta !== null && selectedChordIds.includes(chord.id) ? multiDragDelta : null;
                  const displayStart = scalePreview
                    ? scalePreview.startTime
                    : multiDelta !== null
                    ? chord.startTime + multiDelta
                    : preview?.startTime ?? chord.startTime;
                  const displayLength = scalePreview
                    ? scalePreview.length
                    : resizingChord?.id === chord.id && resizeChordPreviewLength !== null
                    ? resizeChordPreviewLength
                    : chord.length;
                  const segments = getSpanSegments(displayStart, displayLength);
                  const endTime = displayStart + Math.max(1, Math.round(displayLength));
                  return chord.currentTabs.flatMap((tab, idx) =>
                    segments.map((segment, segIdx) => {
                      const isLast = segment.segEnd >= endTime;
                      const isEditingThisChord = editingChordId === chord.id;
                      const isDimmed = editingChordId !== null && !isEditingThisChord;
                      const chordNotePreview =
                        isEditingThisChord && draggingChordNote?.tabIndex === idx
                          ? dragChordNotePreview?.stringIndex
                          : null;
                      const displayString = chordNotePreview ?? tab[0];
                      return (
                        <button
                          key={`chord-${chord.id}-${idx}-seg-${segment.rowIndex}-${segIdx}`}
                          type="button"
                          onMouseDown={(event) => {
                            if (mobileViewport) {
                              event.preventDefault();
                              event.stopPropagation();
                              return;
                            }
                            if (editingChordId !== null) {
                              event.preventDefault();
                              event.stopPropagation();
                              if (editingChordId === chord.id) {
                                chordNoteDragMovedRef.current = false;
                                chordNoteDragStartYRef.current = event.clientY;
                                setDraggingChordNote({
                                  chordId: chord.id,
                                  tabIndex: idx,
                                  stringIndex: tab[0],
                                });
                              }
                              return;
                            }
                            startChordDrag(chord.id, chord.startTime, chord.length, event);
                          }}
                          onTouchStart={(event) => {
                            if (isMobileCanvasMode) return;
                            event.stopPropagation();
                            if (editingChordId !== null) return;
                            scheduleTouchHold(event, (pointer) =>
                              startChordDrag(chord.id, chord.startTime, chord.length, pointer)
                            );
                          }}
                          onTouchMove={cancelTouchHoldOnMove}
                          onTouchEnd={() => clearTouchHold()}
                          onTouchCancel={() => clearTouchHold()}
                          onDoubleClick={(event) => {
                            if (editingChordId !== null) return;
                            openChordEdit(chord.id, event);
                          }}
                          onClick={(event) => {
                            if (touchHoldTriggeredRef.current) {
                              touchHoldTriggeredRef.current = false;
                              return;
                            }
                            if (multiDragMovedRef.current) {
                              multiDragMovedRef.current = false;
                              return;
                            }
                            if (singleDragMovedRef.current) {
                              singleDragMovedRef.current = false;
                              return;
                            }
                            if (isMobileCanvasMode) {
                              return;
                            }
                            if (mobileViewport) {
                              const previousSelected = selectedChordIdsRef.current;
                              const alreadySelected = previousSelected.includes(chord.id);
                              const nextSelected = alreadySelected
                                ? previousSelected.filter((value) => value !== chord.id)
                                : [...previousSelected, chord.id];
                              setSelectedChordIds(nextSelected);
                              if (selectedNoteIdsRef.current.length) {
                                setSelectedNoteIds([]);
                              }
                              if (nextSelected.length === 1 && nextSelected[0] === chord.id) {
                                openChordMenu(chord.id, chord.length, event);
                              } else {
                                setChordMenuAnchor(null);
                                setChordMenuChordId(null);
                                setChordMenuDraft(null);
                              }
                              return;
                            }
                            if (selectedChordIds.length > 1) return;
                            if (editingChordId === chord.id) {
                              if (chordNoteDragMovedRef.current) {
                                chordNoteDragMovedRef.current = false;
                                return;
                              }
                              openChordNoteMenu(chord.id, idx, tab[1], chord.length, event);
                              return;
                            }
                            openChordMenu(chord.id, chord.length, event);
                          }}
                          className={`absolute rounded-md px-1 text-[11px] font-semibold text-slate-900 ${
                            scaleToolActive ? "cursor-ew-resize" : "cursor-grab"
                          } ${
                            selectedChordIds.includes(chord.id) ? "bg-blue-400" : "bg-blue-300"
                          } ${
                            isDimmed
                              ? "opacity-30 pointer-events-none"
                              : isMobileCanvasMode
                              ? "pointer-events-none"
                              : ""
                          }`}
                          style={{
                            top: segment.rowIndex * rowStride + displayString * ROW_HEIGHT + (mobileViewport ? 1 : 4),
                            left: segment.inRowStart * scale,
                            width: Math.max(10, segment.length * scale),
                            height: mobileViewport ? ROW_HEIGHT - 2 : ROW_HEIGHT - 8,
                            touchAction: mobileViewport ? "none" : undefined,
                          }}
                        >
                          {tab[1]}
                          {isLast && editingChordId === null && (
                            <span
                              className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setSelectedChordIds([chord.id]);
                                setSelectedNoteIds([]);
                                setDraftNote(null);
                                setDraftNoteAnchor(null);
                                setResizingNote(null);
                                setResizePreviewLength(null);
                                setResizingChord({
                                  id: chord.id,
                                  startTime: chord.startTime,
                                  length: chord.length,
                                });
                                setResizeChordPreviewLength(chord.length);
                              }}
                            />
                          )}
                        </button>
                      );
                    })
                  );
                })}

                {selectedNote &&
                  noteMenuAnchor &&
                  noteMenuNoteId === selectedNote.id &&
                  noteMenuDraft &&
                  !mobileViewport && (
                    <div
                      ref={noteMenuRef}
                      className="fixed z-[9999] w-56 rounded-md border border-slate-200 bg-white p-2 shadow-md"
                      style={{
                        left: noteMenuAnchor.x,
                        top: noteMenuAnchor.y,
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <div
                        className="flex cursor-move items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700"
                        onMouseDown={(event) => startFloatingPanelDrag("note", event)}
                      >
                        <span>Note #{selectedNote.id}</span>
                        <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
                          Drag
                        </span>
                      </div>
                      <div className="mt-2 space-y-2">
                        <label className="block text-[10px] text-slate-500">
                          Fret
                          <div className="mt-1 flex items-stretch gap-1">
                            <input
                              type="number"
                              min={0}
                              max={maxFret}
                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                              value={noteMenuDraft.fret}
                              onChange={(event) =>
                                setNoteMenuDraft((prev) =>
                                  prev ? { ...prev, fret: event.target.value } : prev
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitNoteMenuFret();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setNoteMenuAnchor(null);
                                  setNoteMenuNoteId(null);
                                  setNoteMenuDraft(null);
                                }
                              }}
                              onBlur={() => commitNoteMenuFret()}
                            />
                            <div className="flex w-7 flex-col gap-1">
                              <button
                                type="button"
                                className="flex h-[18px] items-center justify-center rounded border border-slate-200 bg-slate-50 text-[10px] text-slate-700"
                                onClick={() => adjustDesktopNoteMenuFret(1)}
                                aria-label="Increase fret"
                              >
                                &uarr;
                              </button>
                              <button
                                type="button"
                                className="flex h-[18px] items-center justify-center rounded border border-slate-200 bg-slate-50 text-[10px] text-slate-700"
                                onClick={() => adjustDesktopNoteMenuFret(-1)}
                                aria-label="Decrease fret"
                              >
                                &darr;
                              </button>
                            </div>
                          </div>
                        </label>
                        <label className="block text-[10px] text-slate-500">
                          Length
                          <input
                            type="number"
                            min={1}
                            max={MAX_EVENT_LENGTH_FRAMES}
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                            value={noteMenuDraft.length}
                            onChange={(event) =>
                              setNoteMenuDraft((prev) =>
                                prev ? { ...prev, length: event.target.value } : prev
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitNoteMenuLength();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setNoteMenuAnchor(null);
                                setNoteMenuNoteId(null);
                                setNoteMenuDraft(null);
                              }
                            }}
                            onBlur={() => commitNoteMenuLength()}
                          />
                        </label>
                      </div>
                      {noteAlternates?.possibleTabs?.length ||
                      noteAlternates?.blockedTabs?.length ? (
                        <div className="mt-3">
                          <div className="text-[10px] text-slate-500">Alternative fingerings</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(noteAlternates?.possibleTabs || []).slice(0, 10).map((tab, idx) => (
                              <button
                                key={`note-alt-${selectedNote.id}-${idx}`}
                                type="button"
                                onClick={() => handleAssignAlt(tab)}
                                className="rounded bg-amber-400/70 px-2 py-1 text-[10px] font-semibold text-slate-900"
                              >
                                {stringLabels[tab[0]]}
                                {tab[1]}
                              </button>
                            ))}
                            {(noteAlternates?.blockedTabs || []).slice(0, 10).map((tab, idx) => (
                              <button
                                key={`note-alt-blocked-${selectedNote.id}-${idx}`}
                                type="button"
                                onClick={() => handleAssignAlt(tab)}
                                className="rounded bg-rose-200 px-2 py-1 text-[10px] font-semibold text-rose-700"
                              >
                                {stringLabels[tab[0]]}
                                {tab[1]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <button
                          type="button"
                          onClick={() => {
                            handleDeleteNote();
                            setSelectedNoteIds([]);
                            setNoteMenuAnchor(null);
                            setNoteMenuNoteId(null);
                            setNoteMenuDraft(null);
                          }}
                        className="mt-3 w-full rounded-md bg-rose-500/80 px-2 py-1 text-xs font-semibold text-white"
                      >
                        Delete note
                      </button>
                    </div>
                  )}

                {selectedChord &&
                  chordMenuAnchor &&
                  chordMenuChordId === selectedChord.id &&
                  chordMenuDraft &&
                  editingChordId === null && (
                    <div
                      ref={chordMenuRef}
                      className="fixed z-[9999] w-60 rounded-md border border-slate-200 bg-white p-2 shadow-md"
                      style={{ left: chordMenuAnchor.x, top: chordMenuAnchor.y }}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <div
                        className="flex cursor-move items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700"
                        onMouseDown={(event) => startFloatingPanelDrag("chord", event)}
                      >
                        <span>Chord #{selectedChord.id}</span>
                        <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
                          Drag
                        </span>
                      </div>
                      <div className="mt-2 space-y-2">
                        <label className="block text-[10px] text-slate-500">
                          Length
                          <input
                            type="number"
                            min={1}
                            max={MAX_EVENT_LENGTH_FRAMES}
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                            value={chordMenuDraft.length}
                            onChange={(event) =>
                              setChordMenuDraft((prev) =>
                                prev ? { ...prev, length: event.target.value } : prev
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitChordMenuLength();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setChordMenuAnchor(null);
                                setChordMenuChordId(null);
                                setChordMenuDraft(null);
                              }
                            }}
                            onBlur={() => commitChordMenuLength()}
                          />
                        </label>
                      </div>
                      {chordAlternatives.length ? (
                        <div className="mt-3">
                          <div className="text-[10px] text-slate-500">Fingerings</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {chordAlternatives.slice(0, 8).map((tabs, idx) => (
                              <button
                                key={`chord-alt-${selectedChord.id}-${idx}`}
                                type="button"
                                onClick={() => handleApplyChordTabs(tabs)}
                                className="rounded bg-amber-400/70 px-2 py-1 text-[10px] font-semibold text-slate-900"
                              >
                                {tabs.map((tab) => `${stringLabels[tab[0]]}${tab[1]}`).join(" ")}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => openChordEdit(selectedChord.id, event)}
                        className="mt-3 w-full rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Edit chord
                      </button>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleChordOctaveShift(-1)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Octave down
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChordOctaveShift(1)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Octave up
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void runMutation(() => gteApi.disbandChord(editorId, selectedChord.id), {
                              localApply: (draft) => {
                                disbandChordInSnapshot(draft, selectedChord.id);
                              },
                            });
                            setSelectedChordIds([]);
                            setChordMenuAnchor(null);
                            setChordMenuChordId(null);
                            setChordMenuDraft(null);
                          }}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Disband
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleDeleteChord();
                            setChordMenuAnchor(null);
                            setChordMenuChordId(null);
                            setChordMenuDraft(null);
                          }}
                          className="rounded-md bg-rose-500/80 px-2 py-1 text-[10px] font-semibold text-white"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                {editingChordId !== null && editingChordAnchor && (
                  <div
                    ref={chordEditPanelRef}
                    className="fixed z-[9999] w-48 rounded-md border border-slate-200 bg-white p-2 shadow-md"
                    style={{ left: editingChordAnchor.x, top: editingChordAnchor.y }}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <div className="text-[11px] font-semibold text-slate-700">
                      Editing chord #{editingChordId}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">Click chord notes to edit.</p>
                    <button
                      type="button"
                      onClick={exitChordEdit}
                      className="mt-2 w-full rounded-md bg-emerald-500/80 px-2 py-1 text-[10px] font-semibold text-slate-900"
                    >
                      Done
                    </button>
                  </div>
                )}

                {selectedChord &&
                  editingChordId === selectedChord.id &&
                  chordNoteMenuAnchor &&
                  chordNoteMenuIndex !== null &&
                  chordNoteMenuDraft && (
                    <div
                      ref={chordNoteMenuRef}
                      className="fixed z-[9999] w-56 rounded-md border border-slate-200 bg-white p-2 shadow-md"
                      style={{ left: chordNoteMenuAnchor.x, top: chordNoteMenuAnchor.y }}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <div className="text-[11px] font-semibold text-slate-700">
                        Chord note #{chordNoteMenuIndex + 1}
                      </div>
                      <div className="mt-2 space-y-2">
                        <label className="block text-[10px] text-slate-500">
                          Fret
                          <input
                            type="number"
                            min={0}
                            max={maxFret}
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                            value={chordNoteMenuDraft.fret}
                            onChange={(event) =>
                              setChordNoteMenuDraft((prev) =>
                                prev ? { ...prev, fret: event.target.value } : prev
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitChordNoteFret();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setChordNoteMenuAnchor(null);
                                setChordNoteMenuIndex(null);
                                setChordNoteMenuDraft(null);
                              }
                            }}
                            onBlur={() => commitChordNoteFret()}
                          />
                        </label>
                        <label className="block text-[10px] text-slate-500">
                          Length
                          <input
                            type="number"
                            min={1}
                            max={MAX_EVENT_LENGTH_FRAMES}
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                            value={chordNoteMenuDraft.length}
                            onChange={(event) =>
                              setChordNoteMenuDraft((prev) =>
                                prev ? { ...prev, length: event.target.value } : prev
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitChordNoteLength();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setChordNoteMenuAnchor(null);
                                setChordNoteMenuIndex(null);
                                setChordNoteMenuDraft(null);
                              }
                            }}
                            onBlur={() => commitChordNoteLength()}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={deleteChordNote}
                        className="mt-3 w-full rounded-md bg-rose-500/80 px-2 py-1 text-[10px] font-semibold text-white"
                      >
                        Delete note
                      </button>
                    </div>
                  )}

                {draftNote && mobileViewport && (
                  <div
                    ref={draftPopupRef}
                    className="fixed bottom-28 left-1/2 z-[9999] w-[min(calc(100vw-2rem),15rem)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Add note
                        </div>
                        <div className="mt-1 text-sm text-slate-700">
                          String {stringLabels[draftNote.stringIndex]} at {draftNote.startTime}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftNote(null);
                          setDraftNoteAnchor(null);
                        }}
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Fret</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-900">
                        {draftNote.fret === null ? "--" : draftNote.fret}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Del"].map((key) => (
                        <button
                          key={`draft-key-${key}`}
                          type="button"
                          onClick={() => {
                            if (key === "Clear") {
                              setDraftNote((prev) => (prev ? { ...prev, fret: null } : prev));
                              return;
                            }
                            if (key === "Del") {
                              backspaceDraftFretDigit();
                              return;
                            }
                            appendDraftFretDigit(key);
                          }}
                          className="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800"
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddNote}
                      disabled={draftNote.fret === null}
                      className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      Add note
                    </button>
                  </div>
                )}
                {draftNote && draftNoteAnchor && !mobileViewport && (
                  <div
                    ref={draftPopupRef}
                    className="fixed z-[9999] rounded-md border border-slate-200 bg-white px-2 py-2 shadow-md"
                    style={{
                      left: draftNoteAnchor.x,
                      top: draftNoteAnchor.y,
                      transform: "translate(-10%, calc(-100% - 8px))",
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <div className="text-[11px] text-slate-600">
                      String {stringLabels[draftNote.stringIndex]} @ {draftNote.startTime}
                    </div>
                    <div className="mt-1 flex items-end gap-2">
                      <div className="flex flex-col items-start gap-1">
                        <input
                          ref={draftFretRef}
                          type="number"
                          min={0}
                          max={maxFret}
                          value={draftNote.fret ?? ""}
                          onChange={(e) =>
                            setDraftNote((prev) =>
                              prev ? { ...prev, fret: parseOptionalNumber(e.target.value) } : prev
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleAddNote();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setDraftNote(null);
                              setDraftNoteAnchor(null);
                            }
                          }}
                          className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                          placeholder="Fret"
                        />
                        <span className="text-[10px] text-slate-500">Fret</span>
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <input
                          type="number"
                          min={1}
                          max={MAX_EVENT_LENGTH_FRAMES}
                          value={draftNote.length ?? ""}
                          onChange={(e) =>
                            setDraftNote((prev) => {
                              if (!prev) return prev;
                              const parsed = parseOptionalNumber(e.target.value);
                              return {
                                ...prev,
                                length: parsed === null ? null : clampEventLength(parsed),
                              };
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleAddNote();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setDraftNote(null);
                              setDraftNoteAnchor(null);
                            }
                          }}
                          className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                          placeholder="Length"
                        />
                        <span className="text-[10px] text-slate-500">Length</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddNote}
                        onMouseDown={(event) => event.stopPropagation()}
                        className="rounded-md bg-emerald-500/80 px-2 py-1 text-[11px] font-semibold text-slate-900"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftNote(null);
                          setDraftNoteAnchor(null);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">Type a fret and press Enter.</div>
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        </div>
        {showMobileEditRail && (
          <div className="mt-2 shrink-0" data-gte-floating-ui="true">
            <div className="flex h-[13rem] items-stretch gap-2 pb-[5rem]">
              <div
                ref={showMobileInlineNoteSettings ? noteMenuRef : null}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-2.5 shadow-lg"
                onMouseDown={(event) => event.stopPropagation()}
              >
                {showMobileInlineNoteSettings && selectedNote && noteMenuDraft ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Note settings
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleDeleteNote();
                          setSelectedNoteIds([]);
                          setNoteMenuAnchor(null);
                          setNoteMenuNoteId(null);
                          setNoteMenuDraft(null);
                        }}
                        className="rounded-md bg-rose-500/90 px-2 py-1 text-[10px] font-semibold text-white"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(["fret", "length"] as const).map((field) => {
                        const label = field === "fret" ? "Fret" : "Length";
                        const value = field === "fret" ? noteMenuDraft.fret : noteMenuDraft.length;
                        const commitField = field === "fret" ? commitNoteMenuFret : commitNoteMenuLength;
                        return (
                          <div key={field} className="rounded-lg border border-slate-200 bg-slate-50 p-1.5">
                            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                              {label}
                            </div>
                            <div className="mt-1 flex items-stretch gap-1.5">
                              <input
                                type="number"
                                min={field === "fret" ? 0 : 1}
                                max={field === "fret" ? maxFret : MAX_EVENT_LENGTH_FRAMES}
                                inputMode="numeric"
                                enterKeyHint="done"
                                value={value}
                                onChange={(event) =>
                                  setNoteMenuDraft((prev) =>
                                    prev ? { ...prev, [field]: event.target.value } : prev
                                  )
                                }
                                onFocus={(event) => event.currentTarget.select()}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return;
                                  event.preventDefault();
                                  commitField();
                                }}
                                onBlur={() => commitField()}
                                className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[16px] font-semibold text-slate-900 outline-none"
                              />
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => adjustMobileNoteField(field, 1)}
                                  className="flex h-[18px] w-6 items-center justify-center rounded border border-slate-200 bg-white text-[9px] text-slate-600"
                                  aria-label={`Increase ${label.toLowerCase()}`}
                                >
                                  &#9650;
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => adjustMobileNoteField(field, -1)}
                                  className="flex h-[18px] w-6 items-center justify-center rounded border border-slate-200 bg-white text-[9px] text-slate-600"
                                  aria-label={`Decrease ${label.toLowerCase()}`}
                                >
                                  &#9660;
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <label className="mt-2 block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                      Fingering
                      <select
                        key={`mobile-note-fingering-${selectedNote.id}`}
                        defaultValue=""
                        disabled={mobileNoteFingeringOptions.length === 0}
                        onChange={(event) => {
                          const rawValue = event.currentTarget.value;
                          if (!rawValue) return;
                          const [stringValue, fretValue] = rawValue.split(":").map(Number);
                          if (Number.isInteger(stringValue) && Number.isInteger(fretValue)) {
                            handleAssignAlt([stringValue, fretValue]);
                          }
                          event.currentTarget.value = "";
                        }}
                        className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">
                          {mobileNoteFingeringOptions.length ? "Choose fingering" : "No other fingerings"}
                        </option>
                        {mobileNoteFingeringOptions.map((option) => (
                          <option key={option.key} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="flex h-full flex-col justify-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Note settings
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-slate-500">
                      Select one note to edit fret, length, or fingering.
                    </div>
                  </div>
                )}
              </div>
              {showMobileInlineToolbar && (
                <div className={`${toolbarOpen ? "w-[min(10.5rem,42vw)]" : "w-[5.25rem]"} shrink-0 transition-[width] duration-150`}>
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setToolbarOpen((prev) => !prev)}
                      aria-pressed={toolbarOpen}
                      title={toolbarOpen ? "Hide toolbar (T)" : "Show toolbar (T)"}
                      className={`flex h-10 w-full items-center justify-center rounded-xl border px-2 text-xs font-semibold shadow-sm transition ${
                        toolbarOpen
                          ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Toolbar
                    </button>
                    <div className="min-h-0 flex-1">
                      {toolbarOpen ? (
                        renderToolbarPanel(true)
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/75 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Hidden
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


