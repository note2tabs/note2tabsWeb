import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { DrumLoopRegion, EditorSnapshot, Note, TimingMapV2 } from "../types/gte";
import { gteApi } from "../lib/gteApi";
import {
  buildDrumNote,
  DRUM_VOICES,
  getDrumVoiceForNote,
  snapDrumFrameToGrid,
} from "../lib/gteDrums";
import { previewDrumVoice } from "../lib/gteDrumPlayback";
import { GTE_GUEST_EDITOR_ID } from "../lib/gteGuestDraft";
import {
  getDrumLoopTimelineFrames,
  materializeDrumLoopNotes,
  normalizeDrumLoops,
  removeNotesCoveredByLoopRepeats,
} from "../lib/gteDrumLoops";
import {
  applyDrumBeatPattern,
  DRUM_BEAT_PATTERNS,
  type DrumBeatPatternId,
} from "../lib/gteDrumPatterns";
import {
  buildTimingBpmSegments,
  formatTimingBpm,
  getTimingBarBpm,
} from "../lib/gteTiming";
import { windowTimelineEvents } from "../lib/gteEditorPerformance";
import {
  GTE_TIMELINE_END_PADDING,
  GTE_TIMELINE_GUTTER_WIDTH,
  GTE_TIMELINE_LABEL_COLUMN_WIDTH,
  getScaledDrumHitSize,
} from "../lib/gteTimelineGeometry";

const FRAMES_PER_BAR = 480;
const LABEL_WIDTH = GTE_TIMELINE_GUTTER_WIDTH;
const VISIBLE_LABEL_WIDTH = GTE_TIMELINE_LABEL_COLUMN_WIDTH;
const ROW_HEIGHT = 28;
const RULER_HEIGHT = 20;
const TIME_RULER_HEIGHT = 18;
const DRAG_THRESHOLD_PX = 4;
const TIMELINE_RENDER_OVERSCAN_PX = 900;

type SelectionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type MarqueeInteraction = {
  kind: "marquee";
  startX: number;
  startY: number;
  baseSelection: Set<number>;
  moved: boolean;
  canAddHit: boolean;
};

type NoteDragInteraction = {
  kind: "notes";
  startClientX: number;
  startClientY: number;
  anchorStartTime: number;
  anchorVoiceIndex: number;
  selectedIds: Set<number>;
  originalNotes: Note[];
  moved: boolean;
};

type LoopInteraction = {
  kind: "loop";
  mode: "move" | "resize-loop" | "resize-source-start" | "resize-source-end";
  startClientX: number;
  originalLoop: DrumLoopRegion;
  originalNotes: Note[];
};

type PointerInteraction = MarqueeInteraction | NoteDragInteraction | LoopInteraction;

type DrumNoteClipboard = {
  anchor: number;
  notes: Array<Pick<Note, "startTime" | "length" | "midiNum" | "tab">>;
};

const DRUM_NOTE_CLIPBOARD_PREFIX = "GTE_DRUM_NOTES_V1:";

type GteDrumWorkspaceProps = {
  canvasId: string;
  laneId: string;
  snapshot: EditorSnapshot;
  timingMap?: TimingMapV2;
  onSnapshotChange: (
    snapshot: EditorSnapshot,
    options?: { recordHistory?: boolean; markDirty?: boolean }
  ) => void;
  isActive: boolean;
  mobileViewport?: boolean;
  onFocusWorkspace?: () => void;
  editMenuPortalTarget?: HTMLElement | null;
  onEditMenuPointerEnter?: () => void;
  onEditMenuPointerLeave?: () => void;
  onSelectionStateChange?: (selection: {
    noteCount: number;
    chordCount: number;
    noteIds: number[];
    chordIds: number[];
  }) => void;
  barSelectionClearEpoch?: number;
  barSelectionClearExemptEditorId?: string | null;
  onBarSelectionStateChange?: (barIndices: number[]) => void;
  onRequestSelectedBarsCopy?: (barIndices: number[]) => void | Promise<void>;
  onRequestSelectedBarsPaste?: (insertIndex: number) => void | Promise<void>;
  onRequestSelectedBarsDelete?: (barIndices: number[]) => void | Promise<void>;
  barClipboardAvailable?: boolean;
  activeBarDrag?: { sourceLaneId: string; barIndices: number[] } | null;
  onBarDragStart?: (barIndices: number[]) => void;
  onBarDragEnd?: () => void;
  onRequestBarDrop?: (insertIndex: number) => void | Promise<void>;
  sharedViewportBarCount?: number;
  sharedTimelineScrollRatio?: number;
  onSharedTimelineScrollRatioChange?: (ratio: number, scrollLeft?: number) => void;
  sharedTimelineBaseScale?: number;
  timelineZoomFactor?: number;
  snapSubdivisionsPerBeat?: number;
  showBarNumbers?: boolean;
  showTimeRuler?: boolean;
  showPlaybackCounter?: boolean;
  globalSnapToGridEnabled?: boolean;
  globalPlaybackFrame?: number;
  getGlobalPlaybackFrame?: () => number;
  globalPlaybackIsPlaying?: boolean;
  globalPlaybackIsPreparing?: boolean;
  globalPlaybackVolume?: number;
  playbackUiVisible?: boolean;
  onGlobalPlaybackToggle?: () => void;
  onGlobalPlaybackVolumeChange?: (volume: number) => void;
  onGlobalPlaybackFrameChange?: (frame: number) => void;
};

const formatTimelineSecondLabel = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

const symbolForVoice = (voiceId: string) => {
  if (voiceId === "cymbal") return "✕";
  if (voiceId === "closed_hi_hat") return "×";
  if (voiceId === "open_hi_hat") return "○";
  if (voiceId === "snare") return "S";
  if (voiceId === "kick") return "K";
  return "B";
};

const shortLabelForVoice = (voiceId: string) => {
  if (voiceId === "cymbal") return "Cymbal";
  if (voiceId === "closed_hi_hat") return "Closed HH";
  if (voiceId === "open_hi_hat") return "Open HH";
  if (voiceId === "bass") return "Bass";
  if (voiceId === "kick") return "Kick";
  if (voiceId === "snare") return "Snare";
  return "Drum";
};

const loopRangesOverlap = (left: DrumLoopRegion, right: DrumLoopRegion) =>
  left.sourceStart < right.loopEnd && right.sourceStart < left.loopEnd;

export default function GteDrumWorkspace({
  canvasId,
  laneId,
  snapshot,
  timingMap,
  onSnapshotChange,
  isActive,
  mobileViewport = false,
  onFocusWorkspace,
  editMenuPortalTarget,
  onEditMenuPointerEnter,
  onEditMenuPointerLeave,
  onSelectionStateChange,
  barSelectionClearEpoch,
  barSelectionClearExemptEditorId,
  onBarSelectionStateChange,
  onRequestSelectedBarsCopy,
  onRequestSelectedBarsPaste,
  onRequestSelectedBarsDelete,
  barClipboardAvailable = false,
  activeBarDrag,
  onBarDragStart,
  onBarDragEnd,
  onRequestBarDrop,
  sharedViewportBarCount,
  sharedTimelineScrollRatio,
  onSharedTimelineScrollRatioChange,
  sharedTimelineBaseScale,
  timelineZoomFactor = 1,
  snapSubdivisionsPerBeat = 4,
  showBarNumbers = true,
  showTimeRuler = true,
  showPlaybackCounter = true,
  globalSnapToGridEnabled = true,
  globalPlaybackFrame = 0,
  getGlobalPlaybackFrame,
  globalPlaybackIsPlaying = false,
  globalPlaybackIsPreparing = false,
  globalPlaybackVolume = 0.6,
  playbackUiVisible = false,
  onGlobalPlaybackToggle,
  onGlobalPlaybackVolumeChange,
  onGlobalPlaybackFrameChange,
}: GteDrumWorkspaceProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const timelineViewportRafRef = useRef<number | null>(null);
  const pendingTimelineViewportRef = useRef<{ scrollLeft: number; clientWidth: number } | null>(null);
  const interactionRef = useRef<PointerInteraction | null>(null);
  const selectedNoteIdsRef = useRef<Set<number>>(new Set());
  const snapshotNotesRef = useRef(snapshot.notes);
  const dragPreviewNotesRef = useRef<Note[] | null>(null);
  const loopPreviewRef = useRef<{ loop: DrumLoopRegion; notes: Note[] } | null>(null);
  const noteClipboardRef = useRef<DrumNoteClipboard | null>(null);
  const [cursor, setCursor] = useState({ time: 0, voiceIndex: 0 });
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<number>>(
    () => new Set()
  );
  const [selectedBarIndices, setSelectedBarIndices] = useState<number[]>([]);
  const [barSelectionAnchor, setBarSelectionAnchor] = useState<number | null>(null);
  const [lastBarInsertIndex, setLastBarInsertIndex] = useState<number | null>(null);
  const [barDropIndex, setBarDropIndex] = useState<number | null>(null);
  const [barContextMenu, setBarContextMenu] = useState<{
    x: number;
    y: number;
    insertIndex: number;
    targetFrame: number;
    selectionActions: boolean;
  } | null>(null);
  const [sampleBeatMenuOpen, setSampleBeatMenuOpen] = useState(false);
  const [noteClipboardAvailable, setNoteClipboardAvailable] = useState(false);
  const [lastClipboardKind, setLastClipboardKind] = useState<"bars" | "notes" | null>(null);
  const [loopContextMenu, setLoopContextMenu] = useState<{
    x: number;
    y: number;
    loopId: string;
  } | null>(null);
  const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null);
  const [editingLoopSourceId, setEditingLoopSourceId] = useState<string | null>(null);
  const [loopPreview, setLoopPreview] = useState<{
    loop: DrumLoopRegion;
    notes: Note[];
  } | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [dragPreviewNotes, setDragPreviewNotes] = useState<Note[] | null>(null);
  const [toolPreviewNotes, setToolPreviewNotes] = useState<Note[] | null>(null);
  const [quantizeDialogOpen, setQuantizeDialogOpen] = useState(false);
  const [quantizeSubdivision, setQuantizeSubdivision] = useState(4);
  const [quantizePreScale, setQuantizePreScale] = useState(1);
  const [quantizeApplyToLength, setQuantizeApplyToLength] = useState(true);
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [scaleMode, setScaleMode] = useState<"length" | "start" | "both">(
    "length"
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timelineViewport, setTimelineViewport] = useState({
    scrollLeft: 0,
    clientWidth: 0,
  });

  const queueTimelineViewportUpdate = useCallback((scrollLeft: number, clientWidth: number) => {
    pendingTimelineViewportRef.current = { scrollLeft, clientWidth };
    if (timelineViewportRafRef.current !== null) return;
    timelineViewportRafRef.current = requestAnimationFrame(() => {
      timelineViewportRafRef.current = null;
      const next = pendingTimelineViewportRef.current;
      pendingTimelineViewportRef.current = null;
      if (!next) return;
      setTimelineViewport((previous) =>
        Math.abs(previous.scrollLeft - next.scrollLeft) < 1 &&
        Math.abs(previous.clientWidth - next.clientWidth) < 1
          ? previous
          : next
      );
    });
  }, []);

  useEffect(() => () => {
    if (timelineViewportRafRef.current !== null) {
      cancelAnimationFrame(timelineViewportRafRef.current);
      timelineViewportRafRef.current = null;
    }
  }, []);
  const tableBacked = canvasId !== GTE_GUEST_EDITOR_ID;
  const editorId = `${canvasId}__ed__${laneId}`;

  const beatsPerBar = Math.max(1, Math.round(Number(snapshot.timeSignature) || 8));
  const fallbackSecondsPerBar =
    Number.isFinite(Number(snapshot.secondsPerBar)) && Number(snapshot.secondsPerBar) > 0
      ? Number(snapshot.secondsPerBar)
      : FRAMES_PER_BAR / Math.max(1, Number(snapshot.fps) || FRAMES_PER_BAR / 2);
  const fallbackBarBpm = (60 * beatsPerBar) / fallbackSecondsPerBar;
  const barBpmTitle = useCallback(
    (barIndex: number) =>
      `Bar ${barIndex + 1} · ${formatTimingBpm(
        getTimingBarBpm(timingMap, barIndex, fallbackBarBpm)
      )} BPM`,
    [fallbackBarBpm, timingMap]
  );
  const selectedBarBpmSegments = useMemo(
    () => buildTimingBpmSegments(timingMap, selectedBarIndices, fallbackBarBpm),
    [fallbackBarBpm, selectedBarIndices, timingMap]
  );
  const subdivisionsPerBeat = Math.max(
    1,
    Math.min(64, Math.round(Number(snapSubdivisionsPerBeat) || 4))
  );
  const subdivisionsPerBar = beatsPerBar * subdivisionsPerBeat;
  const visibleTimeRulerHeight = showTimeRuler ? TIME_RULER_HEIGHT : 0;
  const baseBarCount = Math.max(
    1,
    sharedViewportBarCount ?? 1,
    Math.ceil(Math.max(FRAMES_PER_BAR, snapshot.totalFrames) / FRAMES_PER_BAR)
  );
  const previewBarCount = loopPreview
    ? Math.ceil(loopPreview.loop.loopEnd / FRAMES_PER_BAR)
    : 1;
  const barCount = Math.max(baseBarCount, previewBarCount);
  const totalFrames = barCount * FRAMES_PER_BAR;
  const drumLoops = useMemo(
    () => normalizeDrumLoops(snapshot.drumLoops, totalFrames),
    [snapshot.drumLoops, totalFrames]
  );
  const baseScale =
    sharedTimelineBaseScale !== undefined && Number.isFinite(sharedTimelineBaseScale)
      ? Math.max(0.5, Math.min(4, sharedTimelineBaseScale))
      : 0.5;
  const normalizedZoom = Math.max(0.25, Math.min(4, timelineZoomFactor));
  const pxPerFrame = baseScale * normalizedZoom;
  const barWidth = FRAMES_PER_BAR * pxPerFrame;
  const trackOffsetFrames = Math.max(0, Math.round(Number(snapshot.timelineOffsetFrames) || 0));
  const trackOffsetBarCount = Math.floor(trackOffsetFrames / FRAMES_PER_BAR);
  const trackOffsetWidth = trackOffsetFrames * pxPerFrame;
  const trackOffsetArrowLeft = Math.max(
    LABEL_WIDTH + 10,
    Math.min(
      Math.max(LABEL_WIDTH + 10, LABEL_WIDTH + trackOffsetWidth - 34),
      timelineViewport.scrollLeft + LABEL_WIDTH + Math.max(14, Math.min(48, timelineViewport.clientWidth * 0.08))
    )
  );
  const timelineWidth =
    LABEL_WIDTH + totalFrames * pxPerFrame + GTE_TIMELINE_END_PADDING;
  const timelineRenderWindow = useMemo(() => {
    const viewportWidth = timelineViewport.clientWidth || Math.min(timelineWidth, barWidth * 4);
    const leftPx = Math.max(
      0,
      timelineViewport.scrollLeft - LABEL_WIDTH - TIMELINE_RENDER_OVERSCAN_PX
    );
    const rightPx = Math.max(
      0,
      timelineViewport.scrollLeft + viewportWidth - LABEL_WIDTH + TIMELINE_RENDER_OVERSCAN_PX
    );
    return {
      startFrame: Math.max(0, Math.floor(leftPx / pxPerFrame)),
      endFrame: Math.min(totalFrames, Math.ceil(rightPx / pxPerFrame)),
    };
  }, [barWidth, pxPerFrame, timelineViewport.clientWidth, timelineViewport.scrollLeft, timelineWidth, totalFrames]);
  const gridStep = Math.max(1, FRAMES_PER_BAR / subdivisionsPerBar);
  const drumHitSize = getScaledDrumHitSize(gridStep * pxPerFrame, ROW_HEIGHT);

  useEffect(() => {
    if (!quantizeDialogOpen) setQuantizeSubdivision(subdivisionsPerBeat);
  }, [quantizeDialogOpen, subdivisionsPerBeat]);

  useEffect(() => {
    snapshotNotesRef.current = snapshot.notes;
  }, [snapshot.notes]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const syncViewport = () => {
      const nextScrollLeft = container.scrollLeft;
      const nextClientWidth = container.clientWidth;
      setTimelineViewport((previous) =>
        Math.abs(previous.scrollLeft - nextScrollLeft) < 1 &&
        Math.abs(previous.clientWidth - nextClientWidth) < 1
          ? previous
          : { scrollLeft: nextScrollLeft, clientWidth: nextClientWidth }
      );
    };
    syncViewport();
    const observer = new ResizeObserver(syncViewport);
    observer.observe(container);
    return () => observer.disconnect();
  }, [timelineWidth]);

  const replaceSelection = useCallback((next: Set<number>) => {
    selectedNoteIdsRef.current = next;
    setSelectedNoteIds(next);
  }, []);

  useEffect(() => {
    const validIds = new Set(snapshot.notes.map((note) => note.id));
    const current = selectedNoteIdsRef.current;
    const next = new Set([...current].filter((id) => validIds.has(id)));
    if (next.size === current.size) return;
    replaceSelection(next);
  }, [replaceSelection, snapshot.notes]);

  const selectTrackOnly = useCallback(() => {
    replaceSelection(new Set());
    setSelectedBarIndices([]);
    setBarSelectionAnchor(null);
    setSelectedLoopId(null);
    setEditingLoopSourceId(null);
    setBarContextMenu(null);
    setLoopContextMenu(null);
    onFocusWorkspace?.();
  }, [onFocusWorkspace, replaceSelection]);

  const selectedBarIndexSet = useMemo(
    () => new Set(selectedBarIndices),
    [selectedBarIndices]
  );
  const playbackFps = Math.max(
    1,
    Math.round(FRAMES_PER_BAR / Math.max(0.1, Number(snapshot.secondsPerBar) || 2))
  );
  const timelineSecondMarks = useMemo(() => {
    const totalSeconds = Math.floor(totalFrames / playbackFps);
    const firstSecond = Math.max(0, Math.floor(timelineRenderWindow.startFrame / playbackFps));
    const lastSecond = Math.min(
      totalSeconds,
      Math.ceil(timelineRenderWindow.endFrame / playbackFps)
    );
    return Array.from({ length: Math.max(0, lastSecond - firstSecond + 1) }, (_, offset) => {
      const second = firstSecond + offset;
      return {
        second,
        left: LABEL_WIDTH + second * playbackFps * pxPerFrame,
        isLabel: second % 5 === 0,
      };
    });
  }, [playbackFps, pxPerFrame, timelineRenderWindow, totalFrames]);
  const selectedNoteBarIndices = useMemo(
    () =>
      Array.from(
        new Set(
          snapshot.notes
            .filter((note) => selectedNoteIds.has(note.id))
            .map((note) =>
              Math.max(
                0,
                Math.min(barCount - 1, Math.floor(note.startTime / FRAMES_PER_BAR))
              )
            )
        )
      ).sort((left, right) => left - right),
    [barCount, selectedNoteIds, snapshot.notes]
  );

  const handleBarSelection = useCallback(
    (index: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = Number.isFinite(event.clientX)
        ? event.clientX - rect.left
        : rect.width;
      setLastBarInsertIndex(pointerX < rect.width / 2 ? index : index + 1);
      replaceSelection(new Set());
      setSelectedLoopId(null);
      setEditingLoopSourceId(null);
      setLoopContextMenu(null);
      setBarContextMenu(null);

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
        setSelectedBarIndices(
          Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
        );
        return;
      }
      if (additive) {
        setSelectedBarIndices((current) =>
          current.includes(index)
            ? current
            : [...current, index].sort((left, right) => left - right)
        );
        setBarSelectionAnchor(index);
        return;
      }
      if (selectedBarIndices.length === 1 && selectedBarIndices[0] === index) {
        setSelectedBarIndices([]);
        setBarSelectionAnchor(null);
        return;
      }
      setSelectedBarIndices([index]);
      setBarSelectionAnchor(index);
    },
    [
      barSelectionAnchor,
      isActive,
      mobileViewport,
      replaceSelection,
      selectedBarIndexSet,
      selectedBarIndices,
    ]
  );

  const handleBarContextMenu = useCallback(
    (index: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = Number.isFinite(event.clientX)
        ? event.clientX - rect.left
        : rect.width;
      const insertIndex = pointerX < rect.width / 2 ? index : index + 1;
      setLastBarInsertIndex(insertIndex);
      const notesTakePriority = selectedNoteIdsRef.current.size > 0;
      if (notesTakePriority) {
        setSelectedBarIndices(selectedNoteBarIndices);
        setBarSelectionAnchor(selectedNoteBarIndices[0] ?? null);
      } else if (!selectedBarIndexSet.has(index)) {
        setSelectedBarIndices([index]);
        setBarSelectionAnchor(index);
      }
      setBarContextMenu({
        x: event.clientX,
        y: event.clientY,
        insertIndex,
        targetFrame: Math.max(
          0,
          Math.min(
            totalFrames - 1,
            Math.round((index + Math.max(0, Math.min(1, pointerX / rect.width))) * FRAMES_PER_BAR)
          )
        ),
        selectionActions: true,
      });
      setSampleBeatMenuOpen(false);
    },
    [selectedBarIndexSet, selectedNoteBarIndices, totalFrames]
  );

  const handleNoteContextMenu = useCallback(
    (note: Note, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const selectedIds = selectedNoteIdsRef.current;
      const notesForBars = selectedIds.has(note.id)
        ? snapshot.notes.filter((candidate) => selectedIds.has(candidate.id))
        : [note];
      const barIndices = Array.from(
        new Set(
          notesForBars.map((candidate) =>
            Math.max(0, Math.min(barCount - 1, Math.floor(candidate.startTime / FRAMES_PER_BAR)))
          )
        )
      ).sort((left, right) => left - right);
      const clickedBar = Math.max(
        0,
        Math.min(barCount - 1, Math.floor(note.startTime / FRAMES_PER_BAR))
      );
      const insertIndex = Math.min(barCount, clickedBar + 1);

      if (!selectedIds.has(note.id)) replaceSelection(new Set([note.id]));
      setSelectedBarIndices(barIndices);
      setBarSelectionAnchor(clickedBar);
      setLastBarInsertIndex(insertIndex);
      setSelectedLoopId(null);
      setEditingLoopSourceId(null);
      setLoopContextMenu(null);
      setBarContextMenu({
        x: event.clientX,
        y: event.clientY,
        insertIndex,
        targetFrame: note.startTime,
        selectionActions: true,
      });
      setSampleBeatMenuOpen(false);
      onFocusWorkspace?.();
    },
    [barCount, onFocusWorkspace, replaceSelection, snapshot.notes]
  );

  const handleTrackContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const element = scrollRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const contentX = event.clientX - rect.left + element.scrollLeft - LABEL_WIDTH;
      const boundedFrame = Math.max(0, Math.min(totalFrames - 1, contentX / pxPerFrame));
      const barIndex = Math.max(
        0,
        Math.min(barCount - 1, Math.floor(boundedFrame / FRAMES_PER_BAR))
      );
      const frameWithinBar = boundedFrame - barIndex * FRAMES_PER_BAR;
      const insertIndex = Math.min(
        barCount,
        barIndex + (frameWithinBar >= FRAMES_PER_BAR / 2 ? 1 : 0)
      );
      const notesTakePriority = selectedNoteIdsRef.current.size > 0;

      setLastBarInsertIndex(insertIndex);
      setLoopContextMenu(null);
      if (notesTakePriority) {
        setSelectedBarIndices(selectedNoteBarIndices);
        setBarSelectionAnchor(selectedNoteBarIndices[0] ?? null);
      }
      setBarContextMenu({
        x: event.clientX,
        y: event.clientY,
        insertIndex,
        targetFrame: Math.round(boundedFrame),
        selectionActions: notesTakePriority || selectedBarIndices.length > 0,
      });
      setSampleBeatMenuOpen(false);
      onFocusWorkspace?.();
    },
    [
      barCount,
      onFocusWorkspace,
      pxPerFrame,
      selectedBarIndices.length,
      selectedNoteBarIndices,
      totalFrames,
    ]
  );

  const copySelectedBars = useCallback(() => {
    if (!selectedBarIndices.length) return;
    setLastClipboardKind("bars");
    void onRequestSelectedBarsCopy?.([...selectedBarIndices]);
  }, [onRequestSelectedBarsCopy, selectedBarIndices]);

  const copySelectedNotes = useCallback(async () => {
    const selectedIds = selectedNoteIdsRef.current;
    const selectedNotes = snapshot.notes.filter((note) => selectedIds.has(note.id));
    if (!selectedNotes.length) return;
    const anchor = Math.min(...selectedNotes.map((note) => note.startTime));
    const payload: DrumNoteClipboard = {
      anchor,
      notes: selectedNotes.map((note) => ({
        startTime: note.startTime,
        length: note.length,
        midiNum: note.midiNum,
        tab: [...note.tab],
      })),
    };
    noteClipboardRef.current = payload;
    setNoteClipboardAvailable(true);
    setLastClipboardKind("notes");
    try {
      await navigator.clipboard?.writeText(
        `${DRUM_NOTE_CLIPBOARD_PREFIX}${JSON.stringify(payload)}`
      );
    } catch {
      // The in-memory clipboard remains available when browser permission is denied.
    }
  }, [snapshot.notes]);

  const pasteSelectedBars = useCallback(
    (insertIndex?: number) => {
      if (!barClipboardAvailable || !onRequestSelectedBarsPaste) return;
      const target =
        insertIndex ??
        lastBarInsertIndex ??
        Math.min(barCount, selectedBarIndices[0] ?? 0);
      void onRequestSelectedBarsPaste(target);
    },
    [
      barClipboardAvailable,
      barCount,
      lastBarInsertIndex,
      onRequestSelectedBarsPaste,
      selectedBarIndices,
    ]
  );

  const deleteSelectedBars = useCallback(() => {
    if (!selectedBarIndices.length) return;
    void onRequestSelectedBarsDelete?.([...selectedBarIndices]);
  }, [onRequestSelectedBarsDelete, selectedBarIndices]);

  const commitLoopSnapshot = useCallback(
    async (nextLoops: DrumLoopRegion[], nextNotes: Note[], errorMessage: string) => {
      const nextTotalFrames = getDrumLoopTimelineFrames(
        nextLoops,
        Math.max(snapshot.totalFrames, totalFrames),
        FRAMES_PER_BAR
      );
      const normalizedLoops = normalizeDrumLoops(nextLoops, nextTotalFrames);
      const cleanedNotes = removeNotesCoveredByLoopRepeats(nextNotes, normalizedLoops);
      const nextSnapshot: EditorSnapshot = {
        ...snapshot,
        drumLoops: normalizedLoops,
        notes: cleanedNotes,
        totalFrames: nextTotalFrames,
        updatedAt: new Date().toISOString(),
      };
      onSnapshotChange(nextSnapshot, {
        recordHistory: true,
        markDirty: !tableBacked,
      });
      setSaveError(null);
      if (!tableBacked) return;
      try {
        await gteApi.applySnapshot(editorId, nextSnapshot);
      } catch (error: any) {
        onSnapshotChange(snapshot, { recordHistory: false, markDirty: false });
        setSaveError(error?.message || errorMessage);
      }
    },
    [editorId, onSnapshotChange, snapshot, tableBacked, totalFrames]
  );

  const readNoteClipboard = useCallback(async () => {
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text.startsWith(DRUM_NOTE_CLIPBOARD_PREFIX)) {
          const parsed = JSON.parse(
            text.slice(DRUM_NOTE_CLIPBOARD_PREFIX.length)
          ) as DrumNoteClipboard;
          if (Array.isArray(parsed.notes) && parsed.notes.length) return parsed;
        }
      } catch {
        // Fall back to the in-memory clipboard.
      }
    }
    return noteClipboardRef.current;
  }, []);

  const pasteSelectedNotes = useCallback(
    async (rawTargetFrame: number) => {
      const payload = await readNoteClipboard();
      if (!payload?.notes.length) return;
      const targetFrame = Math.max(
        0,
        Math.min(
          totalFrames - 1,
          globalSnapToGridEnabled
            ? Math.round(rawTargetFrame / gridStep) * gridStep
            : Math.round(rawTargetFrame)
        )
      );
      const nextIds: number[] = [];
      let nextId = snapshot.notes.reduce((maximum, note) => Math.max(maximum, note.id), 0) + 1;
      const pastedNotes = payload.notes.flatMap((clipboardNote) => {
        const startTime = targetFrame + clipboardNote.startTime - payload.anchor;
        if (startTime < 0 || startTime >= totalFrames) return [];
        const voiceIndex = DRUM_VOICES.findIndex(
          (voice) => voice.midi === Number(clipboardNote.midiNum)
        );
        const note = buildDrumNote({
          id: nextId++,
          startTime,
          voiceIndex: voiceIndex >= 0 ? voiceIndex : Number(clipboardNote.tab?.[0]) || 0,
          length: clipboardNote.length,
        });
        nextIds.push(note.id);
        return [note];
      });
      if (!pastedNotes.length) return;

      const pastedKeys = new Set(
        pastedNotes.map((note) => `${getDrumVoiceForNote(note).id}:${note.startTime}`)
      );
      const retainedNotes = snapshot.notes.filter(
        (note) => !pastedKeys.has(`${getDrumVoiceForNote(note).id}:${note.startTime}`)
      );
      const nextLoops = drumLoops.filter(
        (loop) =>
          !pastedNotes.some(
            (note) => note.startTime >= loop.sourceEnd && note.startTime < loop.loopEnd
          )
      );
      replaceSelection(new Set(nextIds));
      setSelectedBarIndices([]);
      setBarSelectionAnchor(null);
      setBarContextMenu(null);
      await commitLoopSnapshot(
        nextLoops,
        [...retainedNotes, ...pastedNotes],
        "Could not paste the selected drum notes."
      );
    },
    [
      commitLoopSnapshot,
      drumLoops,
      globalSnapToGridEnabled,
      gridStep,
      readNoteClipboard,
      replaceSelection,
      snapshot.notes,
      totalFrames,
    ]
  );

  const pasteFromContextMenu = useCallback(
    (menu: NonNullable<typeof barContextMenu>) => {
      if (lastClipboardKind === "notes" && noteClipboardAvailable) {
        void pasteSelectedNotes(menu.targetFrame);
        return;
      }
      pasteSelectedBars(menu.insertIndex);
      setBarContextMenu(null);
    }, [lastClipboardKind, noteClipboardAvailable, pasteSelectedBars, pasteSelectedNotes]
  );

  const applySampleBeat = useCallback(
    (patternId: DrumBeatPatternId) => {
      if (!selectedBarIndices.length) return;
      const selectedRanges = selectedBarIndices.map((barIndex) => ({
        start: barIndex * FRAMES_PER_BAR,
        end: (barIndex + 1) * FRAMES_PER_BAR,
      }));
      const nextLoops = drumLoops.filter(
        (loop) =>
          !selectedRanges.some(
            (range) => range.start < loop.loopEnd && range.end > loop.sourceEnd
          )
      );
      const nextNotes = applyDrumBeatPattern({
        notes: snapshot.notes,
        barIndices: selectedBarIndices,
        patternId,
        beatsPerBar,
        framesPerBar: FRAMES_PER_BAR,
      });
      replaceSelection(new Set());
      setSampleBeatMenuOpen(false);
      setBarContextMenu(null);
      void commitLoopSnapshot(nextLoops, nextNotes, "Could not apply the sample beat.");
    },
    [beatsPerBar, commitLoopSnapshot, drumLoops, replaceSelection, selectedBarIndices, snapshot.notes]
  );

  const createLoopFromSelectedBars = useCallback(() => {
    if (!selectedBarIndices.length) return;
    const firstBar = Math.min(...selectedBarIndices);
    const lastBar = Math.max(...selectedBarIndices);
    const loop: DrumLoopRegion = {
      id:
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `drum-loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceStart: firstBar * FRAMES_PER_BAR,
      sourceEnd: Math.min(totalFrames, (lastBar + 1) * FRAMES_PER_BAR),
      loopEnd: Math.min(totalFrames, (lastBar + 1) * FRAMES_PER_BAR),
    };
    const nextLoops = [...drumLoops.filter((current) => !loopRangesOverlap(current, loop)), loop];
    setSelectedLoopId(loop.id);
    setEditingLoopSourceId(null);
    setSelectedBarIndices([]);
    setBarSelectionAnchor(null);
    setBarContextMenu(null);
    void commitLoopSnapshot(nextLoops, snapshot.notes, "Could not create drum loop.");
  }, [commitLoopSnapshot, drumLoops, selectedBarIndices, snapshot.notes, totalFrames]);

  const deleteLoop = useCallback(
    (loopId: string) => {
      const nextLoops = drumLoops.filter((loop) => loop.id !== loopId);
      setSelectedLoopId((current) => (current === loopId ? null : current));
      setEditingLoopSourceId((current) => (current === loopId ? null : current));
      setLoopContextMenu(null);
      void commitLoopSnapshot(nextLoops, snapshot.notes, "Could not delete drum loop.");
    },
    [commitLoopSnapshot, drumLoops, snapshot.notes]
  );

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
      onBarDragStart?.([...selectedBarIndices]);
    },
    [editorId, onBarDragStart, selectedBarIndexSet, selectedBarIndices]
  );

  const handleBarDrop = useCallback(
    (insertIndex: number, event: ReactDragEvent<HTMLButtonElement>) => {
      if (!activeBarDrag || !onRequestBarDrop) return;
      event.preventDefault();
      setBarDropIndex(null);
      void onRequestBarDrop(insertIndex);
    },
    [activeBarDrag, onRequestBarDrop]
  );

  useEffect(() => {
    onSelectionStateChange?.({
      noteCount: selectedNoteIds.size,
      chordCount: 0,
      noteIds: [...selectedNoteIds],
      chordIds: [],
    });
  }, [onSelectionStateChange, selectedNoteIds]);

  useEffect(() => {
    onBarSelectionStateChange?.([...selectedBarIndices]);
  }, [onBarSelectionStateChange, selectedBarIndices]);

  useEffect(() => {
    if (!barSelectionClearEpoch) return;
    if (
      barSelectionClearExemptEditorId &&
      barSelectionClearExemptEditorId === editorId
    ) {
      return;
    }
    setSelectedBarIndices([]);
    setBarSelectionAnchor(null);
    setLastBarInsertIndex(null);
    setBarContextMenu(null);
  }, [barSelectionClearEpoch, barSelectionClearExemptEditorId, editorId]);

  useEffect(() => {
    if (activeBarDrag) return;
    setBarDropIndex(null);
  }, [activeBarDrag]);

  useEffect(() => {
    if (!barContextMenu) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-drum-bar-context='true']")) return;
      setBarContextMenu(null);
    };
    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [barContextMenu]);

  useEffect(() => {
    if (!loopContextMenu) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-drum-loop-context='true']")) return;
      setLoopContextMenu(null);
    };
    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [loopContextMenu]);

  const startLoopInteraction = useCallback(
    (
      loop: DrumLoopRegion,
      mode: LoopInteraction["mode"],
      event: ReactPointerEvent<HTMLElement>
    ) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedLoopId(loop.id);
      setLoopContextMenu(null);
      replaceSelection(new Set());
      setSelectedBarIndices([]);
      setBarSelectionAnchor(null);
      loopPreviewRef.current = { loop, notes: snapshot.notes };
      setLoopPreview({ loop, notes: snapshot.notes });
      interactionRef.current = {
        kind: "loop",
        mode,
        startClientX: event.clientX,
        originalLoop: loop,
        originalNotes: snapshot.notes,
      };
    },
    [replaceSelection, snapshot.notes]
  );

  const snapTime = useCallback(
    (time: number) => {
      const clamped = Math.max(trackOffsetFrames, Math.min(totalFrames - 1, time));
      if (!globalSnapToGridEnabled) return Math.round(clamped);
      const snapped = snapDrumFrameToGrid(
        clamped,
        beatsPerBar,
        subdivisionsPerBeat,
        FRAMES_PER_BAR
      );
      if (snapped < totalFrames) return snapped;
      return snapDrumFrameToGrid(
        Math.max(trackOffsetFrames, totalFrames - gridStep),
        beatsPerBar,
        subdivisionsPerBeat,
        FRAMES_PER_BAR
      );
    },
    [beatsPerBar, globalSnapToGridEnabled, gridStep, subdivisionsPerBeat, totalFrames, trackOffsetFrames]
  );

  const updateSnapshotNotes = useCallback(
    (
      notes: Note[],
      options?: { recordHistory?: boolean; markDirty?: boolean }
    ) => {
      const cleanedNotes = removeNotesCoveredByLoopRepeats(notes, drumLoops);
      onSnapshotChange(
        {
          ...snapshot,
          editorType: "drums",
          type: "drums",
          trackType: "drums",
          notes: cleanedNotes,
          totalFrames: Math.max(
            snapshot.totalFrames,
            Math.ceil(
              Math.max(
                FRAMES_PER_BAR,
                ...cleanedNotes.map((note) => note.startTime + note.length)
              ) / FRAMES_PER_BAR
            ) * FRAMES_PER_BAR
          ),
          chords: [],
          noteEffects: [],
          updatedAt: new Date().toISOString(),
        },
        {
          recordHistory: options?.recordHistory ?? true,
          markDirty: options?.markDirty ?? !tableBacked,
        }
      );
    },
    [drumLoops, onSnapshotChange, snapshot, tableBacked]
  );

  const addHit = useCallback(
    async (voiceIndex: number, rawTime: number) => {
      const startTime = snapTime(rawTime);
      const voice = DRUM_VOICES[voiceIndex] ?? DRUM_VOICES[0];
      const duplicate = snapshot.notes.find(
        (note) =>
          getDrumVoiceForNote(note).id === voice.id &&
          Math.round(note.startTime) === startTime
      );
      if (duplicate) {
        replaceSelection(new Set([duplicate.id]));
        return;
      }

      const note = buildDrumNote({
        id: snapshot.notes.reduce((max, item) => Math.max(max, item.id), 0) + 1,
        startTime,
        voiceIndex,
        length: Math.max(1, Math.min(gridStep, 60)),
      });
      const previousNotes = snapshot.notes;
      updateSnapshotNotes([...previousNotes, note]);
      replaceSelection(new Set([note.id]));
      setCursor({ time: startTime, voiceIndex });
      setSaveError(null);
      void previewDrumVoice(voice.id).catch(() => {});
      if (!tableBacked) return;
      try {
        await gteApi.saveDrumNote(canvasId, laneId, note);
      } catch (error: any) {
        updateSnapshotNotes(previousNotes, { recordHistory: false, markDirty: false });
        setSaveError(error?.message || "We could not save this drum hit. The rest of the pattern is unchanged; please try again.");
      }
    },
    [
      canvasId,
      gridStep,
      laneId,
      replaceSelection,
      snapTime,
      snapshot.notes,
      tableBacked,
      updateSnapshotNotes,
    ]
  );

  const deleteHits = useCallback(
    async (noteIds: Iterable<number>) => {
      const ids = new Set(noteIds);
      const previousNotes = snapshot.notes;
      if (!previousNotes.some((note) => ids.has(note.id))) return;
      updateSnapshotNotes(previousNotes.filter((note) => !ids.has(note.id)));
      replaceSelection(
        new Set([...selectedNoteIdsRef.current].filter((id) => !ids.has(id)))
      );
      setSaveError(null);
      if (!tableBacked) return;
      try {
        await Promise.all(
          [...ids].map((noteId) =>
            gteApi.deleteDrumNote(canvasId, laneId, noteId)
          )
        );
      } catch (error: any) {
        updateSnapshotNotes(previousNotes, { recordHistory: false, markDirty: false });
        replaceSelection(ids);
        setSaveError(error?.message || "We could not remove this drum hit. It is still in the pattern; please try again.");
      }
    },
    [
      canvasId,
      laneId,
      replaceSelection,
      snapshot.notes,
      tableBacked,
      updateSnapshotNotes,
    ]
  );

  const pointerPosition = useCallback(
    (clientX: number, clientY: number) => {
      const container = scrollRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left + container.scrollLeft - LABEL_WIDTH;
      const y = clientY - rect.top - RULER_HEIGHT;
      if (x < 0 || y < 0) return null;
      return {
        time: snapTime(x / pxPerFrame),
        voiceIndex: Math.max(
          0,
          Math.min(DRUM_VOICES.length - 1, Math.floor(y / ROW_HEIGHT))
        ),
      };
    },
    [pxPerFrame, snapTime]
  );

  const pointerContentPoint = useCallback(
    (clientX: number, clientY: number) => {
      const container = scrollRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      return {
        x: Math.max(
          0,
          Math.min(totalFrames * pxPerFrame, clientX - rect.left + container.scrollLeft - LABEL_WIDTH)
        ),
        y: Math.max(
          0,
          Math.min(
            ROW_HEIGHT * DRUM_VOICES.length,
            clientY - rect.top - RULER_HEIGHT
          )
        ),
      };
    },
    [pxPerFrame, totalFrames]
  );

  const persistMovedNotes = useCallback(
    async (nextNotes: Note[], movedIds: Set<number>, previousNotes: Note[]) => {
      updateSnapshotNotes(nextNotes);
      setSaveError(null);
      if (!tableBacked) return;
      try {
        await gteApi.saveDrumNotes(
          canvasId,
          laneId,
          nextNotes.filter((note) => movedIds.has(note.id))
        );
      } catch (error: any) {
        updateSnapshotNotes(previousNotes, { recordHistory: false, markDirty: false });
        setSaveError(error?.message || "We could not move the selected drum hits. Their previous positions are unchanged; please try again.");
      }
    },
    [canvasId, laneId, tableBacked, updateSnapshotNotes]
  );

  const getSelectedToolNotes = useCallback(
    () =>
      snapshot.notes.filter((note) =>
        selectedNoteIdsRef.current.has(note.id)
      ),
    [snapshot.notes]
  );

  const previewQuantize = useCallback(
    (
      subdivisionValue = quantizeSubdivision,
      preScaleValue = quantizePreScale,
      applyToLength = quantizeApplyToLength
    ) => {
      const selected = getSelectedToolNotes();
      if (!selected.length) return false;
      const subdivisions = Math.max(
        1,
        Math.min(64, Math.round(Number(subdivisionValue) || 4))
      );
      const preScale = Math.max(
        0.01,
        Math.min(16, Number(preScaleValue) || 1)
      );
      const minTime = Math.min(...selected.map((note) => note.startTime));
      const gridFrames = Math.max(
        1,
        FRAMES_PER_BAR / (beatsPerBar * subdivisions)
      );
      const selectedIds = selectedNoteIdsRef.current;
      setToolPreviewNotes(
        snapshot.notes.map((note) => {
          if (!selectedIds.has(note.id)) return note;
          const scaledStart =
            minTime + (note.startTime - minTime) * preScale;
          const startTime = Math.max(
            0,
            Math.round(Math.round(scaledStart / gridFrames) * gridFrames)
          );
          const scaledLength = Math.max(1, note.length * preScale);
          const length = applyToLength
            ? Math.max(
                1,
                Math.round(Math.round(scaledLength / gridFrames) * gridFrames)
              )
            : Math.max(1, Math.round(note.length));
          return { ...note, startTime, length };
        })
      );
      return true;
    },
    [
      beatsPerBar,
      getSelectedToolNotes,
      quantizeApplyToLength,
      quantizePreScale,
      quantizeSubdivision,
      snapshot.notes,
    ]
  );

  const openQuantizeTool = useCallback(() => {
    if (!getSelectedToolNotes().length) {
      setSaveError("Select at least one drum note before using Quantize.");
      return;
    }
    setSaveError(null);
    setScaleDialogOpen(false);
    setQuantizeDialogOpen(true);
    previewQuantize();
  }, [getSelectedToolNotes, previewQuantize]);

  const previewScale = useCallback(
    (factorValue = scaleFactor, mode = scaleMode) => {
      const selected = getSelectedToolNotes();
      if (!selected.length) return false;
      const factor = Math.max(0.01, Math.min(16, Number(factorValue) || 1));
      const minTime = Math.min(...selected.map((note) => note.startTime));
      const selectedIds = selectedNoteIdsRef.current;
      setToolPreviewNotes(
        snapshot.notes.map((note) => {
          if (!selectedIds.has(note.id)) return note;
          const startTime =
            mode === "start" || mode === "both"
              ? Math.max(
                  0,
                  Math.round(
                    minTime + (note.startTime - minTime) * factor
                  )
                )
              : note.startTime;
          const length =
            mode === "length" || mode === "both"
              ? Math.max(1, Math.round(note.length * factor))
              : note.length;
          return { ...note, startTime, length };
        })
      );
      return true;
    },
    [getSelectedToolNotes, scaleFactor, scaleMode, snapshot.notes]
  );

  const openScaleTool = useCallback(() => {
    if (!getSelectedToolNotes().length) {
      setSaveError("Select at least one drum note before using Scale.");
      return;
    }
    setSaveError(null);
    setQuantizeDialogOpen(false);
    setScaleDialogOpen(true);
    previewScale();
  }, [getSelectedToolNotes, previewScale]);

  const closeTransformTools = useCallback(() => {
    setQuantizeDialogOpen(false);
    setScaleDialogOpen(false);
    setToolPreviewNotes(null);
  }, []);

  const commitTransformTool = useCallback(() => {
    const preview = toolPreviewNotes;
    if (!preview) {
      closeTransformTools();
      return;
    }
    const ids = new Set(selectedNoteIdsRef.current);
    closeTransformTools();
    void persistMovedNotes(preview, ids, snapshot.notes);
  }, [
    closeTransformTools,
    persistMovedNotes,
    snapshot.notes,
    toolPreviewNotes,
  ]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      if (interaction.kind === "loop") {
        const rawDelta = Math.round((event.clientX - interaction.startClientX) / pxPerFrame);
        const minimumLength = Math.max(1, globalSnapToGridEnabled ? gridStep : 1);
        const snapBoundary = (frame: number) =>
          globalSnapToGridEnabled ? Math.round(frame / gridStep) * gridStep : Math.round(frame);
        let nextLoop = { ...interaction.originalLoop };
        let nextNotes = interaction.originalNotes;

        if (interaction.mode === "move") {
          const delta = Math.max(
            trackOffsetFrames - interaction.originalLoop.sourceStart,
            Math.min(totalFrames - interaction.originalLoop.loopEnd, rawDelta)
          );
          nextLoop = {
            ...nextLoop,
            sourceStart: nextLoop.sourceStart + delta,
            sourceEnd: nextLoop.sourceEnd + delta,
            loopEnd: nextLoop.loopEnd + delta,
          };
          const sourceIds = new Set(
            interaction.originalNotes
              .filter(
                (note) =>
                  note.startTime >= interaction.originalLoop.sourceStart &&
                  note.startTime < interaction.originalLoop.sourceEnd
              )
              .map((note) => note.id)
          );
          const movedSource = interaction.originalNotes
            .filter((note) => sourceIds.has(note.id))
            .map((note) => ({ ...note, startTime: note.startTime + delta }));
          nextNotes = [
            ...interaction.originalNotes.filter(
              (note) =>
                !sourceIds.has(note.id) &&
                (note.startTime < nextLoop.sourceStart || note.startTime >= nextLoop.loopEnd)
            ),
            ...movedSource,
          ];
        } else if (interaction.mode === "resize-loop") {
          nextLoop.loopEnd = Math.max(
            nextLoop.sourceEnd,
            snapBoundary(interaction.originalLoop.loopEnd + rawDelta)
          );
        } else if (interaction.mode === "resize-source-start") {
          nextLoop.sourceStart = Math.max(
            trackOffsetFrames,
            Math.min(
              nextLoop.sourceEnd - minimumLength,
              snapBoundary(interaction.originalLoop.sourceStart + rawDelta)
            )
          );
        } else {
          nextLoop.sourceEnd = Math.max(
            nextLoop.sourceStart + minimumLength,
            Math.min(
              nextLoop.loopEnd,
              snapBoundary(interaction.originalLoop.sourceEnd + rawDelta)
            )
          );
        }

        nextNotes = removeNotesCoveredByLoopRepeats(nextNotes, [nextLoop]);
        const preview = { loop: nextLoop, notes: nextNotes };
        loopPreviewRef.current = preview;
        setLoopPreview(preview);
        return;
      }

      if (interaction.kind === "marquee") {
        const point = pointerContentPoint(event.clientX, event.clientY);
        if (!point) return;
        const distance = Math.hypot(
          point.x - interaction.startX,
          point.y - interaction.startY
        );
        if (distance >= DRAG_THRESHOLD_PX) interaction.moved = true;
        if (!interaction.moved) return;

        const left = Math.min(interaction.startX, point.x);
        const right = Math.max(interaction.startX, point.x);
        const top = Math.min(interaction.startY, point.y);
        const bottom = Math.max(interaction.startY, point.y);
        setSelectionBox({
          left: LABEL_WIDTH + left,
          top: RULER_HEIGHT + top,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top),
        });

        const inside = snapshotNotesRef.current
          .filter((note) => {
            const voice = getDrumVoiceForNote(note);
            const voiceIndex = DRUM_VOICES.findIndex(
              (candidate) => candidate.id === voice.id
            );
            const centerX = (note.startTime + gridStep / 2) * pxPerFrame;
            const centerY = voiceIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
            return (
              centerX >= left &&
              centerX <= right &&
              centerY >= top &&
              centerY <= bottom
            );
          })
          .map((note) => note.id);
        replaceSelection(new Set([...interaction.baseSelection, ...inside]));
        return;
      }

      const deltaX = event.clientX - interaction.startClientX;
      const deltaY = event.clientY - interaction.startClientY;
      if (Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
        interaction.moved = true;
      }
      if (!interaction.moved) return;

      let timeDelta =
        snapTime(interaction.anchorStartTime + deltaX / pxPerFrame) -
        interaction.anchorStartTime;
      let voiceDelta = Math.round(deltaY / ROW_HEIGHT);
      const selectedOriginal = interaction.originalNotes.filter((note) =>
        interaction.selectedIds.has(note.id)
      );
      const selectedVoiceIndexes = selectedOriginal.map((note) => {
        const voice = getDrumVoiceForNote(note);
        return Math.max(
          0,
          DRUM_VOICES.findIndex((candidate) => candidate.id === voice.id)
        );
      });
      const minStart = Math.min(
        ...selectedOriginal.map((note) => note.startTime)
      );
      const maxStart = Math.max(
        ...selectedOriginal.map((note) => note.startTime)
      );
      timeDelta = Math.max(
        trackOffsetFrames - minStart,
        Math.min(totalFrames - gridStep - maxStart, timeDelta)
      );
      voiceDelta = Math.max(
        -Math.min(...selectedVoiceIndexes),
        Math.min(
          DRUM_VOICES.length - 1 - Math.max(...selectedVoiceIndexes),
          voiceDelta
        )
      );

      const preview = interaction.originalNotes.map((note) => {
        if (!interaction.selectedIds.has(note.id)) return note;
        const voice = getDrumVoiceForNote(note);
        const originalVoiceIndex = Math.max(
          0,
          DRUM_VOICES.findIndex((candidate) => candidate.id === voice.id)
        );
        return buildDrumNote({
          id: note.id,
          startTime: Math.max(trackOffsetFrames, note.startTime + timeDelta),
          voiceIndex: originalVoiceIndex + voiceDelta,
          length: note.length,
        });
      });
      dragPreviewNotesRef.current = preview;
      setDragPreviewNotes(preview);
      setCursor({
        time: Math.max(trackOffsetFrames, interaction.anchorStartTime + timeDelta),
        voiceIndex: interaction.anchorVoiceIndex + voiceDelta,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      interactionRef.current = null;
      setSelectionBox(null);

      if (interaction.kind === "loop") {
        const preview = loopPreviewRef.current;
        loopPreviewRef.current = null;
        setLoopPreview(null);
        if (!preview) return;
        const nextLoops = [
          ...drumLoops.filter(
            (loop) => loop.id !== preview.loop.id && !loopRangesOverlap(loop, preview.loop)
          ),
          preview.loop,
        ];
        void commitLoopSnapshot(nextLoops, preview.notes, "Could not update drum loop.");
        return;
      }

      if (interaction.kind === "marquee") {
        if (!interaction.moved && interaction.canAddHit) {
          const position = pointerPosition(event.clientX, event.clientY);
          if (position) void addHit(position.voiceIndex, position.time);
        }
        return;
      }

      const preview = dragPreviewNotesRef.current;
      dragPreviewNotesRef.current = null;
      setDragPreviewNotes(null);
      if (interaction.moved && preview) {
        void persistMovedNotes(
          preview,
          interaction.selectedIds,
          interaction.originalNotes
        );
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [
    addHit,
    gridStep,
    persistMovedNotes,
    pointerContentPoint,
    pointerPosition,
    pxPerFrame,
    replaceSelection,
    snapTime,
    totalFrames,
    trackOffsetFrames,
  ]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || sharedTimelineScrollRatio === undefined || onSharedTimelineScrollRatioChange) return;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const next = maxScroll * Math.max(0, Math.min(1, sharedTimelineScrollRatio));
    if (Math.abs(container.scrollLeft - next) < 1) return;
    syncingScrollRef.current = true;
    container.scrollLeft = next;
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, [onSharedTimelineScrollRatioChange, sharedTimelineScrollRatio, timelineWidth]);

  useEffect(() => {
    const applyFrame = () => {
      const frame = Math.max(
        0,
        Math.min(totalFrames, getGlobalPlaybackFrame?.() ?? globalPlaybackFrame)
      );
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${LABEL_WIDTH + frame * pxPerFrame}px)`;
      }
    };
    applyFrame();
    if (!globalPlaybackIsPlaying) return;
    let raf = 0;
    const tick = () => {
      applyFrame();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    getGlobalPlaybackFrame,
    globalPlaybackFrame,
    globalPlaybackIsPlaying,
    pxPerFrame,
    totalFrames,
  ]);

  useEffect(() => {
    if (!isActive || mobileViewport) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.key === "Escape" && (quantizeDialogOpen || scaleDialogOpen)) {
        event.preventDefault();
        closeTransformTools();
        return;
      }
      if (event.key === "Enter" && (quantizeDialogOpen || scaleDialogOpen)) {
        event.preventDefault();
        commitTransformTool();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (selectedNoteIdsRef.current.size > 0) {
          event.preventDefault();
          void copySelectedNotes();
          return;
        }
        if (!selectedBarIndices.length || !onRequestSelectedBarsCopy) return;
        event.preventDefault();
        copySelectedBars();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        if (lastClipboardKind === "notes" && noteClipboardAvailable) {
          event.preventDefault();
          void pasteSelectedNotes(cursor.time);
          return;
        }
        if (!barClipboardAvailable || !onRequestSelectedBarsPaste) return;
        event.preventDefault();
        pasteSelectedBars();
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        openScaleTool();
        return;
      }
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        replaceSelection(new Set(snapshot.notes.map((note) => note.id)));
        return;
      }
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= DRUM_VOICES.length) {
        event.preventDefault();
        void addHit(digit - 1, cursor.time);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? -gridStep : gridStep;
        setCursor((current) => ({ ...current, time: snapTime(current.time + delta) }));
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const delta = event.key === "ArrowUp" ? -1 : 1;
        setCursor((current) => ({
          ...current,
          voiceIndex: Math.max(
            0,
            Math.min(DRUM_VOICES.length - 1, current.voiceIndex + delta)
          ),
        }));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void addHit(cursor.voiceIndex, cursor.time);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        onGlobalPlaybackToggle?.();
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedNoteIdsRef.current.size > 0
      ) {
        event.preventDefault();
        void deleteHits(selectedNoteIdsRef.current);
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedBarIndices.length > 0 &&
        onRequestSelectedBarsDelete
      ) {
        event.preventDefault();
        deleteSelectedBars();
        return;
      }
      if (event.key === "Escape") {
        replaceSelection(new Set());
        setSelectedBarIndices([]);
        setBarSelectionAnchor(null);
        setBarContextMenu(null);
        setSelectedLoopId(null);
        setEditingLoopSourceId(null);
        setLoopContextMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addHit,
    commitLoopSnapshot,
    drumLoops,
    globalSnapToGridEnabled,
    barClipboardAvailable,
    copySelectedNotes,
    copySelectedBars,
    cursor.time,
    cursor.voiceIndex,
    closeTransformTools,
    commitTransformTool,
    deleteHits,
    deleteSelectedBars,
    gridStep,
    isActive,
    lastClipboardKind,
    mobileViewport,
    noteClipboardAvailable,
    onGlobalPlaybackToggle,
    onRequestSelectedBarsCopy,
    onRequestSelectedBarsDelete,
    onRequestSelectedBarsPaste,
    openScaleTool,
    pasteSelectedBars,
    pasteSelectedNotes,
    quantizeDialogOpen,
    replaceSelection,
    scaleDialogOpen,
    selectedBarIndices.length,
    snapTime,
    snapshot.notes,
  ]);

  const gridLines = useMemo(() => {
    const lines: Array<{
      frame: number;
      kind: "subdivision" | "beat" | "bar";
    }> = [];
    const firstBar = Math.max(0, Math.floor(timelineRenderWindow.startFrame / FRAMES_PER_BAR));
    const lastBar = Math.min(
      barCount - 1,
      Math.floor(timelineRenderWindow.endFrame / FRAMES_PER_BAR)
    );
    for (let barIndex = firstBar; barIndex <= lastBar; barIndex += 1) {
      for (
        let subdivisionIndex = 0;
        subdivisionIndex < subdivisionsPerBar;
        subdivisionIndex += 1
      ) {
        lines.push({
          frame:
            barIndex * FRAMES_PER_BAR +
            (subdivisionIndex * FRAMES_PER_BAR) / subdivisionsPerBar,
          kind:
            subdivisionIndex === 0
              ? "bar"
              : subdivisionIndex % subdivisionsPerBeat === 0
                ? "beat"
                : "subdivision",
        });
      }
    }
    if (
      totalFrames >= timelineRenderWindow.startFrame &&
      totalFrames <= timelineRenderWindow.endFrame
    ) {
      lines.push({ frame: totalFrames, kind: "bar" });
    }
    return lines;
  }, [barCount, subdivisionsPerBar, subdivisionsPerBeat, timelineRenderWindow, totalFrames]);

  const visualLoops = useMemo(() => {
    if (!loopPreview) return drumLoops;
    return [
      ...drumLoops.filter(
        (loop) => loop.id !== loopPreview.loop.id && !loopRangesOverlap(loop, loopPreview.loop)
      ),
      loopPreview.loop,
    ];
  }, [drumLoops, loopPreview]);

  const materializedNotes = useMemo(
    () =>
      materializeDrumLoopNotes(
        loopPreview?.notes ?? toolPreviewNotes ?? dragPreviewNotes ?? snapshot.notes,
        visualLoops,
        totalFrames
      ),
    [dragPreviewNotes, loopPreview, snapshot.notes, toolPreviewNotes, totalFrames, visualLoops]
  );
  const visibleMaterializedNotes = useMemo(() => {
    const visibleNotes = new Set(
      windowTimelineEvents(materializedNotes.map((item) => item.note), timelineRenderWindow)
    );
    return materializedNotes.filter(
      (item) =>
        visibleNotes.has(item.note) || (!item.virtual && selectedNoteIds.has(item.note.id))
    );
  }, [materializedNotes, selectedNoteIds, timelineRenderWindow]);
  const visibleBarIndices = useMemo(() => {
    const first = Math.max(0, Math.floor(timelineRenderWindow.startFrame / FRAMES_PER_BAR));
    const last = Math.min(barCount - 1, Math.floor(timelineRenderWindow.endFrame / FRAMES_PER_BAR));
    const indexes = Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => first + offset);
    selectedBarIndices.forEach((index) => {
      if (index >= 0 && index < barCount && !indexes.includes(index)) indexes.push(index);
    });
    return indexes.sort((left, right) => left - right);
  }, [barCount, selectedBarIndices, timelineRenderWindow]);
  const visibleBarDropIndices = useMemo(() => {
    const first = Math.max(0, Math.floor(timelineRenderWindow.startFrame / FRAMES_PER_BAR));
    const last = Math.min(barCount, Math.ceil(timelineRenderWindow.endFrame / FRAMES_PER_BAR));
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => first + offset);
  }, [barCount, timelineRenderWindow]);
  const visibleLoops = useMemo(
    () =>
      visualLoops.filter(
        (loop) =>
          loop.id === selectedLoopId ||
          (loop.loopEnd >= timelineRenderWindow.startFrame &&
            loop.sourceStart <= timelineRenderWindow.endFrame)
      ),
    [selectedLoopId, timelineRenderWindow, visualLoops]
  );

  return (
    <div
      data-gte-track="true"
      data-gte-timeline-control="true"
      className={`relative space-y-2 overflow-hidden rounded-xl border bg-white p-2 ${
        isActive ? "border-sky-300 ring-1 ring-sky-100" : "border-slate-200"
      }`}
      onMouseDown={onFocusWorkspace}
    >
      {editMenuPortalTarget
        ? createPortal(
            <div
              onMouseEnter={onEditMenuPointerEnter}
              onMouseLeave={onEditMenuPointerLeave}
            >
              <div className="border-b border-slate-200 py-1">
                <div className="px-2 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Drum notes
                </div>
                <button
                  type="button"
                  onClick={openQuantizeTool}
                  disabled={selectedNoteIds.size === 0}
                  className="flex h-7 w-full items-center rounded-md px-2 text-left text-[11px] text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
                >
                  Quantize
                </button>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 px-1">
                  <select
                    value={scaleMode}
                    onChange={(event) => {
                      const mode = event.target.value as
                        | "length"
                        | "start"
                        | "both";
                      setScaleMode(mode);
                      if (scaleDialogOpen) previewScale(scaleFactor, mode);
                    }}
                    className="h-7 min-w-0 rounded-md border-0 bg-transparent px-1 text-[11px] text-slate-700 hover:bg-slate-100"
                    aria-label="Drum scale mode"
                  >
                    <option value="length">Length scaling</option>
                    <option value="start">Start-time scaling</option>
                    <option value="both">Start + length</option>
                  </select>
                  <button
                    type="button"
                    onClick={openScaleTool}
                    disabled={selectedNoteIds.size === 0}
                    className="h-7 rounded-md px-2 text-[11px] text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
                    title="Scale selected drum notes - Shortcut: S"
                  >
                    S&nbsp; Scale
                  </button>
                </div>
              </div>
            </div>,
            editMenuPortalTarget
          )
        : null}
      {saveError && (
        <div className="absolute right-2 top-1 z-40 rounded bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
          {saveError}
        </div>
      )}
      {barContextMenu && (
        <div
          data-drum-bar-context="true"
          className="fixed z-[9999] w-52 rounded-md border border-slate-200 bg-white/95 py-1 text-xs shadow-lg backdrop-blur"
          style={{ left: barContextMenu.x, top: barContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="border-b border-slate-100 px-3 py-2 text-slate-600">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Tempo
            </div>
            {selectedBarBpmSegments.map((segment) => {
              const barLabel =
                segment.startBarIndex === segment.endBarIndex
                  ? `Bar ${segment.startBarIndex + 1}`
                  : `Bars ${segment.startBarIndex + 1}–${segment.endBarIndex + 1}`;
              return (
                <div
                  key={`${segment.startBarIndex}-${segment.endBarIndex}-${formatTimingBpm(segment.bpm)}`}
                  className="flex items-center justify-between gap-2 py-0.5"
                >
                  <span>{barLabel}</span>
                  <span className="font-semibold text-slate-800">
                    {formatTimingBpm(segment.bpm)} BPM
                  </span>
                </div>
              );
            })}
          </div>
          {barContextMenu.selectionActions && (
            <>
              <button
                type="button"
                onClick={createLoopFromSelectedBars}
                disabled={!selectedBarIndices.length}
                className="flex w-full px-3 py-2 text-left font-semibold text-sky-700 hover:bg-sky-50 disabled:text-slate-400"
              >
                Loop
              </button>
              <button
                type="button"
                onClick={() => setSampleBeatMenuOpen((open) => !open)}
                disabled={!selectedBarIndices.length}
                aria-expanded={sampleBeatMenuOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-left font-semibold text-violet-700 hover:bg-violet-50 disabled:text-slate-400"
              >
                <span>Sample beat</span>
                <span aria-hidden="true">{sampleBeatMenuOpen ? "v" : ">"}</span>
              </button>
              {sampleBeatMenuOpen && (
                <div className="mx-1 rounded border border-violet-100 bg-violet-50/50 py-1">
                  {DRUM_BEAT_PATTERNS.map((pattern) => (
                    <button
                      key={pattern.id}
                      type="button"
                      onClick={() => applySampleBeat(pattern.id)}
                      title={pattern.description}
                      className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-violet-100"
                    >
                      {pattern.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="mx-2 my-1 border-t border-slate-200" />
              <button
                type="button"
                onClick={() => {
                  if (selectedNoteIds.size > 0) {
                    void copySelectedNotes();
                  } else {
                    copySelectedBars();
                  }
                  setBarContextMenu(null);
                }}
                disabled={selectedNoteIds.size === 0 && selectedBarIndices.length === 0}
                className="flex w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
              >
                {selectedNoteIds.size > 0 ? "Copy notes" : "Copy bars"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => pasteFromContextMenu(barContextMenu)}
            disabled={!barClipboardAvailable && !noteClipboardAvailable}
            className="flex w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
          >
            {lastClipboardKind === "notes" && noteClipboardAvailable
              ? "Paste notes"
              : "Paste bars"}
          </button>
          {barContextMenu.selectionActions && (
            <button
              type="button"
              onClick={() => {
                if (selectedNoteIds.size > 0) {
                  void deleteHits(selectedNoteIds);
                } else {
                  deleteSelectedBars();
                }
                setBarContextMenu(null);
              }}
              disabled={selectedNoteIds.size === 0 && selectedBarIndices.length === 0}
              className="flex w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50 disabled:text-slate-400"
            >
              {selectedNoteIds.size > 0 ? "Delete notes" : "Delete bars"}
            </button>
          )}
        </div>
      )}
      {loopContextMenu && (() => {
        const loop = drumLoops.find((entry) => entry.id === loopContextMenu.loopId);
        if (!loop) return null;
        return (
          <div
            data-drum-loop-context="true"
            className="fixed z-[9999] w-48 rounded-md border border-slate-200 bg-white/95 py-1 text-xs shadow-lg backdrop-blur"
            style={{ left: loopContextMenu.x, top: loopContextMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedLoopId(loop.id);
                setEditingLoopSourceId(loop.id);
                setLoopContextMenu(null);
              }}
              className="flex w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
            >
              Change selected section
            </button>
            <button
              type="button"
              onClick={() => deleteLoop(loop.id)}
              className="flex w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50"
            >
              Delete loop
            </button>
          </div>
        );
      })()}
      <div
        className={`flex h-8 items-center border-b px-2 transition-colors ${
          isActive ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50"
        }`}
      >
        <button
          type="button"
          data-drum-track-selector="true"
          aria-label="Select drum track for editing"
          title="Select drum track for editing"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={selectTrackOnly}
          className="min-w-0 flex-1 text-left text-[10px] font-semibold text-slate-600"
        >
          Drum editor
        </button>
        {selectedNoteIds.size > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void deleteHits(selectedNoteIds);
            }}
            className="rounded-md px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50"
            aria-label={`Delete ${selectedNoteIds.size} selected drum ${selectedNoteIds.size === 1 ? "hit" : "hits"}`}
            title="Delete selected drum hits (Delete)"
          >
            Delete {selectedNoteIds.size}
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        data-gte-shared-timeline="true"
        className="hide-scrollbar overflow-x-auto overflow-y-hidden"
        style={{
          height:
            RULER_HEIGHT + ROW_HEIGHT * DRUM_VOICES.length + visibleTimeRulerHeight,
        }}
        onContextMenu={handleTrackContextMenu}
        onScroll={(event) => {
          const element = event.currentTarget;
          queueTimelineViewportUpdate(element.scrollLeft, element.clientWidth);
          if (syncingScrollRef.current) return;
          const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
          onSharedTimelineScrollRatioChange?.(
            maxScroll > 0 ? element.scrollLeft / maxScroll : 0,
            element.scrollLeft
          );
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as Element;
          if (target.closest("[data-bar-select='true']")) return;
          if (target.closest("[data-drum-hit='true']")) return;
          if (target.closest("[data-drum-time-ruler='true']")) return;
          const point = pointerContentPoint(event.clientX, event.clientY);
          if (
            !point ||
            event.clientY <
              event.currentTarget.getBoundingClientRect().top + RULER_HEIGHT
          ) {
            return;
          }
          event.preventDefault();
          setSelectedLoopId(null);
          setEditingLoopSourceId(null);
          setLoopContextMenu(null);
          setSelectedBarIndices([]);
          setBarSelectionAnchor(null);
          setBarContextMenu(null);
          const baseSelection = event.shiftKey
            ? new Set(selectedNoteIdsRef.current)
            : new Set<number>();
          if (!event.shiftKey) replaceSelection(new Set());
          interactionRef.current = {
            kind: "marquee",
            startX: point.x,
            startY: point.y,
            baseSelection,
            moved: false,
            canAddHit: isActive,
          };
        }}
      >
        <div
          className="relative select-none"
          style={{
            width: timelineWidth,
            height:
              RULER_HEIGHT + ROW_HEIGHT * DRUM_VOICES.length + visibleTimeRulerHeight,
          }}
        >
          {trackOffsetWidth > 0 && (
            <div
              data-track-offset-blank="true"
              className="absolute top-0 z-[70] cursor-default overflow-hidden border-r border-slate-200 bg-white"
              style={{
                left: LABEL_WIDTH,
                width: trackOffsetWidth,
                height: ROW_HEIGHT * DRUM_VOICES.length + RULER_HEIGHT,
              }}
              title={`Track begins at bar ${trackOffsetFrames / FRAMES_PER_BAR + 1}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
            </div>
          )}
          {trackOffsetWidth > 0 && (
            <span
              className="pointer-events-none absolute top-1/2 z-[80] -translate-y-1/2 rounded-full bg-sky-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm"
              style={{ left: trackOffsetArrowLeft }}
              aria-hidden="true"
            >
              →
            </span>
          )}
          <div
            className="sticky left-0 top-0 z-50 border-b border-r border-slate-200 bg-slate-100"
            style={{ width: VISIBLE_LABEL_WIDTH, height: RULER_HEIGHT }}
          />
          <div
            className="absolute top-0 border-b border-slate-200 bg-slate-50"
            style={{ left: LABEL_WIDTH, right: 0, height: RULER_HEIGHT }}
          >
            {visibleBarIndices.filter((index) => index >= trackOffsetBarCount).map((index) => {
              const selected = selectedBarIndexSet.has(index);
              return (
                <button
                  key={`drum-bar-${index}`}
                  type="button"
                  data-bar-select="true"
                  data-bar-select-editor={editorId}
                  data-bar-index={index}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => handleBarSelection(index, event)}
                  onContextMenu={(event) => handleBarContextMenu(index, event)}
                  draggable={selected && !mobileViewport}
                  onDragStart={(event) => handleSelectedBarDragStart(index, event)}
                  onDragEnd={() => {
                    setBarDropIndex(null);
                    onBarDragEnd?.();
                  }}
                  className={`absolute top-0 z-20 flex items-center px-2 text-[9px] font-semibold ${
                    selected
                      ? "bg-slate-200/90 text-slate-800"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                  style={{
                    left: index * barWidth,
                    width: barWidth,
                    height: RULER_HEIGHT,
                  }}
                  title={barBpmTitle(index)}
                  aria-label={`Select Bar ${index + 1}, ${formatTimingBpm(
                    getTimingBarBpm(timingMap, index, fallbackBarBpm)
                  )} BPM`}
                >
                  {showBarNumbers ? <span className="truncate">Bar {index + 1}</span> : null}
                </button>
              );
            })}
          </div>

          {visibleBarDropIndices.filter((insertIndex) => insertIndex >= trackOffsetBarCount).map((insertIndex) => {
            const dragEnabled = Boolean(activeBarDrag && onRequestBarDrop);
            const active = barDropIndex === insertIndex;
            return (
              <button
                key={`drum-bar-drop-${insertIndex}`}
                type="button"
                aria-hidden={!dragEnabled}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onDragOver={(event) => {
                  if (!dragEnabled) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setBarDropIndex(insertIndex);
                }}
                onDragEnter={(event) => {
                  if (!dragEnabled) return;
                  event.preventDefault();
                  setBarDropIndex(insertIndex);
                }}
                onDrop={(event) => handleBarDrop(insertIndex, event)}
                onDragLeave={() => {
                  if (active) setBarDropIndex(null);
                }}
                className={`absolute top-0 z-30 w-5 -translate-x-1/2 rounded-full ${
                  dragEnabled ? "pointer-events-auto" : "pointer-events-none"
                } ${active ? "bg-sky-500/80" : "bg-transparent"}`}
                style={{
                  left: LABEL_WIDTH + insertIndex * barWidth,
                  height: RULER_HEIGHT + ROW_HEIGHT * DRUM_VOICES.length,
                  opacity: dragEnabled ? (active ? 0.95 : 0.35) : 0,
                }}
                title={dragEnabled ? `Insert bars at ${insertIndex + 1}` : undefined}
              />
            );
          })}

          {DRUM_VOICES.map((voice, voiceIndex) => (
            <div
              key={voice.id}
              className={`absolute border-b border-slate-200 ${
                voiceIndex % 2 === 0 ? "bg-white" : "bg-slate-50/70"
              }`}
              style={{
                left: 0,
                top: RULER_HEIGHT + voiceIndex * ROW_HEIGHT,
                width: timelineWidth,
                height: ROW_HEIGHT,
              }}
            >
              <div
                className="sticky left-0 z-50 flex h-full items-center border-r border-slate-200 bg-slate-100 px-1.5 text-[9px] font-semibold text-slate-700"
                style={{ width: VISIBLE_LABEL_WIDTH }}
                title={`${voice.label} · key ${voice.key}`}
              >
                <span>{shortLabelForVoice(voice.id)}</span>
              </div>
            </div>
          ))}

          {gridLines.map(({ frame, kind }) => {
            const isBar = kind === "bar";
            const isBeat = kind === "beat";
            return (
              <div
                key={`drum-grid-${kind}-${frame}`}
                data-drum-grid-kind={kind}
                className={`pointer-events-none absolute ${
                  isBar
                    ? "bg-slate-700"
                    : isBeat
                      ? "bg-slate-400"
                      : "bg-slate-200/80"
                }`}
                style={{
                  left: LABEL_WIDTH + frame * pxPerFrame,
                  top: RULER_HEIGHT,
                  width: isBar ? 3 : isBeat ? 2 : 1,
                  height: ROW_HEIGHT * DRUM_VOICES.length,
                }}
              />
            );
          })}

          {visibleLoops.map((loop) => {
            const selected = selectedLoopId === loop.id;
            const editingSource = editingLoopSourceId === loop.id;
            const sourceWidth = Math.max(1, (loop.sourceEnd - loop.sourceStart) * pxPerFrame);
            const loopWidth = Math.max(sourceWidth, (loop.loopEnd - loop.sourceStart) * pxPerFrame);
            const repetitions = Math.max(
              1,
              (loop.loopEnd - loop.sourceStart) / Math.max(1, loop.sourceEnd - loop.sourceStart)
            );
            return (
              <div
                key={loop.id}
                data-drum-loop="true"
                className={`absolute z-10 cursor-grab touch-none border-2 bg-sky-300/20 active:cursor-grabbing ${
                  selected ? "border-sky-600" : "border-sky-400/80"
                }`}
                style={{
                  left: LABEL_WIDTH + loop.sourceStart * pxPerFrame,
                  top: RULER_HEIGHT,
                  width: loopWidth,
                  height: ROW_HEIGHT * DRUM_VOICES.length,
                }}
                title="Drag loop · Right-click for loop actions"
                onPointerDown={(event) => startLoopInteraction(loop, "move", event)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSelectedLoopId(loop.id);
                  setLoopContextMenu({ x: event.clientX, y: event.clientY, loopId: loop.id });
                }}
              >
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 border-r border-dashed border-sky-600/70 bg-sky-200/25"
                  style={{ width: sourceWidth }}
                />
                <span className="pointer-events-none absolute left-1 top-0.5 rounded bg-white/80 px-1 text-[8px] font-bold text-sky-800 shadow-sm">
                  Loop ×{repetitions.toFixed(repetitions % 1 === 0 ? 0 : 1)}
                </span>
                {editingSource && (
                  <>
                    <button
                      type="button"
                      className="absolute inset-y-0 left-0 z-30 w-3 -translate-x-1/2 cursor-ew-resize bg-sky-500/30"
                      onPointerDown={(event) => startLoopInteraction(loop, "resize-source-start", event)}
                      title="Change loop source start"
                      aria-label="Change loop source start"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 z-30 w-3 -translate-x-1/2 cursor-ew-resize bg-sky-500/30"
                      style={{ left: sourceWidth }}
                      onPointerDown={(event) => startLoopInteraction(loop, "resize-source-end", event)}
                      title="Change loop source end"
                      aria-label="Change loop source end"
                    />
                  </>
                )}
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 z-30 w-3 translate-x-1/2 cursor-ew-resize bg-sky-600/35"
                  onPointerDown={(event) => startLoopInteraction(loop, "resize-loop", event)}
                  title="Extend loop"
                  aria-label="Extend loop"
                />
              </div>
            );
          })}

          {isActive && (
            <div
              className="pointer-events-none absolute z-10 rounded border border-sky-400 bg-sky-100/50"
              style={{
                left: LABEL_WIDTH + cursor.time * pxPerFrame,
                top: RULER_HEIGHT + cursor.voiceIndex * ROW_HEIGHT + 2,
                width: Math.max(10, gridStep * pxPerFrame),
                height: ROW_HEIGHT - 4,
              }}
            />
          )}

          {selectionBox && (
            <div
              className="pointer-events-none absolute z-30 border border-sky-500 bg-sky-200/30"
              style={selectionBox}
            />
          )}

          {visibleMaterializedNotes.map((item) => {
            const { note, virtual } = item;
            const voice = getDrumVoiceForNote(note);
            const voiceIndex = DRUM_VOICES.findIndex((candidate) => candidate.id === voice.id);
            const selected = !virtual && selectedNoteIds.has(note.id);
            return (
              <button
                key={item.key}
                type="button"
                data-drum-hit={virtual ? undefined : "true"}
                tabIndex={virtual ? -1 : 0}
                className={`absolute z-20 flex cursor-grab touch-none items-center justify-center border font-bold leading-none active:cursor-grabbing ${
                  drumHitSize >= 12 ? "shadow-sm" : ""
                } ${
                  virtual
                    ? "pointer-events-none border-sky-400/70 bg-sky-100/80 text-sky-700 opacity-75"
                    : selected
                    ? "border-sky-700 bg-sky-600 text-white"
                    : "border-slate-600 bg-white text-slate-800 hover:bg-sky-50"
                }`}
                style={{
                  left:
                    LABEL_WIDTH +
                    (note.startTime + gridStep / 2) * pxPerFrame -
                    drumHitSize / 2,
                  top:
                    RULER_HEIGHT +
                    voiceIndex * ROW_HEIGHT +
                    (ROW_HEIGHT - drumHitSize) / 2,
                  width: drumHitSize,
                  height: drumHitSize,
                  borderRadius: Math.min(6, drumHitSize / 4),
                  fontSize: drumHitSize >= 8 ? Math.min(10, drumHitSize * 0.45) : 0,
                }}
                title={`${virtual ? "Virtual " : ""}${voice.label} at frame ${note.startTime}. Select, drag, or press Delete to remove.`}
                aria-label={`${virtual ? "Virtual " : ""}${voice.label} drum hit`}
                onPointerDown={(event) => {
                  if (virtual) return;
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  event.preventDefault();
                  setSelectedLoopId(null);
                  setEditingLoopSourceId(null);
                  setLoopContextMenu(null);
                  setSelectedBarIndices([]);
                  setBarSelectionAnchor(null);
                  setBarContextMenu(null);
                  const currentSelection = new Set(selectedNoteIdsRef.current);
                  let nextSelection: Set<number>;
                  if (event.shiftKey) {
                    nextSelection = currentSelection;
                    if (nextSelection.has(note.id)) {
                      nextSelection.delete(note.id);
                      replaceSelection(new Set(nextSelection));
                      return;
                    }
                    nextSelection.add(note.id);
                  } else if (currentSelection.has(note.id)) {
                    nextSelection = currentSelection;
                  } else {
                    nextSelection = new Set([note.id]);
                  }
                  replaceSelection(new Set(nextSelection));
                  interactionRef.current = {
                    kind: "notes",
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    anchorStartTime: note.startTime,
                    anchorVoiceIndex: voiceIndex,
                    selectedIds: new Set(nextSelection),
                    originalNotes: snapshot.notes,
                    moved: false,
                  };
                  dragPreviewNotesRef.current = null;
                  setDragPreviewNotes(null);
                  setCursor({ time: note.startTime, voiceIndex });
                  onFocusWorkspace?.();
                }}
                onClick={(event) => {
                  if (virtual) return;
                  event.stopPropagation();
                  void previewDrumVoice(voice.id).catch(() => {});
                }}
                onDoubleClick={(event) => {
                  if (virtual) return;
                  event.stopPropagation();
                  void deleteHits([note.id]);
                }}
                onContextMenu={(event) => {
                  if (virtual) return;
                  handleNoteContextMenu(note, event);
                }}
              >
                {drumHitSize >= 8 ? symbolForVoice(voice.id) : null}
              </button>
            );
          })}

          {showTimeRuler && <div
            data-drum-time-ruler="true"
            role="button"
            tabIndex={0}
            className="absolute left-0 z-40 cursor-pointer border-t border-slate-300 bg-slate-50/90 text-[8px] text-slate-500"
            style={{
              top: RULER_HEIGHT + ROW_HEIGHT * DRUM_VOICES.length,
              width: timelineWidth,
              height: TIME_RULER_HEIGHT,
            }}
            title="Click to jump playback"
            aria-label="Timeline seconds ruler"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const container = scrollRef.current;
              if (!container) return;
              const rect = container.getBoundingClientRect();
              const frame = Math.max(
                0,
                Math.min(
                  totalFrames,
                  Math.round(
                    (event.clientX - rect.left + container.scrollLeft - LABEL_WIDTH) /
                      pxPerFrame
                  )
                )
              );
              onGlobalPlaybackFrameChange?.(frame);
              onFocusWorkspace?.();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onGlobalPlaybackFrameChange?.(
                Math.max(0, Math.min(totalFrames, getGlobalPlaybackFrame?.() ?? globalPlaybackFrame))
              );
            }}
          >
            <div
              className="sticky left-0 z-50 h-full border-r border-slate-200 bg-slate-100"
              style={{ width: VISIBLE_LABEL_WIDTH }}
            />
            {timelineSecondMarks.map(({ second, left, isLabel }) => (
              <div
                key={`drum-timeline-second-${second}`}
                className="absolute bottom-0 border-l border-slate-300"
                style={{ left, height: isLabel ? TIME_RULER_HEIGHT : 6 }}
              >
                {isLabel ? (
                  <span className="absolute left-1 top-0.5 whitespace-nowrap font-medium leading-none text-slate-500">
                    {formatTimelineSecondLabel(second)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>}

          <div
            ref={playheadRef}
            data-gte-playhead="drum"
            className="pointer-events-none absolute left-0 top-0 z-20 w-px bg-rose-500"
            style={{
              height:
                RULER_HEIGHT + ROW_HEIGHT * DRUM_VOICES.length + visibleTimeRulerHeight,
            }}
          />
        </div>
      </div>
      {(quantizeDialogOpen || scaleDialogOpen) && (
        <div
          data-gte-floating-ui="true"
          data-gte-editor-control="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gte-drum-transform-title"
          className="fixed left-1/2 top-1/2 z-[10000] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-sky-200 bg-white p-3 shadow-xl shadow-slate-900/15"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTransformTool();
            } else if (event.key === "Escape") {
              event.preventDefault();
              closeTransformTools();
            }
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="gte-drum-transform-title"
                className="m-0 text-sm font-semibold text-slate-900"
              >
                {quantizeDialogOpen
                  ? "Quantize drum notes"
                  : "Scale drum notes"}
              </h2>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Previewing {selectedNoteIds.size} selected drum{" "}
                {selectedNoteIds.size === 1 ? "note" : "notes"}.
              </p>
            </div>
            <button
              type="button"
              onClick={closeTransformTools}
              className="grid h-6 w-6 place-items-center rounded-md border border-slate-200 text-xs text-slate-500 hover:bg-slate-50"
              aria-label="Close"
            >
              x
            </button>
          </div>

          {quantizeDialogOpen ? (
            <div className="mt-3 grid gap-2">
              <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
                Beat subdivision
                <input
                  type="number"
                  min={1}
                  max={64}
                  step={1}
                  value={quantizeSubdivision}
                  onChange={(event) => {
                    const value = Math.max(
                      1,
                      Math.min(64, Number(event.target.value) || 1)
                    );
                    setQuantizeSubdivision(value);
                    previewQuantize(
                      value,
                      quantizePreScale,
                      quantizeApplyToLength
                    );
                  }}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
                />
              </label>
              <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
                Pre scaling
                <input
                  type="number"
                  min={0.01}
                  max={16}
                  step={0.01}
                  value={quantizePreScale}
                  onChange={(event) => {
                    const value = Math.max(
                      0.01,
                      Math.min(16, Number(event.target.value) || 1)
                    );
                    setQuantizePreScale(value);
                    previewQuantize(
                      quantizeSubdivision,
                      value,
                      quantizeApplyToLength
                    );
                  }}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={quantizeApplyToLength}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setQuantizeApplyToLength(checked);
                    previewQuantize(
                      quantizeSubdivision,
                      quantizePreScale,
                      checked
                    );
                  }}
                  className="h-4 w-4 accent-sky-600"
                />
                Apply to length
              </label>
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
                Scale mode
                <select
                  value={scaleMode}
                  onChange={(event) => {
                    const mode = event.target.value as
                      | "length"
                      | "start"
                      | "both";
                    setScaleMode(mode);
                    previewScale(scaleFactor, mode);
                  }}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
                >
                  <option value="length">Length scaling</option>
                  <option value="start">Start-time scaling</option>
                  <option value="both">Start + length</option>
                </select>
              </label>
              <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
                Scale factor
                <input
                  type="number"
                  min={0.01}
                  max={16}
                  step={0.01}
                  value={scaleFactor}
                  onChange={(event) => {
                    const value = Math.max(
                      0.01,
                      Math.min(16, Number(event.target.value) || 1)
                    );
                    setScaleFactor(value);
                    previewScale(value, scaleMode);
                  }}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
                />
              </label>
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeTransformTools}
              className="h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitTransformTool}
              className="h-8 rounded-lg bg-sky-600 px-3 text-[11px] font-semibold text-white hover:bg-sky-500"
            >
              Apply
            </button>
          </div>
        </div>
      )}
      {playbackUiVisible && typeof document !== "undefined" && createPortal(
        <div
          data-gte-floating-ui="true"
          className="pointer-events-none fixed bottom-10 left-1/2 z-[9997] flex -translate-x-1/2 items-center gap-2 px-2"
        >
          {showPlaybackCounter && (
            <span
              className="pointer-events-auto absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-slate-200 bg-white/95 px-2 py-1 text-[10px] font-semibold tabular-nums text-slate-600 shadow-sm"
              role="timer"
              aria-label="Playback time"
            >
              {formatTimelineSecondLabel((getGlobalPlaybackFrame?.() ?? globalPlaybackFrame) / playbackFps)} / {formatTimelineSecondLabel(totalFrames / playbackFps)}
            </span>
          )}
          <div className="pointer-events-auto flex items-center rounded-full border border-slate-200 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={onGlobalPlaybackToggle}
              disabled={globalPlaybackIsPreparing}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-700"
              aria-label={
                globalPlaybackIsPreparing
                  ? "Loading drum sounds"
                  : globalPlaybackIsPlaying
                    ? "Pause"
                    : "Play"
              }
              title={
                globalPlaybackIsPreparing
                  ? "Loading drum sounds"
                  : globalPlaybackIsPlaying
                    ? "Pause"
                    : "Play"
              }
            >
              {globalPlaybackIsPreparing ? (
                <span className="animate-pulse text-xs font-bold">•••</span>
              ) : globalPlaybackIsPlaying ? (
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
          </div>
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-slate-700 shadow-sm backdrop-blur">
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
              onChange={(event) =>
                onGlobalPlaybackVolumeChange?.(Number(event.target.value))
              }
              className="w-20 accent-slate-700"
              title="Volume"
              aria-label="Playback volume"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
