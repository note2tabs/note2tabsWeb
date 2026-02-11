import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/router";
import { gteApi } from "../lib/gteApi";
import type { CutWithCoord, EditorSnapshot, TabCoord } from "../types/gte";

type Props = {
  editorId: string;
  snapshot: EditorSnapshot;
  onSnapshotChange: (snapshot: EditorSnapshot) => void;
};

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];
const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40];
const ROW_HEIGHT = 28;
const ROW_GAP = 80;
const BARS_PER_ROW = 3;
const DEFAULT_NOTE_LENGTH = 20;
const CUT_SEGMENT_HEIGHT = 20;
const CUT_SEGMENT_OFFSET = 14;
const CUT_SEGMENT_MIN_WIDTH = 28;
const CUT_BOUNDARY_OVERHANG = 12;
const MAX_HISTORY = 16;

type OptionalNumber = number | null;
type OptionalTabCoord = [OptionalNumber, OptionalNumber];

const parseOptionalNumber = (value: string): OptionalNumber => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
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

export default function GteWorkspace({ editorId, snapshot, onSnapshotChange }: Props) {
  const router = useRouter();
  const [scale, setScale] = useState(4);
  const [secondsPerBar, setSecondsPerBar] = useState(2);
  const [secondsPerBarInput, setSecondsPerBarInput] = useState("2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackVolume, setPlaybackVolume] = useState(0.6);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
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
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number }>({ x: 80, y: 120 });
  const [toolbarDragging, setToolbarDragging] = useState(false);
  const [sliceToolActive, setSliceToolActive] = useState(false);
  const [sliceCursor, setSliceCursor] = useState<{ time: number; rowIndex: number } | null>(null);
  const [cutToolActive, setCutToolActive] = useState(false);
  const [selectedCutBoundaryIndex, setSelectedCutBoundaryIndex] = useState<number | null>(null);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [playheadDragging, setPlayheadDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetFrame: number;
  } | null>(null);
  const toolbarDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
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

  const fps = 90;
  const framesPerMeasure = snapshot.framesPerMessure || 0;
  const computedFramesPerBar = Math.max(1, Math.round(secondsPerBar * fps));
  const totalFrames = snapshot.totalFrames || 0;
  const maxFret = snapshot.tabRef?.[0]?.length ? snapshot.tabRef[0].length - 1 : 22;
  const barCount =
    framesPerMeasure > 0 ? Math.max(1, Math.ceil(totalFrames / framesPerMeasure)) : 1;
  const computedTotalFrames = barCount * computedFramesPerBar;
  const rowFrames = framesPerMeasure > 0 ? framesPerMeasure * BARS_PER_ROW : 1;
  const rows = Math.max(1, Math.ceil(Math.max(1, totalFrames) / rowFrames));
  const timelineWidth = Math.max(1, rowFrames) * scale;
  const rowHeight = ROW_HEIGHT * 6;
  const rowBlockHeight = rowHeight + CUT_SEGMENT_OFFSET + CUT_SEGMENT_HEIGHT;
  const rowStride = rowBlockHeight + ROW_GAP;
  const timelineHeight = rows * rowBlockHeight + Math.max(0, rows - 1) * ROW_GAP;
  const timelineEnd = framesPerMeasure > 0 ? barCount * framesPerMeasure : totalFrames;
  const snapThresholdFrames = Math.max(1, Math.round(4 / Math.max(1, scale)));
  const playbackFps =
    framesPerMeasure > 0 ? Math.max(1, framesPerMeasure / Math.max(0.1, secondsPerBar)) : fps;

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    undoRef.current = [];
    redoRef.current = [];
    setUndoCount(0);
    setRedoCount(0);
  }, [editorId]);

  useEffect(() => {
    playheadFrameRef.current = playheadFrame;
  }, [playheadFrame]);

  useEffect(() => {
    if (audioRef.current && masterGainRef.current) {
      const now = audioRef.current.currentTime;
      masterGainRef.current.gain.setTargetAtTime(playbackVolume, now, 0.02);
    }
    if (previewAudioRef.current && previewGainRef.current) {
      const now = previewAudioRef.current.currentTime;
      previewGainRef.current.gain.setTargetAtTime(playbackVolume, now, 0.02);
    }
  }, [playbackVolume]);

  useEffect(() => {
    if (playheadFrame > timelineEnd) {
      setPlayheadFrame(timelineEnd);
    }
  }, [playheadFrame, timelineEnd]);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        void previewAudioRef.current.close();
        previewAudioRef.current = null;
      }
      previewGainRef.current = null;
    };
  }, []);

  const getRowBarCount = (rowIndex: number) =>
    Math.max(0, Math.min(BARS_PER_ROW, barCount - rowIndex * BARS_PER_ROW));

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
      }
    }
  }, [snapshot.secondsPerBar]);

  useEffect(() => {
    const container = timelineOuterRef.current;
    if (!container || rowFrames <= 0) return;

    const computeScale = () => {
      const availableWidth = Math.max(240, container.clientWidth - 16);
      const nextScale = Math.max(2, Math.min(12, Math.floor(availableWidth / Math.max(1, rowFrames))));
      setScale((prev) => (prev === nextScale ? prev : nextScale));
    };

    computeScale();
    const observer = new ResizeObserver(computeScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [rowFrames]);

  useEffect(() => {
    if (selectedNoteIds.length === 1) {
      void gteApi
        .getNoteOptimals(editorId, selectedNoteIds[0])
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
      void gteApi
        .getChordAlternatives(editorId, activeId)
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

  const applySnapshot = useCallback(
    (next: EditorSnapshot, options?: { recordUndo?: boolean }) => {
      const recordUndo = options?.recordUndo !== false;
      const current = snapshotRef.current;
      const sameVersion =
        current?.id === next.id &&
        current?.version !== undefined &&
        next.version !== undefined &&
        current.version === next.version;
      if (recordUndo && current && !sameVersion) {
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
      onSnapshotChange(next);
    },
    [cloneSnapshot, onSnapshotChange]
  );

  const runMutation = async <T extends { snapshot?: EditorSnapshot }>(fn: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      const data = await fn();
      if (data.snapshot) applySnapshot(data.snapshot);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const applySnapshotToBackend = useCallback(
    async (value: EditorSnapshot) => {
      const payload = { ...value, id: editorId };
      const res = await gteApi.applySnapshot(editorId, payload);
      return res.snapshot;
    },
    [editorId]
  );

  const handleUndo = useCallback(async () => {
    if (busy) return;
    const undoList = undoRef.current;
    if (!undoList.length) return;
    const previous = undoList[undoList.length - 1];
    const current = snapshotRef.current;
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const snapshotFromServer = await applySnapshotToBackend(previous);
      const nextUndo = undoList.slice(0, -1);
      const nextRedo = [...redoRef.current, cloneSnapshot(current)];
      undoRef.current = nextUndo;
      redoRef.current = nextRedo;
      setUndoCount(nextUndo.length);
      setRedoCount(nextRedo.length);
      applySnapshot(snapshotFromServer, { recordUndo: false });
    } catch (err: any) {
      setError(err?.message || "Could not undo.");
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, applySnapshotToBackend, busy, cloneSnapshot]);

  const handleRedo = useCallback(async () => {
    if (busy) return;
    const redoList = redoRef.current;
    if (!redoList.length) return;
    const next = redoList[redoList.length - 1];
    const current = snapshotRef.current;
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const snapshotFromServer = await applySnapshotToBackend(next);
      const nextRedo = redoList.slice(0, -1);
      const nextUndo = [...undoRef.current, cloneSnapshot(current)];
      undoRef.current = nextUndo;
      redoRef.current = nextRedo;
      setUndoCount(nextUndo.length);
      setRedoCount(nextRedo.length);
      applySnapshot(snapshotFromServer, { recordUndo: false });
    } catch (err: any) {
      setError(err?.message || "Could not redo.");
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, applySnapshotToBackend, busy, cloneSnapshot]);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

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
      const rowBarCount = Math.max(0, Math.min(BARS_PER_ROW, barCount - rowIndex * BARS_PER_ROW));
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
    const notesToSlice = snapshot.notes.filter((note) => selectedNoteIds.includes(note.id));
    const chordsToSlice = snapshot.chords.filter((chord) => selectedChordIds.includes(chord.id));
    if (!notesToSlice.length && !chordsToSlice.length) return;
    void runMutation(async () => {
      let last: Awaited<ReturnType<typeof gteApi.addNote>> | Awaited<ReturnType<typeof gteApi.sliceChord>> | null =
        null;
      for (const note of notesToSlice) {
        const start = note.startTime;
        const end = note.startTime + note.length;
        if (sliceTime <= start || sliceTime >= end) continue;
        const leftLength = sliceTime - start;
        const rightLength = end - sliceTime;
        if (leftLength < 1 || rightLength < 1) continue;
        await gteApi.setNoteLength(editorId, note.id, leftLength);
        last = await gteApi.addNote(editorId, {
          tab: note.tab,
          startTime: sliceTime,
          length: rightLength,
        });
      }
      for (const chord of chordsToSlice) {
        const start = chord.startTime;
        const end = chord.startTime + chord.length;
        if (sliceTime <= start || sliceTime >= end) continue;
        last = await gteApi.sliceChord(editorId, chord.id, sliceTime);
      }
      return last ?? {};
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
      const startTime = clamp(snappedStart, 0, maxStart);
      if (dragging.type === "note") {
        const localY = y - rowIndex * rowStride;
        const stringIndex = clamp(Math.floor(localY / ROW_HEIGHT), 0, 5);
        const next = { startTime, stringIndex };
        dragPreviewRef.current = next;
        setDragPreview(next);
      } else {
        const next = { startTime };
        dragPreviewRef.current = next;
        setDragPreview(next);
      }
    };
    const handleUp = async () => {
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
        const targetStart = clamp(rawStart, 0, maxStart);
        let didMove = false;
        setBusy(true);
        setError(null);
        try {
          if (targetString !== dragging.stringIndex) {
            const nextTab: TabCoord = [targetString, dragging.fret ?? 0];
            const res = await gteApi.assignNoteTab(editorId, dragging.id, nextTab);
            applySnapshot(res.snapshot);
            playNotePreview(nextTab);
            didMove = true;
          }
          if (targetStart !== dragging.startTime) {
            const res = await gteApi.setNoteStartTime(editorId, dragging.id, targetStart);
            applySnapshot(res.snapshot);
            didMove = true;
          }
        } catch (err: any) {
          setError(err?.message || "Could not move note.");
        } finally {
          setBusy(false);
        }
        noteDragMovedRef.current = didMove;
      } else if (dragging.type === "chord") {
        const safeLength = Math.max(1, Math.round(dragging.length));
        const rawStart = Math.round(preview.startTime ?? dragging.startTime);
        const maxStart = Math.max(0, timelineEnd - safeLength);
        const targetStart = clamp(rawStart, 0, maxStart);
        if (targetStart !== dragging.startTime) {
          void runMutation(() => gteApi.setChordStartTime(editorId, dragging.id, targetStart));
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
    onSnapshotChange,
    runMutation,
    scale,
    totalFrames,
    rowFrames,
    rows,
    timelineHeight,
    timelineWidth,
    timelineEnd,
    snapCandidates,
    clamp,
  ]);

  useEffect(() => {
    if (!multiDrag) return;

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
      const targetAnchorStart = clamp(
        snappedStart,
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
        void runMutation(async () => {
          let last: EditorSnapshot | null = null;
          for (const note of multiDrag.notes) {
            const nextStart = note.startTime + delta;
            const res = await gteApi.setNoteStartTime(editorId, note.id, nextStart);
            last = res.snapshot;
          }
          for (const chord of multiDrag.chords) {
            const nextStart = chord.startTime + delta;
            const res = await gteApi.setChordStartTime(editorId, chord.id, nextStart);
            last = res.snapshot;
          }
          return last ? { snapshot: last } : {};
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
    runMutation,
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
      if (previewLength !== resizingNote.length) {
        void runMutation(() => gteApi.setNoteLength(editorId, resizingNote.id, previewLength));
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
    editorId,
    runMutation,
    scale,
    totalFrames,
    rowFrames,
    timelineWidth,
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
      if (previewLength !== resizingChord.length) {
        void runMutation(() => gteApi.setChordLength(editorId, resizingChord.id, previewLength));
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
    editorId,
    runMutation,
    scale,
    rowFrames,
    timelineWidth,
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
          void runMutation(() => gteApi.setChordTabs(editorId, chord.id, nextTabs));
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
        const defaultLength = DEFAULT_NOTE_LENGTH;
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
    if (!toolbarDragging) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      const width = 340;
      const height = 150;
      const nextX = Math.max(
        16,
        Math.min(window.innerWidth - width - 16, event.clientX - toolbarDragOffsetRef.current.x)
      );
      const nextY = Math.max(
        16,
        Math.min(window.innerHeight - height - 16, event.clientY - toolbarDragOffsetRef.current.y)
      );
      setToolbarPos({ x: nextX, y: nextY });
    };

    const handleUp = () => {
      setToolbarDragging(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [toolbarDragging]);

  useEffect(() => {
    if (!playheadDragging) return;
    const handleMove = (event: globalThis.MouseEvent) => {
      const target = getPointerFrame(event.clientX, event.clientY);
      if (target) {
        setPlayheadFrame(target.time);
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
  }, [playheadDragging]);

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
    setContextMenu({ x: event.clientX, y: event.clientY, targetFrame });
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

  const handleBarDrop = (targetIndex: number) => {
    if (dragBarIndex === null) return;
    if (dragBarIndex === targetIndex) {
      setDragBarIndex(null);
      return;
    }
    void runMutation(() => gteApi.reorderBars(editorId, dragBarIndex, targetIndex));
    setDragBarIndex(null);
  };

  const jumpToFrame = (frame: number) => {
    if (isPlaying) stopPlayback();
    setPlayheadFrame(clamp(Math.round(frame), 0, timelineEnd));
  };

  const skipToStart = () => {
    jumpToFrame(0);
  };

  const skipBackwardBar = () => {
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
    if (framesPerMeasure <= 0) return;
    const current = Math.max(0, Math.floor(playheadFrameRef.current));
    const nextIndex = Math.floor(current / framesPerMeasure) + 1;
    const target = Math.min(timelineEnd, nextIndex * framesPerMeasure);
    jumpToFrame(target);
  };

  const handleExport = async () => {
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
    const length = draftNote.length ?? DEFAULT_NOTE_LENGTH;
    if (fret === null) {
      setError("Enter a fret before adding the note.");
      return;
    }
    const tab: TabCoord = [draftNote.stringIndex, fret];
    playNotePreview(tab);
    void runMutation(() =>
      gteApi.addNote(editorId, {
        tab,
        startTime: draftNote.startTime,
        length,
      })
    );
    setDraftNote(null);
    setDraftNoteAnchor(null);
  };

  const handleAssignOptimals = () => {
    if (!selectedNoteIds.length) return;
    void runMutation(() => gteApi.assignOptimals(editorId, selectedNoteIds));
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
        const nextLength = Math.max(1, targetEnd - first.startTime);
        if (nextLength !== first.length) {
          await gteApi.setNoteLength(editorId, first.id, nextLength);
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
        const beforeIds = new Set(currentSnapshot.notes.map((note) => note.id));
        const res = await gteApi.addNote(editorId, { tab, startTime: start, length });
        currentSnapshot = res.snapshot;
        last = res.snapshot;
        const newNote = currentSnapshot.notes.find((note) => !beforeIds.has(note.id));
        if (newNote) {
          addedNoteIds.push(newNote.id);
          return newNote.id;
        }
        const fallback = currentSnapshot.notes.find(
          (note) =>
            note.startTime === start && note.length === length && note.tab[0] === tab[0] && note.tab[1] === tab[1]
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
    void runMutation(() => gteApi.makeChord(editorId, baseNoteIds));
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
    const lengthValue = Math.max(1, Math.round(length));
    const maxStart = Math.max(0, totalFrames - lengthValue);
    const startValue = clamp(Math.round(startTime), 0, maxStart);
    setBusy(true);
    setError(null);
    try {
      let nextSnapshot: EditorSnapshot | null = null;
      if (stringValue !== selectedNote.tab[0] || fretValue !== selectedNote.tab[1]) {
        const nextTab: TabCoord = [stringValue, fretValue];
        const res = await gteApi.assignNoteTab(editorId, selectedNote.id, nextTab);
        nextSnapshot = res.snapshot;
        applySnapshot(res.snapshot);
        playNotePreview(nextTab);
      }
      if (startValue !== selectedNote.startTime) {
        const res = await gteApi.setNoteStartTime(editorId, selectedNote.id, startValue);
        nextSnapshot = res.snapshot;
        applySnapshot(res.snapshot);
      }
      if (lengthValue !== selectedNote.length) {
        const res = await gteApi.setNoteLength(editorId, selectedNote.id, lengthValue);
        nextSnapshot = res.snapshot;
        applySnapshot(res.snapshot);
      }
      if (!nextSnapshot) {
        setError("No changes to save.");
      }
    } catch (err: any) {
      setError(err?.message || "Could not update note.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteNote = () => {
    if (!selectedNote) return;
    void runMutation(() => gteApi.deleteNote(editorId, selectedNote.id));
    setSelectedNoteIds([]);
  };

  const handleChordUpdate = async () => {
    if (!selectedChord) return;
    const { startTime, length } = chordForm;
    if (startTime === null || length === null) {
      setError("Fill in start time and length before updating the chord.");
      return;
    }
    const lengthValue = Math.max(1, Math.round(length));
    const maxStart = Math.max(0, totalFrames - lengthValue);
    const startValue = clamp(Math.round(startTime), 0, maxStart);
    setBusy(true);
    setError(null);
    try {
      if (startValue !== selectedChord.startTime) {
        const res = await gteApi.setChordStartTime(editorId, selectedChord.id, startValue);
        applySnapshot(res.snapshot);
      }
      if (lengthValue !== selectedChord.length) {
        const res = await gteApi.setChordLength(editorId, selectedChord.id, lengthValue);
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
    void runMutation(() => gteApi.disbandChord(editorId, selectedChord.id));
    setSelectedChordIds([]);
  };

  const handleMergeCutBoundary = () => {
    if (selectedCutBoundaryIndex === null) return;
    void runMutation(() => gteApi.deleteCutBoundary(editorId, selectedCutBoundaryIndex));
    setSelectedCutBoundaryIndex(null);
  };

  const handleDeleteChord = () => {
    if (!selectedChord) return;
    void runMutation(() => gteApi.deleteChord(editorId, selectedChord.id));
    setSelectedChordIds([]);
  };

  const getSideMenuAnchor = (event: ReactMouseEvent, menuWidth: number, menuHeight: number) => {
    const padding = 12;
    const containerRect = timelineOuterRef.current?.getBoundingClientRect();
    if (!containerRect) {
      let x = event.clientX + padding;
      let y = event.clientY - padding;
      if (x + menuWidth > window.innerWidth - padding) {
        x = event.clientX - menuWidth - padding;
      }
      if (y + menuHeight > window.innerHeight - padding) {
        y = window.innerHeight - menuHeight - padding;
      }
      if (y < padding) y = padding;
      return { x, y };
    }
    const preferredX =
      containerRect.left +
      Math.min(timelineWidth + padding, containerRect.width - menuWidth - padding);
    const x = clamp(preferredX, padding, window.innerWidth - menuWidth - padding);
    const minY = containerRect.top + padding;
    const maxY = containerRect.bottom - menuHeight - padding;
    const targetY = event.clientY - menuHeight / 2;
    const y =
      maxY >= minY
        ? clamp(targetY, minY, maxY)
        : clamp(targetY, padding, window.innerHeight - menuHeight - padding);
    return { x, y };
  };

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
    void runMutation(() => gteApi.assignNoteTab(editorId, selectedNote.id, nextTab));
  };

  const commitNoteMenuLength = () => {
    if (!selectedNote || !noteMenuDraft) return;
    const lengthValue = Number(noteMenuDraft.length);
    if (!Number.isInteger(lengthValue) || lengthValue < 1) {
      setError("Invalid length.");
      return;
    }
    if (selectedNote.length === lengthValue) return;
    void runMutation(() => gteApi.setNoteLength(editorId, selectedNote.id, lengthValue));
  };

  const commitChordMenuLength = () => {
    if (!selectedChord || !chordMenuDraft) return;
    const lengthValue = Number(chordMenuDraft.length);
    if (!Number.isInteger(lengthValue) || lengthValue < 1) {
      setError("Invalid length.");
      return;
    }
    if (selectedChord.length === lengthValue) return;
    void runMutation(() => gteApi.setChordLength(editorId, selectedChord.id, lengthValue));
  };

  const handleChordOctaveShift = (direction: number) => {
    if (!selectedChord) return;
    void runMutation(() => gteApi.shiftChordOctave(editorId, selectedChord.id, direction));
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
    void runMutation(() => gteApi.setChordTabs(editorId, selectedChord.id, nextTabs));
  };

  const commitChordNoteLength = () => {
    if (!selectedChord || !chordNoteMenuDraft) return;
    const lengthValue = Number(chordNoteMenuDraft.length);
    if (!Number.isInteger(lengthValue) || lengthValue < 1) {
      setError("Invalid length.");
      return;
    }
    if (selectedChord.length === lengthValue) return;
    void runMutation(() => gteApi.setChordLength(editorId, selectedChord.id, lengthValue));
  };

  const deleteChordNote = () => {
    if (!selectedChord || chordNoteMenuIndex === null) return;
    const nextTabs = selectedChord.currentTabs.filter((_, idx) => idx !== chordNoteMenuIndex);
    if (nextTabs.length === 0) {
      void runMutation(() => gteApi.deleteChord(editorId, selectedChord.id));
      setSelectedChordIds([]);
      exitChordEdit();
      return;
    }
    void runMutation(() => gteApi.setChordTabs(editorId, selectedChord.id, nextTabs));
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
    void runMutation(() => gteApi.addBars(editorId, 1));
  };

  const handleRemoveBar = (index: number) => {
    if (barCount <= 1) return;
    void runMutation(() => gteApi.removeBar(editorId, index));
  };

  const handleAssignAlt = (tab: TabCoord) => {
    if (!selectedNote) return;
    playNotePreview(tab);
    void runMutation(() => gteApi.assignNoteTab(editorId, selectedNote.id, tab));
  };

  const handleApplyChordTabs = (tabs: OptionalTabCoord[]) => {
    if (!selectedChord) return;
    if (tabs.some((tab) => tab[0] === null || tab[1] === null)) {
      setError("Fill in all chord tabs before applying.");
      return;
    }
    const normalized = tabs.map((tab) => [tab[0] as number, tab[1] as number]) as TabCoord[];
    void runMutation(() => gteApi.setChordTabs(editorId, selectedChord.id, normalized));
  };

  const handleShiftChordOctave = (direction: number) => {
    if (!selectedChord) return;
    void runMutation(() => gteApi.shiftChordOctave(editorId, selectedChord.id, direction));
  };

  const getMidiFromTab = (tab: TabCoord, fallback?: number) => {
    const value = snapshot.tabRef?.[tab[0]]?.[tab[1]];
    if (value !== undefined && value !== null) return Number(value);
    if (fallback !== undefined && fallback !== null) return Number(fallback);
    const base = STANDARD_TUNING_MIDI[tab[0]];
    if (base !== undefined && Number.isFinite(tab[1]) && tab[1] >= 0) {
      return base + tab[1];
    }
    return 0;
  };

  const ensurePreviewAudio = () => {
    let ctx = previewAudioRef.current;
    let master = previewGainRef.current;
    if (!ctx || ctx.state === "closed" || !master) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = playbackVolume;
      master.connect(ctx.destination);
      previewAudioRef.current = ctx;
      previewGainRef.current = master;
    }
    return { ctx, master };
  };

  const playNotePreview = (tab: TabCoord, midiOverride?: number) => {
    if (playbackVolume <= 0) return;
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
  };

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
    let endFrame = startFrame;
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
    master.gain.value = playbackVolume;
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

    if (!events.length) {
      void ctx.close();
      return null;
    }

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

  const startPlayback = () => {
    if (isPlaying) return;
    const startFrame = clamp(Math.round(playheadFrameRef.current), 0, timelineEnd);
    stopAudio();
    const scheduled = schedulePlayback(startFrame);
    if (scheduled?.ctx) {
      audioRef.current = scheduled.ctx;
    }
    playheadAudioStartRef.current = scheduled?.startTimeSec ?? null;
    setPlayheadFrame(startFrame);
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
        setPlayheadFrame(endFrame);
        stopPlayback();
        return;
      }
      setPlayheadFrame(nextFrame);
      playheadRafRef.current = window.requestAnimationFrame(tick);
    };
    playheadRafRef.current = window.requestAnimationFrame(tick);
  };

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
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("select"));
      if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
        if (isTyping) return;
        event.preventDefault();
        if (event.shiftKey) {
          void handleRedo();
        } else {
          void handleUndo();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "y" || event.key === "Y")) {
        if (isTyping) return;
        event.preventDefault();
        void handleRedo();
        return;
      }
      if (event.key === "Escape") {
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
      if (event.key === "Enter" && editingChordId !== null) {
        if (isTyping || chordNoteMenuIndex !== null) return;
        exitChordEdit();
        return;
      }
      if (event.key === "t" || event.key === "T") {
        if (isTyping) return;
        event.preventDefault();
        setToolbarOpen((prev) => {
          if (!prev) {
            const width = 340;
            const height = 150;
            const nextX = Math.max(
              16,
              Math.min(window.innerWidth - width - 16, window.innerWidth / 2 - width / 2)
            );
            const nextY = Math.max(
              16,
              Math.min(window.innerHeight - height - 16, window.innerHeight * 0.2)
            );
            setToolbarPos({ x: nextX, y: nextY });
          }
          return !prev;
        });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "c" || event.key === "C")) {
        if (isTyping) return;
        event.preventDefault();
        void handleCopySelection();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "v" || event.key === "V")) {
        if (isTyping) return;
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
        if (isPlaying) {
          stopPlayback();
        } else {
          startPlayback();
        }
        return;
      }
      if (event.key === "c" || event.key === "C") {
        if (isTyping) return;
        void handleMakeChord();
        return;
      }
      if (event.key === "l" || event.key === "L") {
        if (isTyping) return;
        if (activeChordIds.length) {
          const chordIds = [...activeChordIds];
          void runMutation(async () => {
            const latestSnapshot = await disbandChordIds(chordIds);
            return latestSnapshot ? { snapshot: latestSnapshot } : {};
          });
          setSelectedChordIds([]);
        }
        return;
      }
      if (event.key === "k" || event.key === "K") {
        if (isTyping) return;
        event.preventDefault();
        setCutToolActive((prev) => !prev);
        return;
      }
      if (event.key === "s" || event.key === "S") {
        if (isTyping) return;
        event.preventDefault();
        setSliceToolActive((prev) => !prev);
        return;
      }
      if (event.key === "j" || event.key === "J") {
        if (isTyping) return;
        if (selectedNoteIds.length > 0) {
          event.preventDefault();
          handleJoinSelectedNotes();
        }
        return;
      }
      if (event.key === "o" || event.key === "O") {
        if (isTyping) return;
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
      if (selectedCutBoundaryIndex !== null) {
        event.preventDefault();
        void runMutation(() => gteApi.deleteCutBoundary(editorId, selectedCutBoundaryIndex));
        setSelectedCutBoundaryIndex(null);
        return;
      }
      if (selectedNoteIds.length > 0) {
        void runMutation(async () => {
          let last = null as Awaited<ReturnType<typeof gteApi.deleteNote>> | null;
          for (const id of selectedNoteIds) {
            last = await gteApi.deleteNote(editorId, id);
          }
          return last ?? {};
        });
        setSelectedNoteIds([]);
      } else if (activeChordIds.length > 0) {
        void runMutation(async () => {
          let last = null as Awaited<ReturnType<typeof gteApi.deleteChord>> | null;
          for (const id of activeChordIds) {
            last = await gteApi.deleteChord(editorId, id);
          }
          return last ?? {};
        });
        setSelectedChordIds([]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    selectedNoteIds,
    selectedChordIds,
    activeChordIds,
    selectedCutBoundaryIndex,
    editorId,
    runMutation,
    handleUndo,
    handleRedo,
  ]);

  useEffect(() => {
    const handleMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 -ml-3 w-[calc(100%+0.75rem)]">
      <button
        type="button"
        onClick={() => {
          const width = 340;
          const height = 150;
          const nextX = Math.max(16, Math.min(window.innerWidth - width - 16, window.innerWidth / 2 - width / 2));
          const nextY = Math.max(16, Math.min(window.innerHeight - height - 16, window.innerHeight * 0.2));
          setToolbarPos({ x: nextX, y: nextY });
          setToolbarOpen(true);
        }}
        className="fixed right-4 bottom-4 z-[9997] rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        Toolbar
      </button>

      {toolbarOpen && (
        <div
          ref={toolbarRef}
          className="fixed z-[9998] rounded-xl border border-slate-200 bg-white/85 backdrop-blur px-3 py-2 shadow-lg"
          style={{ left: toolbarPos.x, top: toolbarPos.y, width: 340 }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div
            className="flex items-center justify-between cursor-move"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setToolbarDragging(true);
              toolbarDragOffsetRef.current = {
                x: event.clientX - toolbarPos.x,
                y: event.clientY - toolbarPos.y,
              };
            }}
          >
            <span className="text-xs font-semibold text-slate-700">Toolbar</span>
            <button
              type="button"
              onClick={() => setToolbarOpen(false)}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              x
            </button>
          </div>
            <div className="mt-2 grid grid-cols-[1fr_120px] gap-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleMakeChord();
                  }}
                disabled={chordizeCandidateCount < 2}
                className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Chordize (C)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeChordIds.length) {
                    const chordIds = [...activeChordIds];
                    void runMutation(async () => {
                      const latestSnapshot = await disbandChordIds(chordIds);
                      return latestSnapshot ? { snapshot: latestSnapshot } : {};
                    });
                    setSelectedChordIds([]);
                  }
                }}
                disabled={activeChordIds.length === 0}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Disband (L)
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleAssignOptimals();
                }}
                disabled={selectedNoteIds.length === 0}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Optimize (O)
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleJoinSelectedNotes();
                }}
                disabled={selectedNoteIds.length < 2}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Join (J)
              </button>
              <button
                type="button"
                onClick={() => setSliceToolActive((prev) => !prev)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
                  sliceToolActive
                    ? "bg-indigo-600 text-white"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                Slice (S)
              </button>
            </div>
            <div className="rounded-md border border-slate-200/70 bg-white/70 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Cut segments
              </div>
              <div className="mt-2 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  const ok = window.confirm(
                    "Generate cut-segments from all notes? This will replace the current cut segments."
                  );
                  if (!ok) return;
                  handleGenerateCuts();
                }}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                Generate
              </button>
              <button
                type="button"
                onClick={() => setCutToolActive((prev) => !prev)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
                  cutToolActive
                    ? "bg-sky-600 text-white"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                Cut (K)
              </button>
              <button
                type="button"
                onClick={handleMergeCutBoundary}
                disabled={selectedCutBoundaryIndex === null}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Merge
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[9999] w-36 rounded-md border border-slate-200 bg-white/95 py-1 text-xs shadow-lg backdrop-blur"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
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
        </div>
      )}
      <div className="fixed right-4 bottom-16 z-[9996] flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-1.5 text-slate-700 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => void handleUndo()}
          disabled={undoCount === 0 || busy}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Undo (Ctrl/Cmd+Z)"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
            <path d="M7 7H3v4h2V9h7a5 5 0 1 1 0 10h-4v2h4a7 7 0 1 0 0-14H7z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => void handleRedo()}
          disabled={redoCount === 0 || busy}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
            <path d="M17 7h4v4h-2V9h-7a5 5 0 1 0 0 10h4v2h-4a7 7 0 1 1 0-14h5z" />
          </svg>
        </button>
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
            if (isPlaying) {
              stopPlayback();
            } else {
              startPlayback();
            }
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
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
            value={playbackVolume}
            onChange={(event) => setPlaybackVolume(Number(event.target.value))}
            className="w-20 accent-slate-700"
            title="Volume"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
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
                void runMutation(() => gteApi.setSecondsPerBar(editorId, next));
              } else {
                setSecondsPerBarInput(String(secondsPerBar));
              }
            }}
            onBlur={() => {
              const next = Number(secondsPerBarInput);
              if (Number.isFinite(next) && next > 0) {
                setSecondsPerBar(next);
                setSecondsPerBarInput(String(next));
                void runMutation(() => gteApi.setSecondsPerBar(editorId, next));
              } else {
                setSecondsPerBarInput(String(secondsPerBar));
              }
            }}
            className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
          />
        </div>
        <button
          type="button"
          onClick={() => void router.push("/")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Generate tabs
        </button>
        <div className="text-xs text-slate-600">
          Scale: {scale}px/frame (auto)
        </div>
        <div className="text-xs text-slate-500">
          FPS: {fps} - Frames per bar: {computedFramesPerBar} - Total frames: {computedTotalFrames}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700">
        {Array.from({ length: barCount }).map((_, idx) => (
          <div
            key={`bar-chip-${idx}`}
            draggable
            onDragStart={() => setDragBarIndex(idx)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleBarDrop(idx)}
            onDragEnd={() => setDragBarIndex(null)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 ${
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
          className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
          title="Add bar"
        >
          +
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-0 text-xs text-slate-600">
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <div
                key={`labels-${rowIdx}`}
                className="flex flex-col gap-0"
                style={{ height: rowBlockHeight, marginBottom: rowIdx < rows - 1 ? ROW_GAP : 0 }}
              >
                {STRING_LABELS.map((label) => (
                  <div key={`${label}-${rowIdx}`} className="h-[28px] flex items-center justify-end pr-2">
                    {label}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div ref={timelineOuterRef} className="flex-1">
            <div className="relative" style={{ width: timelineWidth }}>
              <div
                ref={timelineRef}
                className={`relative rounded-xl border border-slate-200 bg-white ${
                  cutToolActive || sliceToolActive ? "cursor-crosshair" : ""
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
                {Array.from({ length: rows }).map((_, rowIdx) => {
                  const rowTop = rowIdx * rowStride;
                  const rowBarCount = Math.max(0, Math.min(BARS_PER_ROW, barCount - rowIdx * BARS_PER_ROW));
                  const rowWidth = Math.max(1, rowBarCount) * framesPerMeasure * scale;
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
                        [...Array(BARS_PER_ROW)].map((_, bidx) => {
                          const barIndex = rowIdx * BARS_PER_ROW + bidx;
                          if (barIndex >= barCount) return null;
                          const dividerX = bidx * framesPerMeasure * scale;
                          return (
                            <div key={`bar-${barIndex}`}>
                              {bidx > 0 && (
                                <div
                                  className="absolute top-0 bottom-0 w-[2px] bg-slate-400 pointer-events-none"
                                  style={{ left: dividerX }}
                                />
                              )}
                              <span
                                className="absolute -top-5 text-[10px] text-slate-600"
                                style={{ left: dividerX + 2 }}
                              >
                                Bar {barIndex + 1}
                              </span>
                            </div>
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
                  const safeFrame = clamp(Math.round(playheadFrame), 0, timelineEnd);
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
                        if (isPlaying) stopPlayback();
                        setPlayheadDragging(true);
                        const target = getPointerFrame(event.clientX, event.clientY);
                        if (target) setPlayheadFrame(target.time);
                      }}
                      className={`absolute z-30 cursor-col-resize`}
                      style={{ left, top, height, width: 2, transform: "translateX(-1px)" }}
                    >
                      <span
                        className={`absolute left-0 top-0 h-full w-[2px] rounded-full ${
                          isPlaying ? "bg-rose-500" : "bg-rose-400/70"
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
                  const preview =
                    dragging?.type === "note" && dragging.id === note.id ? dragPreview : null;
                  const multiDelta =
                    multiDragDelta !== null && selectedNoteIds.includes(note.id) ? multiDragDelta : null;
                  const displayStart =
                    multiDelta !== null ? note.startTime + multiDelta : preview?.startTime ?? note.startTime;
                  const displayString = preview?.stringIndex ?? note.tab[0];
                  const displayLength =
                    resizingNote?.id === note.id && resizePreviewLength !== null
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
                        className={`absolute cursor-grab rounded-md px-1 text-[11px] font-semibold text-slate-900 ${
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
                  const preview =
                    dragging?.type === "chord" && dragging.id === chord.id ? dragPreview : null;
                  const multiDelta =
                    multiDragDelta !== null && selectedChordIds.includes(chord.id) ? multiDragDelta : null;
                  const displayStart =
                    multiDelta !== null ? chord.startTime + multiDelta : preview?.startTime ?? chord.startTime;
                  const displayLength =
                    resizingChord?.id === chord.id && resizeChordPreviewLength !== null
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
                          className={`absolute cursor-grab rounded-md px-1 text-[11px] font-semibold text-slate-900 ${
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
                      <div className="text-[11px] font-semibold text-slate-700">
                        Note #{selectedNote.id}
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
                          void runMutation(() => gteApi.deleteNote(editorId, selectedNote.id));
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
                      <div className="text-[11px] font-semibold text-slate-700">
                        Chord #{selectedChord.id}
                      </div>
                      <div className="mt-2 space-y-2">
                        <label className="block text-[10px] text-slate-500">
                          Length
                          <input
                            type="number"
                            min={1}
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
                            void runMutation(() => gteApi.disbandChord(editorId, selectedChord.id));
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
                            void runMutation(() => gteApi.deleteChord(editorId, selectedChord.id));
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
                          value={draftNote.length ?? ""}
                          onChange={(e) =>
                            setDraftNote((prev) =>
                              prev ? { ...prev, length: parseOptionalNumber(e.target.value) } : prev
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
  );
}









