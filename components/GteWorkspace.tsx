import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { gteApi } from "../lib/gteApi";
import type { CutWithCoord, EditorSnapshot, TabCoord } from "../types/gte";

type Props = {
  editorId: string;
  snapshot: EditorSnapshot;
  onSnapshotChange: (snapshot: EditorSnapshot) => void;
};

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];
const ROW_HEIGHT = 36;

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
};

type DragPreview = {
  startTime: number;
  stringIndex?: number;
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

export default function GteWorkspace({ editorId, snapshot, onSnapshotChange }: Props) {
  const [scale, setScale] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [selectedChordId, setSelectedChordId] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState<DraftNote | null>(null);
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
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [dragBarIndex, setDragBarIndex] = useState<number | null>(null);
  const [segmentDragIndex, setSegmentDragIndex] = useState<number | null>(null);
  const [ioPayload, setIoPayload] = useState("");
  const [ioMessage, setIoMessage] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const segmentEditsRef = useRef<SegmentEdit[]>(segmentEdits);
  const dragPreviewRef = useRef<DragPreview | null>(dragPreview);
  const selectionRef = useRef<SelectionState | null>(null);

  const framesPerMeasure = snapshot.framesPerMessure || 0;
  const totalFrames = snapshot.totalFrames || 0;
  const maxFret = snapshot.tabRef?.[0]?.length ? snapshot.tabRef[0].length - 1 : 22;
  const barCount =
    framesPerMeasure > 0 ? Math.max(1, Math.ceil(totalFrames / framesPerMeasure)) : 1;
  const timelineWidth = Math.max(1, totalFrames) * scale;

  const selectedNote = useMemo(
    () => snapshot.notes.find((note) => note.id === selectedNoteIds[0]) || null,
    [snapshot.notes, selectedNoteIds]
  );

  const selectedChord = useMemo(
    () => snapshot.chords.find((chord) => chord.id === selectedChordId) || null,
    [snapshot.chords, selectedChordId]
  );

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
    selectionRef.current = selection;
  }, [selection]);

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
    if (selectedChordId !== null) {
      void gteApi
        .getChordAlternatives(editorId, selectedChordId)
        .then((data) => setChordAlternatives(data.alternatives || []))
        .catch(() => setChordAlternatives([]));
    } else {
      setChordAlternatives([]);
    }
  }, [editorId, selectedChordId]);

  useEffect(() => {
    setSelectedNoteIds((prev) => prev.filter((id) => snapshot.notes.some((note) => note.id === id)));
    setSelectedChordId((prev) =>
      prev !== null && snapshot.chords.some((chord) => chord.id === prev) ? prev : null
    );
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

  const runMutation = async <T extends { snapshot?: EditorSnapshot }>(fn: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      const data = await fn();
      if (data.snapshot) onSnapshotChange(data.snapshot);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const startTime = clamp(Math.round(x / scale), 0, Math.max(0, totalFrames));
      if (dragging.type === "note") {
        const stringIndex = clamp(Math.floor(y / ROW_HEIGHT), 0, 5);
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
        const targetStart = preview.startTime ?? dragging.startTime;
        setBusy(true);
        setError(null);
        try {
          if (targetString !== dragging.stringIndex) {
            const res = await gteApi.assignNoteTab(editorId, dragging.id, [
              targetString,
              dragging.fret ?? 0,
            ]);
            onSnapshotChange(res.snapshot);
          }
          if (targetStart !== dragging.startTime) {
            const res = await gteApi.setNoteStartTime(editorId, dragging.id, targetStart);
            onSnapshotChange(res.snapshot);
          }
        } catch (err: any) {
          setError(err?.message || "Could not move note.");
        } finally {
          setBusy(false);
        }
      } else if (dragging.type === "chord") {
        const targetStart = preview.startTime ?? dragging.startTime;
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
  }, [dragging, editorId, onSnapshotChange, runMutation, scale, totalFrames, clamp]);

  useEffect(() => {
    if (!selection) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, timelineWidth);
      const y = clamp(event.clientY - rect.top, 0, ROW_HEIGHT * 6);
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
        const stringIndex = clamp(Math.floor(current.startY / ROW_HEIGHT), 0, 5);
        const startTime = clamp(Math.round(current.startX / scale), 0, Math.max(0, totalFrames));
        setDraftNote({
          stringIndex,
          startTime,
          length: Math.max(1, Math.round(framesPerMeasure / 4) || 1),
          fret: 0,
        });
      } else {
        const minX = Math.min(current.startX, current.endX);
        const maxX = Math.max(current.startX, current.endX);
        const minY = Math.min(current.startY, current.endY);
        const maxY = Math.max(current.startY, current.endY);
        const startFrame = clamp(Math.floor(minX / scale), 0, Math.max(0, totalFrames));
        const endFrame = clamp(Math.ceil(maxX / scale), 0, Math.max(0, totalFrames));
        const startString = clamp(Math.floor(minY / ROW_HEIGHT), 0, 5);
        const endString = clamp(Math.floor(maxY / ROW_HEIGHT), 0, 5);
        const selectedIds = snapshot.notes
          .filter((note) => note.tab[0] >= startString && note.tab[0] <= endString)
          .filter((note) => note.startTime < endFrame && note.startTime + note.length > startFrame)
          .map((note) => note.id);
        setSelectedNoteIds((prev) => {
          if (current.additive) {
            const merged = new Set(prev);
            selectedIds.forEach((id) => merged.add(id));
            return Array.from(merged);
          }
          return selectedIds;
        });
        setSelectedChordId(null);
        setDraftNote(null);
      }
      setSelection(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [selection, scale, totalFrames, framesPerMeasure, timelineWidth, snapshot.notes, clamp]);

  useEffect(() => {
    if (segmentDragIndex === null) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      if (!timelineRef.current) return;
      const segments = segmentEditsRef.current;
      const left = segments[segmentDragIndex];
      const right = segments[segmentDragIndex + 1];
      if (!left || !right) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const rawTime = Math.round(x / scale);
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
  }, [segmentDragIndex, editorId, runMutation, scale, clamp]);

  const handleTimelineMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, timelineWidth);
    const y = clamp(event.clientY - rect.top, 0, ROW_HEIGHT * 6);
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
    setSelectedNoteIds([noteId]);
    setSelectedChordId(null);
    setDraftNote(null);
    setDragging({ type: "note", id: noteId, stringIndex, fret, startTime, length });
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
    setSelectedChordId(chordId);
    setSelectedNoteIds([]);
    setDraftNote(null);
    setDragging({ type: "chord", id: chordId, startTime, length });
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
      onSnapshotChange(res.snapshot);
      setIoMessage("Import complete.");
    } catch (err: any) {
      setError(err?.message || "Could not import tab JSON.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = () => {
    if (!draftNote) return;
    const { fret, length } = draftNote;
    if (fret === null || length === null) {
      setError("Enter a fret and length before adding the note.");
      return;
    }
    void runMutation(() =>
      gteApi.addNote(editorId, {
        tab: [draftNote.stringIndex, fret],
        startTime: draftNote.startTime,
        length,
      })
    );
    setDraftNote(null);
  };

  const handleNoteSelect = (noteId: number, event: ReactMouseEvent) => {
    event.stopPropagation();
    if (event.shiftKey) {
      setSelectedNoteIds((prev) =>
        prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]
      );
    } else {
      setSelectedNoteIds([noteId]);
    }
    setSelectedChordId(null);
    setDraftNote(null);
  };

  const handleChordSelect = (chordId: number, event: ReactMouseEvent) => {
    event.stopPropagation();
    setSelectedChordId(chordId);
    setSelectedNoteIds([]);
    setDraftNote(null);
  };

  const handleAssignOptimals = () => {
    if (!selectedNoteIds.length) return;
    void runMutation(() => gteApi.assignOptimals(editorId, selectedNoteIds));
  };

  const handleMakeChord = () => {
    if (selectedNoteIds.length < 2) return;
    void runMutation(() => gteApi.makeChord(editorId, selectedNoteIds));
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
    const startValue = startTime;
    const lengthValue = length;
    setBusy(true);
    setError(null);
    try {
      let nextSnapshot: EditorSnapshot | null = null;
      if (stringValue !== selectedNote.tab[0] || fretValue !== selectedNote.tab[1]) {
        const res = await gteApi.assignNoteTab(editorId, selectedNote.id, [stringValue, fretValue]);
        nextSnapshot = res.snapshot;
        onSnapshotChange(res.snapshot);
      }
      if (startValue !== selectedNote.startTime) {
        const res = await gteApi.setNoteStartTime(editorId, selectedNote.id, startValue);
        nextSnapshot = res.snapshot;
        onSnapshotChange(res.snapshot);
      }
      if (lengthValue !== selectedNote.length) {
        const res = await gteApi.setNoteLength(editorId, selectedNote.id, lengthValue);
        nextSnapshot = res.snapshot;
        onSnapshotChange(res.snapshot);
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
    const startValue = startTime;
    const lengthValue = length;
    setBusy(true);
    setError(null);
    try {
      if (startValue !== selectedChord.startTime) {
        const res = await gteApi.setChordStartTime(editorId, selectedChord.id, startValue);
        onSnapshotChange(res.snapshot);
      }
      if (lengthValue !== selectedChord.length) {
        const res = await gteApi.setChordLength(editorId, selectedChord.id, lengthValue);
        onSnapshotChange(res.snapshot);
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
    setSelectedChordId(null);
  };

  const handleDeleteChord = () => {
    if (!selectedChord) return;
    void runMutation(() => gteApi.deleteChord(editorId, selectedChord.id));
    setSelectedChordId(null);
  };

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

  const handleAssignAlt = (tab: TabCoord) => {
    if (!selectedNote) return;
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

  const play = () => {
    if (isPlaying) return;
    const ctx = new AudioContext();
    void ctx.resume();
    audioRef.current = ctx;
    const base = ctx.currentTime + 0.1;
    const fps = snapshot.fps || 1;
    const events: Array<{
      start: number;
      duration: number;
      midi: number;
      gain: number;
      stringIndex?: number;
      key: string;
    }> = [];
    const tabRef = snapshot.tabRef;
    const midiFromTab = (tab: TabCoord, fallback?: number) => {
      const value = tabRef?.[tab[0]]?.[tab[1]];
      if (value !== undefined && value !== null) return Number(value);
      return fallback ?? 0;
    };
    snapshot.notes.forEach((note) => {
      const key = `note-${note.id}`;
      const gain = conflictInfo.conflictKeys.has(key) ? 0.25 : 0.55;
      events.push({
        start: note.startTime / fps,
        duration: note.length / fps,
        midi: note.midiNum,
        gain,
        stringIndex: note.tab[0],
        key,
      });
    });
    snapshot.chords.forEach((chord) => {
      chord.currentTabs.forEach((tab, idx) => {
        const key = `chord-${chord.id}-${idx}`;
        const gain = conflictInfo.conflictKeys.has(key) ? 0.25 : 0.5;
        const midi = midiFromTab(tab, chord.originalMidi[idx]);
        events.push({
          start: chord.startTime / fps,
          duration: chord.length / fps,
          midi,
          gain,
          stringIndex: tab[0],
          key,
        });
      });
    });
    if (!events.length) return;
    const maxTime = events.reduce((acc, evt) => Math.max(acc, evt.start + evt.duration), 0);
    const master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    const makeNoiseBuffer = (durationSeconds: number) => {
      const length = Math.max(1, Math.floor(ctx.sampleRate * durationSeconds));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    };

    const schedulePluck = (evt: {
      start: number;
      duration: number;
      midi: number;
      gain: number;
      stringIndex?: number;
    }) => {
      if (!Number.isFinite(evt.midi) || evt.midi <= 0) return;
      const startAt = base + evt.start;
      const duration = Math.max(0.08, evt.duration);
      const release = Math.min(0.25, Math.max(0.08, duration * 0.3));
      const stopAt = startAt + duration + release;
      const stringIndex = evt.stringIndex ?? 0;
      const frequency = 440 * Math.pow(2, (evt.midi - 69) / 12);

      const noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(0.03);
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = evt.gain * 0.6;

      const delay = ctx.createDelay();
      delay.delayTime.value = 1 / frequency;

      const feedback = ctx.createGain();
      const feedbackBase = 0.86 - frequency / 4000 + (5 - stringIndex) * 0.02;
      feedback.gain.value = clamp(feedbackBase, 0.6, 0.92);

      const loopFilter = ctx.createBiquadFilter();
      loopFilter.type = "lowpass";
      loopFilter.frequency.value = Math.min(6500, 1200 + frequency * 6);
      loopFilter.Q.value = 0.8;

      const body = ctx.createBiquadFilter();
      body.type = "peaking";
      body.frequency.value = 180 + stringIndex * 25;
      body.Q.value = 1.2;
      body.gain.value = 4;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, startAt);
      amp.gain.exponentialRampToValueAtTime(evt.gain, startAt + 0.005);
      amp.gain.exponentialRampToValueAtTime(0.001, stopAt);

      noise.connect(noiseGain);
      noiseGain.connect(delay);

      delay.connect(loopFilter);
      loopFilter.connect(feedback);
      feedback.connect(delay);

      delay.connect(body);
      body.connect(amp);
      amp.connect(master);

      feedback.gain.setValueAtTime(feedback.gain.value, startAt);
      feedback.gain.exponentialRampToValueAtTime(0.0001, stopAt);

      noise.start(startAt);
      noise.stop(startAt + 0.03);
    };

    events.forEach((evt) => schedulePluck(evt));
    setIsPlaying(true);
    window.setTimeout(() => {
      if (audioRef.current === ctx) {
        void ctx.close();
        audioRef.current = null;
        setIsPlaying(false);
      }
    }, (maxTime + 0.5) * 1000);
  };

  const stop = () => {
    if (audioRef.current) {
      void audioRef.current.close();
      audioRef.current = null;
    }
    setIsPlaying(false);
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
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (selectedNote) {
        void runMutation(() => gteApi.deleteNote(editorId, selectedNote.id));
        setSelectedNoteIds([]);
      } else if (selectedChord) {
        void runMutation(() => gteApi.deleteChord(editorId, selectedChord.id));
        setSelectedChordId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedNote, selectedChord, editorId, runMutation]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleAddBar}
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200"
        >
          Add bar
        </button>
        <button
          type="button"
          onClick={isPlaying ? stop : play}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          {isPlaying ? "Stop playback" : "Play"}
        </button>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>Scale</span>
          <input
            type="range"
            min={2}
            max={12}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
          <span>{scale}px/frame</span>
        </div>
        <div className="text-xs text-slate-500">
          Frames per bar: {framesPerMeasure} - Total frames: {totalFrames}
        </div>
      </div>

      {barCount > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto text-xs text-slate-700">
          {Array.from({ length: barCount }).map((_, idx) => (
            <div
              key={`bar-chip-${idx}`}
              draggable
              onDragStart={() => setDragBarIndex(idx)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleBarDrop(idx)}
              onDragEnd={() => setDragBarIndex(null)}
              className={`rounded-md border px-2 py-1 ${
                dragBarIndex === idx
                  ? "border-blue-400 bg-blue-500/20"
                  : "border-slate-200 bg-white"
              }`}
            >
              Bar {idx + 1}
            </div>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-2 text-xs text-slate-600 pt-6">
            {STRING_LABELS.map((label) => (
              <div key={label} className="h-[36px] flex items-center justify-end pr-2">
                {label}
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-x-auto">
            <div className="relative" style={{ width: timelineWidth }}>
              <div
                ref={timelineRef}
                className="relative rounded-xl border border-slate-200 bg-white"
                style={{ height: ROW_HEIGHT * 6 }}
                onMouseDown={handleTimelineMouseDown}
              >
                {[...Array(6)].map((_, idx) => (
                  <div
                    key={`row-${idx}`}
                    className="absolute left-0 right-0 border-t border-slate-200"
                    style={{ top: idx * ROW_HEIGHT }}
                  />
                ))}
                {framesPerMeasure > 0 &&
                  [...Array(Math.ceil(totalFrames / framesPerMeasure))].map((_, idx) => (
                    <div
                      key={`bar-${idx}`}
                      className="absolute top-0 bottom-0 border-l border-slate-200"
                      style={{ left: idx * framesPerMeasure * scale }}
                    >
                      <span className="absolute -top-5 text-[10px] text-slate-600">Bar {idx + 1}</span>
                    </div>
                  ))}

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

                {snapshot.notes.map((note) => {
                  const preview =
                    dragging?.type === "note" && dragging.id === note.id ? dragPreview : null;
                  const displayStart = preview?.startTime ?? note.startTime;
                  const displayString = preview?.stringIndex ?? note.tab[0];
                  return (
                    <button
                      key={`note-${note.id}`}
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
                      onClick={(event) => handleNoteSelect(note.id, event)}
                      className={`absolute cursor-grab rounded-md px-1 text-[11px] font-semibold text-slate-900 ${
                        selectedNoteIds.includes(note.id)
                          ? "bg-amber-400"
                          : conflictInfo.noteConflicts.has(note.id)
                          ? "bg-red-400/80"
                          : "bg-emerald-400"
                      }`}
                      style={{
                        top: displayString * ROW_HEIGHT + 6,
                        left: displayStart * scale,
                        width: Math.max(10, note.length * scale),
                        height: ROW_HEIGHT - 12,
                      }}
                    >
                      {note.tab[1]}
                    </button>
                  );
                })}

                {snapshot.chords.map((chord) => {
                  const preview =
                    dragging?.type === "chord" && dragging.id === chord.id ? dragPreview : null;
                  const displayStart = preview?.startTime ?? chord.startTime;
                  return chord.currentTabs.map((tab, idx) => (
                    <button
                      key={`chord-${chord.id}-${idx}`}
                      type="button"
                      onMouseDown={(event) => startChordDrag(chord.id, chord.startTime, chord.length, event)}
                      onClick={(event) => handleChordSelect(chord.id, event)}
                      className={`absolute cursor-grab rounded-md px-1 text-[11px] font-semibold text-slate-900 ${
                        selectedChordId === chord.id ? "bg-blue-400" : "bg-blue-300"
                      }`}
                      style={{
                        top: tab[0] * ROW_HEIGHT + 6,
                        left: displayStart * scale,
                        width: Math.max(10, chord.length * scale),
                        height: ROW_HEIGHT - 12,
                      }}
                    >
                      {tab[1]}
                    </button>
                  ));
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="relative h-12 rounded-lg border border-slate-200 bg-white" style={{ width: timelineWidth }}>
            {segmentEdits.map((segment, idx) => (
              <div
                key={`segment-${idx}`}
                className="absolute top-2 h-8 rounded-md bg-blue-500/70 text-[10px] font-semibold text-slate-900 flex items-center justify-center"
                style={{
                  left: segment.start * scale,
                  width: Math.max(8, (segment.end - segment.start) * scale),
                }}
              >
                {segment.stringIndex ?? "-"}, {segment.fret ?? "-"}
              </div>
            ))}
            {segmentEdits.slice(0, -1).map((segment, idx) => (
              <div
                key={`segment-boundary-${idx}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSegmentDragIndex(idx);
                }}
                className="absolute top-1 h-10 w-1 cursor-ew-resize rounded bg-slate-200/80"
                style={{ left: segment.end * scale - 1 }}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-600">Drag segment boundaries to resize.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Note + chord controls</h2>

            {draftNote && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <p className="text-xs text-slate-600">
                  New note - String {STRING_LABELS[draftNote.stringIndex]} - Start {draftNote.startTime}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs text-slate-600">
                    Fret
                    <input
                      type="number"
                      min={0}
                      max={maxFret}
                      value={draftNote.fret ?? ""}
                      onChange={(e) =>
                        setDraftNote((prev) =>
                          prev ? { ...prev, fret: parseOptionalNumber(e.target.value) } : prev
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Length
                    <input
                      type="number"
                      min={1}
                      value={draftNote.length ?? ""}
                      onChange={(e) =>
                        setDraftNote((prev) =>
                          prev ? { ...prev, length: parseOptionalNumber(e.target.value) } : prev
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={handleAddNote}
                      disabled={busy}
                      className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-emerald-400"
                    >
                      Add note
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftNote(null)}
                      className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-800 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {selectedNote && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-600">Selected note #{selectedNote.id}</p>
                  <span className="text-[10px] text-slate-500">
                    {conflictInfo.noteConflicts.has(selectedNote.id) ? "Unplayable" : "Playable"}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="text-xs text-slate-600">
                    String
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={noteForm.stringIndex ?? ""}
                      onChange={(e) =>
                        setNoteForm((prev) => ({ ...prev, stringIndex: parseOptionalNumber(e.target.value) }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Fret
                    <input
                      type="number"
                      min={0}
                      max={maxFret}
                      value={noteForm.fret ?? ""}
                      onChange={(e) =>
                        setNoteForm((prev) => ({ ...prev, fret: parseOptionalNumber(e.target.value) }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Start
                    <input
                      type="number"
                      min={0}
                      value={noteForm.startTime ?? ""}
                      onChange={(e) =>
                        setNoteForm((prev) => ({ ...prev, startTime: parseOptionalNumber(e.target.value) }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Length
                    <input
                      type="number"
                      min={1}
                      value={noteForm.length ?? ""}
                      onChange={(e) =>
                        setNoteForm((prev) => ({ ...prev, length: parseOptionalNumber(e.target.value) }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUpdateNote}
                    disabled={busy}
                    className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                  >
                    Update note
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteNote}
                    disabled={busy}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-800 hover:bg-slate-100"
                  >
                    Delete note
                  </button>
                </div>
                {noteAlternates && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">Alternate positions</p>
                    <div className="flex flex-wrap gap-2">
                      {noteAlternates.possibleTabs.map((tab, idx) => (
                        <button
                          key={`alt-${idx}`}
                          type="button"
                          onClick={() => handleAssignAlt(tab)}
                          className="rounded-md bg-emerald-500/80 px-2 py-1 text-[11px] font-semibold text-slate-900"
                        >
                          {tab[0]},{tab[1]}
                        </button>
                      ))}
                      {noteAlternates.blockedTabs.map((tab, idx) => (
                        <button
                          key={`blocked-${idx}`}
                          type="button"
                          onClick={() => handleAssignAlt(tab)}
                          className="rounded-md bg-red-500/70 px-2 py-1 text-[11px] font-semibold text-slate-900"
                        >
                          {tab[0]},{tab[1]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedNoteIds.length > 1 && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <p className="text-xs text-slate-600">Selected notes: {selectedNoteIds.join(", ")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMakeChord}
                    className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                  >
                    Make chord
                  </button>
                  <button
                    type="button"
                    onClick={handleAssignOptimals}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-800 hover:bg-slate-100"
                  >
                    Assign optimals
                  </button>
                </div>
              </div>
            )}

            {selectedChord && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                <p className="text-xs text-slate-600">Chord #{selectedChord.id}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    Start
                    <input
                      type="number"
                      min={0}
                      value={chordForm.startTime ?? ""}
                      onChange={(e) =>
                        setChordForm((prev) => ({ ...prev, startTime: parseOptionalNumber(e.target.value) }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Length
                    <input
                      type="number"
                      min={1}
                      value={chordForm.length ?? ""}
                      onChange={(e) =>
                        setChordForm((prev) => ({ ...prev, length: parseOptionalNumber(e.target.value) }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleChordUpdate}
                    className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                  >
                    Update chord
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShiftChordOctave(-1)}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-800 hover:bg-slate-100"
                  >
                    Octave down
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShiftChordOctave(1)}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-800 hover:bg-slate-100"
                  >
                    Octave up
                  </button>
                  <button
                    type="button"
                    onClick={handleDisbandChord}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-800 hover:bg-slate-100"
                  >
                    Disband chord
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteChord}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-800 hover:bg-slate-100"
                  >
                    Delete chord
                  </button>
                </div>
                {chordTabsForm.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">Chord tabs</p>
                    <div className="space-y-2">
                      {chordTabsForm.map((tab, idx) => (
                        <div key={`chord-tab-${idx}`} className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={tab[0] ?? ""}
                            onChange={(e) =>
                              setChordTabsForm((prev) =>
                                prev.map((entry, eidx) =>
                                  eidx === idx ? [parseOptionalNumber(e.target.value), entry[1]] : entry
                                )
                              )
                            }
                            className="w-12 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                          />
                          <input
                            type="number"
                            min={0}
                            max={maxFret}
                            value={tab[1] ?? ""}
                            onChange={(e) =>
                              setChordTabsForm((prev) =>
                                prev.map((entry, eidx) =>
                                  eidx === idx ? [entry[0], parseOptionalNumber(e.target.value)] : entry
                                )
                              )
                            }
                            className="w-14 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyChordTabs(chordTabsForm)}
                      className="rounded-md bg-emerald-500/80 px-2 py-1 text-[11px] font-semibold text-slate-900"
                    >
                      Apply tabs
                    </button>
                  </div>
                )}
                {chordAlternatives.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">Alternate fingerings</p>
                    <div className="flex flex-wrap gap-2">
                      {chordAlternatives.slice(0, 10).map((tabs, idx) => (
                        <button
                          key={`chord-alt-${idx}`}
                          type="button"
                          onClick={() => handleApplyChordTabs(tabs)}
                          className="rounded-md bg-amber-400/80 px-2 py-1 text-[11px] font-semibold text-slate-900"
                        >
                          {tabs.map((tab) => `${tab[0]},${tab[1]}`).join(" | ")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Cut segments</h2>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateCuts}
                  className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  Generate segments
                </button>
                <button
                  type="button"
                  onClick={handleApplySegments}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-800 hover:bg-slate-100"
                >
                  Save segment coords
                </button>
              </div>

              <div className="space-y-2">
                {segmentEdits.map((seg, idx) => (
                  <div
                    key={`seg-${idx}`}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs text-slate-700"
                  >
                    <span>
                      {seg.start} {"->"} {seg.end}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={seg.stringIndex ?? ""}
                      onChange={(e) =>
                        setSegmentEdits((prev) =>
                          prev.map((item, sidx) =>
                            sidx === idx
                              ? { ...item, stringIndex: parseOptionalNumber(e.target.value) }
                              : item
                          )
                        )
                      }
                      className="w-12 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      max={maxFret}
                      value={seg.fret ?? ""}
                      onChange={(e) =>
                        setSegmentEdits((prev) =>
                          prev.map((item, sidx) =>
                            sidx === idx ? { ...item, fret: parseOptionalNumber(e.target.value) } : item
                          )
                        )
                      }
                      className="w-14 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                    />
                  </div>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-slate-200 bg-white p-2 space-y-2">
                  <p className="text-[11px] text-slate-600">Insert boundary</p>
                  <input
                    type="number"
                    min={1}
                    value={insertTime ?? ""}
                    onChange={(e) => setInsertTime(parseOptionalNumber(e.target.value))}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={insertString ?? ""}
                      onChange={(e) => setInsertString(parseOptionalNumber(e.target.value))}
                      className="w-12 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      max={maxFret}
                      value={insertFret ?? ""}
                      onChange={(e) => setInsertFret(parseOptionalNumber(e.target.value))}
                      className="w-14 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleInsertBoundary}
                    className="rounded-md bg-emerald-500/80 px-2 py-1 text-[11px] font-semibold text-slate-900"
                  >
                    Insert
                  </button>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-2 space-y-2">
                  <p className="text-[11px] text-slate-600">Shift boundary</p>
                  <input
                    type="number"
                    min={0}
                    value={shiftBoundaryIndex ?? ""}
                    onChange={(e) => setShiftBoundaryIndex(parseOptionalNumber(e.target.value))}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  />
                  <input
                    type="number"
                    min={1}
                    value={shiftBoundaryTime ?? ""}
                    onChange={(e) => setShiftBoundaryTime(parseOptionalNumber(e.target.value))}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleShiftBoundary}
                    className="rounded-md bg-emerald-500/80 px-2 py-1 text-[11px] font-semibold text-slate-900"
                  >
                    Shift
                  </button>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-2 space-y-2">
                  <p className="text-[11px] text-slate-600">Delete boundary</p>
                  <input
                    type="number"
                    min={0}
                    value={deleteBoundaryIndex ?? ""}
                    onChange={(e) => setDeleteBoundaryIndex(parseOptionalNumber(e.target.value))}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleDeleteBoundary}
                    className="rounded-md bg-red-500/80 px-2 py-1 text-[11px] font-semibold text-slate-900"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Import / export</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-800 hover:bg-slate-100"
              >
                Import JSON
              </button>
            </div>
          </div>
          <textarea
            value={ioPayload}
            onChange={(e) => setIoPayload(e.target.value)}
            placeholder='Paste exported JSON here (must include "stamps").'
            className="w-full min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
          />
          {ioMessage && <p className="text-xs text-emerald-300">{ioMessage}</p>}
        </div>
      </div>
    </div>
  );
}
