import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type UIEvent as ReactUiEvent,
} from "react";
import { gteApi } from "../lib/gteApi";
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

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];
const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40];
const ROW_HEIGHT = 24;
const ROW_GAP = 80;
const BARS_PER_ROW = 3;
const DEFAULT_NOTE_LENGTH = 20;
const MAX_EVENT_LENGTH_FRAMES = 800;
const FIXED_FRAMES_PER_BAR = 480;
const DEFAULT_SECONDS_PER_BAR = 2;
const CUT_SEGMENT_HEIGHT = 20;
const CUT_SEGMENT_OFFSET = 14;
const CUT_SEGMENT_MIN_WIDTH = 28;
const CUT_BOUNDARY_OVERHANG = 12;
const MAX_HISTORY = 16;
const AUTOSAVE_DEBOUNCE_MS = 2500;
const AUTOSAVE_INTERVAL_MS = 20000;
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
const SCALE_TOOL_MODES = ["length", "start", "both"] as const;

const fpsFromSecondsPerBar = (secondsPerBar: number) => {
  const safeSeconds = Math.max(0.1, secondsPerBar);
  return Math.max(1, Math.round(FIXED_FRAMES_PER_BAR / safeSeconds));
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

const getTabMidi = (snapshot: EditorSnapshot, tab: TabCoord) => {
  const fromRef = snapshot.tabRef?.[tab[0]]?.[tab[1]];
  if (fromRef !== undefined && fromRef !== null && Number.isFinite(Number(fromRef))) {
    return Number(fromRef);
  }
  const base = STANDARD_TUNING_MIDI[tab[0]];
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
  const maxFret = draft.tabRef?.[0]?.length ? draft.tabRef[0].length - 1 : 36;
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
}: Props) {
  const [baseScale, setBaseScale] = useState(4);
  const [secondsPerBar, setSecondsPerBar] = useState(2);
  const [secondsPerBarInput, setSecondsPerBarInput] = useState("2");
  const [timeSignature, setTimeSignature] = useState(8);
  const [timeSignatureInput, setTimeSignatureInput] = useState("8");
  const [localSnapToGridEnabled, setLocalSnapToGridEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackVolume, setPlaybackVolume] = useState(0.6);
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
  const pendingMutationsRef = useRef<OptimisticMutation[]>([]);
  const mutationSeqRef = useRef(0);
  const mutationProcessingRef = useRef(false);
  const tempNoteIdRef = useRef(-1);
  const tempChordIdRef = useRef(-1);
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
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const scaleHudRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const segmentEditsRef = useRef<SegmentEdit[]>(segmentEdits);
  const dragPreviewRef = useRef<DragPreview | null>(dragPreview);
  const multiDragDeltaRef = useRef<number | null>(multiDragDelta);
  const multiDragMovedRef = useRef(false);
  const noteDragMovedRef = useRef(false);
  const multiDragStartXRef = useRef(0);
  const resizePreviewRef = useRef<number | null>(resizePreviewLength);
  const resizeChordPreviewRef = useRef<number | null>(resizeChordPreviewLength);
  const dragChordNotePreviewRef = useRef<{ stringIndex: number } | null>(dragChordNotePreview);
  const chordNoteDragMovedRef = useRef(false);
  const chordNoteDragStartYRef = useRef(0);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 80, y: 120 });
  const selectionRef = useRef<SelectionState | null>(null);
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
  const maxFret = snapshot.tabRef?.[0]?.length ? snapshot.tabRef[0].length - 1 : 22;
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
  const normalizedTimelineZoomFactor =
    timelineZoomFactor !== undefined && Number.isFinite(timelineZoomFactor)
      ? Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, timelineZoomFactor))
      : 1;
  const scale = baseScale * normalizedTimelineZoomFactor;
  const timelineWidth = Math.max(1, computedTotalFrames) * scale;
  const viewportTimelineWidth = Math.max(1, viewportTotalFrames) * scale;
  const timelineChromeWidth = viewportTimelineWidth + 40;
  const rowHeight = ROW_HEIGHT * 6;
  const rowBlockHeight = rowHeight + CUT_SEGMENT_OFFSET + CUT_SEGMENT_HEIGHT;
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
  const showToolbarUi = showFloatingUi || showToolbarWhenInactive;
  const selectedBarIndexSet = useMemo(() => new Set(selectedBarIndices), [selectedBarIndices]);
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
    tempNoteIdRef.current = -1;
    tempChordIdRef.current = -1;
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
      if (!draftHasFocusedRef.current) {
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
        setSecondsPerBarInput(String(next));
        return;
      }
    }
    const snapshotFps = Math.max(1, Number(snapshot.fps || fpsFromSecondsPerBar(DEFAULT_SECONDS_PER_BAR)));
    const inferred = FIXED_FRAMES_PER_BAR / snapshotFps;
    if (!Number.isFinite(inferred) || inferred <= 0) return;
    const normalized = Math.round(inferred * 1000) / 1000;
    setSecondsPerBar(normalized);
    setSecondsPerBarInput(String(normalized));
  }, [snapshot.secondsPerBar, snapshot.fps]);

  useEffect(() => {
    if (snapshot.timeSignature !== undefined && snapshot.timeSignature !== null) {
      const next = Number(snapshot.timeSignature);
      if (Number.isFinite(next) && next >= 1) {
        const clamped = Math.max(1, Math.min(64, Math.round(next)));
        setTimeSignature(clamped);
        setTimeSignatureInput(String(clamped));
      }
    }
  }, [snapshot.timeSignature]);

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
    if (selectedNoteIds.length === 1) {
      const selectedId = selectedNoteIds[0];
      const resolvedId =
        selectedId < 0 ? noteIdMapRef.current.get(selectedId) ?? selectedId : selectedId;
      if (resolvedId < 0) {
        setNoteAlternates(null);
        return;
      }
      void gteApi
        .getNoteOptimals(editorId, resolvedId)
        .then((data) => setNoteAlternates(data))
        .catch(() => setNoteAlternates(null));
    } else {
      setNoteAlternates(null);
    }
  }, [editorId, selectedNoteIds]);

  useEffect(() => {
    if (!selectedNote || selectedNote.id !== noteMenuNoteId) {
      setNoteMenuAnchor(null);
      setNoteMenuNoteId(null);
      setNoteMenuDraft(null);
    }
  }, [selectedNote, noteMenuNoteId]);

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
    if (!selectedChord || selectedChord.id !== chordMenuChordId) {
      setChordMenuAnchor(null);
      setChordMenuChordId(null);
      setChordMenuDraft(null);
    }
  }, [selectedChord, chordMenuChordId]);

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
      const current = snapshotRef.current;
      const sameSnapshot = current ? snapshotsEqual(current, next) : false;
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
      snapshotRef.current = next;
      onSnapshotChange(next, { recordHistory });
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
    }
  ) => {
    if (!allowBackend) {
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
    const minExisting = current.notes.reduce((min, note) => Math.min(min, note.id), 0);
    tempNoteIdRef.current = Math.min(tempNoteIdRef.current, minExisting, -1) - 1;
    return tempNoteIdRef.current;
  }, []);

  const getTempChordId = useCallback(() => {
    const current = snapshotRef.current;
    const minExisting = current.chords.reduce((min, chord) => Math.min(min, chord.id), 0);
    tempChordIdRef.current = Math.min(tempChordIdRef.current, minExisting, -1) - 1;
    return tempChordIdRef.current;
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
    }) => {
      const current = snapshotRef.current;
      if (!current) return;
      setError(null);
      const before = cloneSnapshot(current);
      const optimistic = input.apply(cloneSnapshot(before));
      mutationSeqRef.current += 1;
      applySnapshot(optimistic);
      markLocalSnapshotDirty();
      if (!allowBackend) {
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
    if (!scaleToolActive) return;
    const idx = SCALE_TOOL_MODES.indexOf(scaleToolMode);
    const nextMode =
      idx >= 0
        ? SCALE_TOOL_MODES[(idx + 1) % SCALE_TOOL_MODES.length]
        : SCALE_TOOL_MODES[0];
    setScaleToolMode(nextMode);
    applyScalePreview(scaleFactor, { mode: nextMode, syncInput: false });
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
    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, timelineWidth);
      const y = clamp(event.clientY - rect.top, 0, Math.max(0, timelineHeight));
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
    const handleUp = () => {
      const preview = dragPreviewRef.current;
      if (!preview) {
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
          noteDragMovedRef.current = true;
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
        noteDragMovedRef.current = didChangeString || didChangeStart;
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
      setDragging(null);
      setDragPreview(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
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

    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, timelineWidth);
      const y = clamp(event.clientY - rect.top, 0, Math.max(0, timelineHeight));
      const rowIndex = clamp(Math.floor(y / rowStride), 0, rows - 1);
      const rowStart = rowIndex * rowFrames;
      const rawStart = Math.round(x / scale) - multiDrag.anchorGrabOffsetFrames + rowStart;
      const snappedStart = getSnapTime(rawStart, {
        excludeNoteIds: multiDrag.notes.map((note) => note.id),
        excludeChordIds: multiDrag.chords.map((chord) => chord.id),
      });

      if (Math.abs(event.clientX - multiDragStartXRef.current) > 3) {
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

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
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
        void runMutation(() => gteApi.shiftCutBoundary(editorId, segmentDragIndex, target.end));
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
    if (sliceToolActive && !event.shiftKey && selectedNoteIds.length + selectedChordIds.length > 0) {
      multiDragMovedRef.current = true;
      const target = getPointerFrame(event.clientX, event.clientY);
      if (target) {
        handleSliceAtTime(target.time);
      }
      return;
    }
    setSelectedCutBoundaryIndex(null);
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

  const startNoteDrag = (
    noteId: number,
    stringIndex: number,
    fret: number,
    startTime: number,
    length: number,
    event: ReactMouseEvent
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (sliceToolActive && !event.shiftKey && selectedNoteIds.length + selectedChordIds.length > 0) {
      multiDragMovedRef.current = true;
      const target = getPointerFrame(event.clientX, event.clientY);
      if (target) {
        handleSliceAtTime(target.time);
      }
      return;
    }
    if (event.shiftKey) {
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
    event: ReactMouseEvent
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (sliceToolActive && !event.shiftKey && selectedNoteIds.length + selectedChordIds.length > 0) {
      const target = getPointerFrame(event.clientX, event.clientY);
      if (target) {
        handleSliceAtTime(target.time);
      }
      return;
    }
    if (event.shiftKey) {
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
    void runMutation(() => gteApi.reorderBars(editorId, dragBarIndex, targetIndex), {
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

  const handleAddNote = () => {
    if (!draftNote) return;
    const { fret } = draftNote;
    const rawLength = clampEventLength(draftNote.length ?? lastAddedNoteLengthRef.current);
    if (fret === null) {
      setError("Enter a fret before adding the note.");
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
    const resolvedIds = selectedNoteIds.map((id) => resolveNoteId(id)).filter((id) => id >= 0);
    if (!resolvedIds.length) return;
    void runMutation(() => gteApi.assignOptimals(editorId, resolvedIds));
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
    void runMutation(() => gteApi.deleteNote(editorId, selectedNote.id), {
      localApply: (draft) => {
        removeNoteFromSnapshot(draft, selectedNote.id);
      },
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
    void runMutation(() => gteApi.deleteCutBoundary(editorId, selectedCutBoundaryIndex));
    setSelectedCutBoundaryIndex(null);
  };

  const handleDeleteChord = () => {
    if (!selectedChord) return;
    void runMutation(() => gteApi.deleteChord(editorId, selectedChord.id), {
      localApply: (draft) => {
        removeChordFromSnapshot(draft, selectedChord.id);
      },
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
    const { x, y } = getSideMenuAnchor(event, 224, 220);
    setNoteMenuAnchor({ x, y });
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

  const commitNoteMenuFret = () => {
    if (!selectedNote || !noteMenuDraft) return;
    const fretValue = Number(noteMenuDraft.fret);
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
  };

  const commitNoteMenuLength = () => {
    if (!selectedNote || !noteMenuDraft) return;
    const rawLength = Number(noteMenuDraft.length);
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
  };

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
      void runMutation(() => gteApi.deleteChord(editorId, selectedChord.id), {
        localApply: (draft) => {
          removeChordFromSnapshot(draft, selectedChord.id);
        },
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
    void runMutation(() => gteApi.applyManualCuts(editorId, payload));
    cancelSegmentEdit();
  };

  const cancelSegmentEditIfActive = useCallback(() => {
    if (editingSegmentIndex !== null) {
      cancelSegmentEdit();
    }
  }, [editingSegmentIndex, cancelSegmentEdit]);

  const handleApplySegments = () => {
    if (segmentEdits.some((seg) => seg.stringIndex === null || seg.fret === null)) {
      setError("Fill in string and fret for all segments before saving.");
      return;
    }
    const payload: CutWithCoord[] = segmentEdits.map((seg) => [
      [seg.start, seg.end],
      [seg.stringIndex as number, seg.fret as number],
    ]);
    void runMutation(() => gteApi.applyManualCuts(editorId, payload));
  };

  const handleInsertBoundary = () => {
    if (insertTime === null || insertString === null || insertFret === null) {
      setError("Enter time, string, and fret before inserting.");
      return;
    }
    void runMutation(() =>
      gteApi.insertCutAt(editorId, insertTime, [insertString, insertFret])
    );
  };

  const handleShiftBoundary = () => {
    if (shiftBoundaryIndex === null || shiftBoundaryTime === null) {
      setError("Enter an index and time before shifting.");
      return;
    }
    void runMutation(() => gteApi.shiftCutBoundary(editorId, shiftBoundaryIndex, shiftBoundaryTime));
  };

  const handleDeleteBoundary = () => {
    if (deleteBoundaryIndex === null) {
      setError("Enter a boundary index to delete.");
      return;
    }
    void runMutation(() => gteApi.deleteCutBoundary(editorId, deleteBoundaryIndex));
  };

  const handleGenerateCuts = () => {
    void runMutation(() => gteApi.generateCuts(editorId));
  };

  const handleAddBar = () => {
    void runMutation(() => gteApi.addBars(editorId, 1), {
      localApply: (draft) => {
        addBarsInSnapshot(draft, 1);
      },
    });
  };

  const handleRemoveBar = (index: number) => {
    if (barCount <= 1) return;
    void runMutation(() => gteApi.removeBar(editorId, index), {
      localApply: (draft) => {
        removeBarInSnapshot(draft, index);
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
          return [...prev, index].sort((a, b) => a - b);
        });
        setBarSelectionAnchor(index);
        return;
      }
      setSelectedBarIndices([index]);
      setBarSelectionAnchor(index);
      },
      [barSelectionAnchor, isActive]
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
    const base = STANDARD_TUNING_MIDI[tab[0]];
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

  function playNotePreview(tab: TabCoord, midiOverride?: number) {
    if (effectivePlaybackVolume <= 0) return;
    const midi = getMidiFromTab(tab, midiOverride);
    if (!Number.isFinite(midi) || midi <= 0) return;

    const { ctx, master } = ensurePreviewAudio();
    void ctx.resume();

    const now = ctx.currentTime;
    const duration = 0.16;
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);

    const amp = ctx.createGain();
    const peak = 0.6;
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(peak, now + 0.01);
    amp.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(amp);
    amp.connect(master);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  const stopAudio = () => {
    if (audioRef.current) {
      void audioRef.current.close();
      audioRef.current = null;
    }
    masterGainRef.current = null;
  };

  const schedulePlayback = (startFrame: number) => {
    const ctx = new AudioContext();
    void ctx.resume();
    const latencySec =
      (Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0) +
      (Number.isFinite((ctx as AudioContext).outputLatency)
        ? (ctx as AudioContext).outputLatency
        : 0);
    const base = ctx.currentTime + latencySec;
    let endFrame = Math.max(startFrame, timelineEnd);
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
      if (eventEnd <= startFrame) return;
      const trimmedStart = Math.max(eventStart, startFrame);
      const durationFrames = eventEnd - trimmedStart;
      if (durationFrames <= 0) return;
      endFrame = Math.max(endFrame, eventEnd);
      events.push({
        start: (trimmedStart - startFrame) / playbackFps,
        duration: durationFrames / playbackFps,
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

    const master = ctx.createGain();
    master.gain.value = effectivePlaybackVolume;
    master.connect(ctx.destination);
    masterGainRef.current = master;

    const schedulePluck = (evt: {
      start: number;
      duration: number;
      midi: number;
      gain: number;
      stringIndex?: number;
    }) => {
      if (!Number.isFinite(evt.midi) || evt.midi <= 0) return;
      const startAt = base + evt.start;
      const duration = Math.max(0.05, evt.duration);
      const stopAt = startAt + duration;
      const frequency = 440 * Math.pow(2, (evt.midi - 69) / 12);

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, startAt);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, startAt);
      amp.gain.linearRampToValueAtTime(evt.gain, startAt + 0.01);
      amp.gain.setValueAtTime(evt.gain, Math.max(startAt + 0.01, stopAt - 0.01));
      amp.gain.linearRampToValueAtTime(0, stopAt);

      osc.connect(amp);
      amp.connect(master);

      osc.start(startAt);
      osc.stop(stopAt + 0.02);
    };

    events.forEach((evt) => schedulePluck(evt));
    return { ctx, endFrame, startTimeSec: base };
  };

  const stopPlayback = () => {
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

  const startPlayback = (startFrameOverride?: number) => {
    if (isPlaying) return;
    const startFrame = clamp(
      Math.round(startFrameOverride ?? playheadFrameRef.current),
      0,
      timelineEnd
    );
    stopAudio();
    const scheduled = schedulePlayback(startFrame);
    if (scheduled?.ctx) {
      audioRef.current = scheduled.ctx;
    }
    playheadAudioStartRef.current = scheduled?.startTimeSec ?? null;
    setEffectivePlayheadFrame(startFrame);
    playheadEndFrameRef.current = timelineEnd;
    playheadStartFrameRef.current = startFrame;
    playheadStartTimeRef.current = performance.now();
    setIsPlaying(true);
    const tick = (now: number) => {
      if (playheadStartTimeRef.current === null) return;
      let elapsed = (now - playheadStartTimeRef.current) / 1000;
      if (audioRef.current && playheadAudioStartRef.current !== null) {
        elapsed = audioRef.current.currentTime - playheadAudioStartRef.current;
      }
      if (elapsed < 0) elapsed = 0;
      const nextFrame = playheadStartFrameRef.current + elapsed * playbackFps;
      const endFrame = playheadEndFrameRef.current ?? timelineEnd;
      if (nextFrame >= endFrame) {
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
      startPlayback(atTimelineEnd ? 0 : undefined);
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
    if (!isActive) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = isShortcutTextEntryTarget(target);
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
        if (isTyping) return;
        event.preventDefault();
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
        !event.altKey &&
        scaleToolActive
      ) {
        if (isTyping) return;
        event.preventDefault();
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
        void runMutation(() => gteApi.deleteCutBoundary(editorId, selectedCutBoundaryIndex));
        setSelectedCutBoundaryIndex(null);
        return;
      }
      if (selectedNoteIds.length > 0) {
        const noteIdsToDelete = [...selectedNoteIds];
        void runMutation(async () => {
          let last = null as Awaited<ReturnType<typeof gteApi.deleteNote>> | null;
          for (const id of noteIdsToDelete) {
            last = await gteApi.deleteNote(editorId, id);
          }
          return last ?? {};
        }, {
          localApply: (draft) => {
            noteIdsToDelete.forEach((id) => removeNoteFromSnapshot(draft, id));
          },
        });
        setSelectedNoteIds([]);
      } else if (activeChordIds.length > 0) {
        const chordIdsToDelete = [...activeChordIds];
        void runMutation(async () => {
          let last = null as Awaited<ReturnType<typeof gteApi.deleteChord>> | null;
          for (const id of chordIdsToDelete) {
            last = await gteApi.deleteChord(editorId, id);
          }
          return last ?? {};
        }, {
          localApply: (draft) => {
            chordIdsToDelete.forEach((id) => removeChordFromSnapshot(draft, id));
          },
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
    barClipboardAvailable,
    handleCopySelectedBars,
    handleDeleteSelectedBars,
    handlePasteSelectedBars,
    lastBarInsertIndex,
    onRequestSelectedBarsCopy,
    onRequestSelectedBarsDelete,
    onRequestSelectedBarsPaste,
    selectedBarIndices,
  ]);

  useEffect(() => {
    const handleMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (event.shiftKey && target.closest("[data-gte-track='true']")) return;
      if (!target.closest("[data-cut-edit]")) {
        cancelSegmentEditIfActive();
      }
      if (editingChordId !== null) {
        if (chordNoteMenuRef.current && chordNoteMenuRef.current.contains(target)) return;
        if (chordEditPanelRef.current && chordEditPanelRef.current.contains(target)) return;
        if (toolbarRef.current && toolbarRef.current.contains(target)) return;
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
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, [cancelSegmentEditIfActive, contextMenu]);

  const workspaceClass = embedded
    ? `w-full min-w-0 max-w-full overflow-x-hidden rounded-xl border bg-white p-2 space-y-2 transition-[border-color,box-shadow] ${
        isActive
          ? "border-sky-300 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.22),0_1px_2px_rgba(15,23,42,0.04)]"
          : "border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      }`
    : "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 space-y-5 -ml-3 w-[calc(100%+0.75rem)]";

  return (
    <div className={workspaceClass} onMouseDownCapture={() => onFocusWorkspace?.()}>
      {showToolbarUi && !toolbarOpen && (
        <button
          type="button"
          onClick={() => setToolbarOpen(true)}
          className="fixed bottom-4 left-1/2 z-[9997] -translate-x-1/2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Toolbar
        </button>
      )}

      {toolbarOpen && showToolbarUi && (
        <div
          ref={toolbarRef}
          className="fixed bottom-5 left-1/2 z-[9998] w-[min(980px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
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
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white p-1.5">
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
              <div className="rounded-md border border-slate-200 bg-white p-1.5">
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
      )}
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
      {showToolbarUi && (
      <div className="fixed right-4 bottom-16 z-[9996] flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-1.5 text-slate-700 shadow-sm backdrop-blur">
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
      </div>
      )}
      <div className={`flex flex-wrap items-center ${embedded ? "gap-2" : "gap-3"}`}>
        {!embedded && (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>Seconds/bar</span>
          <input
            type="number"
            min={0.5}
            step={0.1}
            inputMode="decimal"
            value={secondsPerBarInput}
            onChange={(e) => setSecondsPerBarInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const next = Number(secondsPerBarInput);
              if (Number.isFinite(next) && next > 0) {
                setSecondsPerBar(next);
                setSecondsPerBarInput(String(next));
                void runMutation(() => gteApi.setSecondsPerBar(editorId, next), {
                  localApply: (draft) => {
                    setSecondsPerBarInSnapshot(draft, next);
                  },
                });
              } else {
                setSecondsPerBarInput(String(secondsPerBar));
              }
            }}
            onBlur={() => {
              const next = Number(secondsPerBarInput);
              if (Number.isFinite(next) && next > 0) {
                setSecondsPerBar(next);
                setSecondsPerBarInput(String(next));
                void runMutation(() => gteApi.setSecondsPerBar(editorId, next), {
                  localApply: (draft) => {
                    setSecondsPerBarInSnapshot(draft, next);
                  },
                });
              } else {
                setSecondsPerBarInput(String(secondsPerBar));
              }
            }}
            className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
          />
        </div>
        )}
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
        {embedded && (
          <div className="hide-scrollbar min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-center gap-1 text-[11px] text-slate-700">
              {Array.from({ length: barCount }).map((_, idx) => (
                <div
                  key={`bar-chip-inline-${idx}`}
                  draggable
                  onDragStart={() => setDragBarIndex(idx)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleBarReorderDrop(idx)}
                  onDragEnd={() => setDragBarIndex(null)}
                  className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${
                    dragBarIndex === idx ? "border-blue-400 bg-blue-500/20" : "border-slate-200 bg-white"
                  }`}
                >
                  <span>Bar {idx + 1}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleRemoveBar(idx);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    className="rounded px-1 text-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title="Delete bar"
                    disabled={barCount <= 1}
                  >
                    x
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddBar}
                className="rounded-md border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                title="Add bar"
              >
                +
              </button>
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
              FPS: {fps} - Beats/bar: {timeSignature} - Frames per bar: {framesPerMeasure} - Total
              frames: {computedTotalFrames}
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

      {!embedded && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700">
        {Array.from({ length: barCount }).map((_, idx) => (
          <div
            key={`bar-chip-${idx}`}
            draggable
            onDragStart={() => setDragBarIndex(idx)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleBarReorderDrop(idx)}
            onDragEnd={() => setDragBarIndex(null)}
            className={`flex items-center gap-1 rounded-md border px-1.5 ${embedded ? "py-0.5" : "py-1"} ${
              dragBarIndex === idx ? "border-blue-400 bg-blue-500/20" : "border-slate-200 bg-white"
            }`}
          >
            <span>Bar {idx + 1}</span>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleRemoveBar(idx);
              }}
              onMouseDown={(event) => event.stopPropagation()}
              className="rounded px-1 text-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title="Delete bar"
              disabled={barCount <= 1}
            >
              x
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddBar}
          className={`rounded-md border border-dashed border-slate-300 text-[11px] text-slate-600 hover:bg-slate-100 ${
            embedded ? "px-1.5 py-0.5" : "px-2 py-1"
          }`}
          title="Add bar"
        >
          +
        </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className={`min-w-0 ${embedded ? "space-y-2" : "space-y-4"}`}>
        <div className={`flex min-w-0 items-start ${embedded ? "gap-2" : "gap-4"}`}>
          <div className="flex flex-col gap-0 pt-5 text-xs text-slate-600">
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <div
                key={`labels-${rowIdx}`}
                className="flex flex-col gap-0"
                style={{ height: rowBlockHeight, marginBottom: rowIdx < rows - 1 ? ROW_GAP : 0 }}
              >
                {STRING_LABELS.map((label) => (
                  <div
                    key={`${label}-${rowIdx}`}
                    className="flex items-center justify-end pr-2"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-y-visible">
            <div
              ref={timelineOuterRef}
              className={`min-w-0 overflow-y-hidden ${
                embedded ? "overflow-x-hidden" : "overflow-x-auto"
              } ${embedded ? "hide-scrollbar" : ""}`}
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
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => handleBarSelection(barIndex, event)}
                        onContextMenu={(event) => handleBarContextMenu(barIndex, event)}
                        draggable={selected}
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
                          opacity: dragEnabled ? (isActiveDrop ? 0.95 : 0.5) : 0,
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

                {cutBoundaries.map((boundary) => {
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

                {segmentEdits.map((segment, segIndex) => {
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
                    const stringLabel =
                      segment.stringIndex !== null && STRING_LABELS[segment.stringIndex]
                        ? STRING_LABELS[segment.stringIndex]
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
                        {isEditing ? (
                          <div
                            className="flex items-center gap-1"
                            data-cut-edit
                            onBlur={(event) => {
                              if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                              commitSegmentEdit();
                            }}
                          >
                            <select
                              className="h-5 rounded border border-slate-200 bg-white px-1 text-[10px]"
                              value={segmentCoordDraft?.stringIndex ?? ""}
                              onChange={(event) =>
                                setSegmentCoordDraft((prev) =>
                                  prev ? { ...prev, stringIndex: event.target.value } : prev
                                )
                              }
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
                            >
                              <option value="">String</option>
                              {STRING_LABELS.map((label, idx) => (
                                <option key={`seg-${segIndex}-string-${idx}`} value={idx}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              max={maxFret}
                              className="h-5 w-12 rounded border border-slate-200 bg-white px-1 text-[10px]"
                              value={segmentCoordDraft?.fret ?? ""}
                              onChange={(event) =>
                                setSegmentCoordDraft((prev) =>
                                  prev ? { ...prev, fret: event.target.value } : prev
                                )
                              }
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
                          </div>
                        ) : (
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
                                void runMutation(() => gteApi.insertCutAt(editorId, cutTime));
                                return;
                              }
                              startSegmentEdit(segIndex, segment);
                            }}
                          >
                            {stringLabel}
                            {fretLabel}
                          </button>
                        )}
                      </div>
                    );
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
                        onMouseDown={(event) =>
                          startNoteDrag(
                            note.id,
                            note.tab[0],
                            note.tab[1],
                            note.startTime,
                            note.length,
                            event
                          )
                        }
                        onClick={(event) => {
                          if (multiDragMovedRef.current) {
                            multiDragMovedRef.current = false;
                            return;
                          }
                          if (noteDragMovedRef.current) {
                            noteDragMovedRef.current = false;
                          } else {
                            playNotePreview([note.tab[0], note.tab[1]]);
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
                        } ${editingChordId !== null ? "opacity-30 pointer-events-none" : ""}`}
                        style={{
                          top: segment.rowIndex * rowStride + displayString * ROW_HEIGHT + 4,
                          left: segment.inRowStart * scale,
                          width: Math.max(10, segment.length * scale),
                          height: ROW_HEIGHT - 8,
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
                          onDoubleClick={(event) => {
                            if (editingChordId !== null) return;
                            openChordEdit(chord.id, event);
                          }}
                          onClick={(event) => {
                            if (multiDragMovedRef.current) {
                              multiDragMovedRef.current = false;
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
                          } ${isDimmed ? "opacity-30 pointer-events-none" : ""}`}
                          style={{
                            top: segment.rowIndex * rowStride + displayString * ROW_HEIGHT + 4,
                            left: segment.inRowStart * scale,
                            width: Math.max(10, segment.length * scale),
                            height: ROW_HEIGHT - 8,
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
                  noteMenuDraft && (
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
                          <input
                            type="number"
                            min={0}
                            max={maxFret}
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
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
                                {STRING_LABELS[tab[0]]}
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
                                {STRING_LABELS[tab[0]]}
                                {tab[1]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <button
                          type="button"
                          onClick={() => {
                            void runMutation(() => gteApi.deleteNote(editorId, selectedNote.id), {
                              localApply: (draft) => {
                                removeNoteFromSnapshot(draft, selectedNote.id);
                              },
                            });
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
                                {tabs.map((tab) => `${STRING_LABELS[tab[0]]}${tab[1]}`).join(" ")}
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
                            void runMutation(() => gteApi.deleteChord(editorId, selectedChord.id), {
                              localApply: (draft) => {
                                removeChordFromSnapshot(draft, selectedChord.id);
                              },
                            });
                            setSelectedChordIds([]);
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

                {draftNote && draftNoteAnchor && (
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
                      String {STRING_LABELS[draftNote.stringIndex]} @ {draftNote.startTime}
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


      </div>
    </div>
  );
}








