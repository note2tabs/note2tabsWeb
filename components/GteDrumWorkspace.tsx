import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorSnapshot, Note } from "../types/gte";
import { gteApi } from "../lib/gteApi";
import {
  buildDrumNote,
  DRUM_VOICES,
  getDrumVoiceForNote,
} from "../lib/gteDrums";
import { previewDrumVoice } from "../lib/gteDrumPlayback";
import { GTE_GUEST_EDITOR_ID } from "../lib/gteGuestDraft";

const FRAMES_PER_BAR = 480;
const LABEL_WIDTH = 112;
// Seven compact drum rows occupy roughly the same height as the six tab strings.
const ROW_HEIGHT = 20;
const RULER_HEIGHT = 20;
const DRAG_THRESHOLD_PX = 4;

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

type PointerInteraction = MarqueeInteraction | NoteDragInteraction;

type GteDrumWorkspaceProps = {
  canvasId: string;
  laneId: string;
  snapshot: EditorSnapshot;
  onSnapshotChange: (
    snapshot: EditorSnapshot,
    options?: { recordHistory?: boolean }
  ) => void;
  isActive: boolean;
  mobileViewport?: boolean;
  onFocusWorkspace?: () => void;
  sharedViewportBarCount?: number;
  sharedTimelineScrollRatio?: number;
  onSharedTimelineScrollRatioChange?: (ratio: number) => void;
  sharedTimelineBaseScale?: number;
  timelineZoomFactor?: number;
  snapSubdivisionsPerBeat?: number;
  globalSnapToGridEnabled?: boolean;
  globalPlaybackFrame?: number;
  getGlobalPlaybackFrame?: () => number;
  globalPlaybackIsPlaying?: boolean;
  globalPlaybackIsPreparing?: boolean;
  globalPlaybackVolume?: number;
  playbackUiVisible?: boolean;
  onGlobalPlaybackToggle?: () => void;
  onGlobalPlaybackVolumeChange?: (volume: number) => void;
};

const symbolForVoice = (voiceId: string) => {
  if (voiceId === "cymbal") return "✕";
  if (voiceId === "closed_hi_hat") return "×";
  if (voiceId === "open_hi_hat") return "○";
  if (voiceId === "sticks") return "Ⅱ";
  if (voiceId === "snare") return "S";
  if (voiceId === "kick") return "K";
  return "B";
};

export default function GteDrumWorkspace({
  canvasId,
  laneId,
  snapshot,
  onSnapshotChange,
  isActive,
  mobileViewport = false,
  onFocusWorkspace,
  sharedViewportBarCount,
  sharedTimelineScrollRatio,
  onSharedTimelineScrollRatioChange,
  sharedTimelineBaseScale,
  timelineZoomFactor = 1,
  snapSubdivisionsPerBeat = 1,
  globalSnapToGridEnabled = true,
  globalPlaybackFrame = 0,
  getGlobalPlaybackFrame,
  globalPlaybackIsPlaying = false,
  globalPlaybackIsPreparing = false,
  globalPlaybackVolume = 0.6,
  playbackUiVisible = false,
  onGlobalPlaybackToggle,
  onGlobalPlaybackVolumeChange,
}: GteDrumWorkspaceProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const interactionRef = useRef<PointerInteraction | null>(null);
  const selectedNoteIdsRef = useRef<Set<number>>(new Set());
  const snapshotNotesRef = useRef(snapshot.notes);
  const dragPreviewNotesRef = useRef<Note[] | null>(null);
  const [cursor, setCursor] = useState({ time: 0, voiceIndex: 0 });
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<number>>(
    () => new Set()
  );
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [dragPreviewNotes, setDragPreviewNotes] = useState<Note[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const tableBacked = canvasId !== GTE_GUEST_EDITOR_ID;

  const beatsPerBar = Math.max(1, Math.round(Number(snapshot.timeSignature) || 8));
  const barCount = Math.max(
    1,
    sharedViewportBarCount ?? 1,
    Math.ceil(Math.max(FRAMES_PER_BAR, snapshot.totalFrames) / FRAMES_PER_BAR)
  );
  const totalFrames = barCount * FRAMES_PER_BAR;
  const baseScale =
    sharedTimelineBaseScale !== undefined && Number.isFinite(sharedTimelineBaseScale)
      ? Math.max(0.5, Math.min(4, sharedTimelineBaseScale))
      : 0.5;
  const normalizedZoom = Math.max(0.25, Math.min(4, timelineZoomFactor));
  const pxPerFrame = baseScale * normalizedZoom;
  const barWidth = FRAMES_PER_BAR * pxPerFrame;
  const timelineWidth = LABEL_WIDTH + totalFrames * pxPerFrame;
  const gridStep = Math.max(
    1,
    Math.round(
      FRAMES_PER_BAR /
        (beatsPerBar * Math.max(1, Math.round(snapSubdivisionsPerBeat)))
    )
  );

  useEffect(() => {
    snapshotNotesRef.current = snapshot.notes;
  }, [snapshot.notes]);

  const replaceSelection = useCallback((next: Set<number>) => {
    selectedNoteIdsRef.current = next;
    setSelectedNoteIds(next);
  }, []);

  const snapTime = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(totalFrames - 1, time));
      return globalSnapToGridEnabled
        ? Math.round(clamped / gridStep) * gridStep
        : Math.round(clamped);
    },
    [globalSnapToGridEnabled, gridStep, totalFrames]
  );

  const updateSnapshotNotes = useCallback(
    (notes: Note[]) => {
      onSnapshotChange(
        {
          ...snapshot,
          editorType: "drums",
          type: "drums",
          trackType: "drums",
          notes,
          chords: [],
          noteEffects: [],
          updatedAt: new Date().toISOString(),
        },
        { recordHistory: !tableBacked }
      );
    },
    [onSnapshotChange, snapshot, tableBacked]
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
        updateSnapshotNotes(previousNotes);
        setSaveError(error?.message || "Could not save drum hit.");
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
        updateSnapshotNotes(previousNotes);
        replaceSelection(ids);
        setSaveError(error?.message || "Could not remove drum hit.");
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
        updateSnapshotNotes(previousNotes);
        setSaveError(error?.message || "Could not move drum hits.");
      }
    },
    [canvasId, laneId, tableBacked, updateSnapshotNotes]
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

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
        -minStart,
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
          startTime: Math.max(0, note.startTime + timeDelta),
          voiceIndex: originalVoiceIndex + voiceDelta,
          length: note.length,
        });
      });
      dragPreviewNotesRef.current = preview;
      setDragPreviewNotes(preview);
      setCursor({
        time: Math.max(0, interaction.anchorStartTime + timeDelta),
        voiceIndex: interaction.anchorVoiceIndex + voiceDelta,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      interactionRef.current = null;
      setSelectionBox(null);

      if (interaction.kind === "marquee") {
        if (!interaction.moved) {
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
  ]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || sharedTimelineScrollRatio === undefined) return;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const next = maxScroll * Math.max(0, Math.min(1, sharedTimelineScrollRatio));
    if (Math.abs(container.scrollLeft - next) < 1) return;
    syncingScrollRef.current = true;
    container.scrollLeft = next;
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, [sharedTimelineScrollRatio, timelineWidth]);

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
      if (event.key === "Escape") {
        replaceSelection(new Set());
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addHit,
    cursor.time,
    cursor.voiceIndex,
    deleteHits,
    gridStep,
    isActive,
    mobileViewport,
    onGlobalPlaybackToggle,
    replaceSelection,
    snapTime,
    snapshot.notes,
  ]);

  const gridLines = useMemo(() => {
    const lines: number[] = [];
    for (let frame = 0; frame <= totalFrames; frame += gridStep) lines.push(frame);
    return lines;
  }, [gridStep, totalFrames]);

  return (
    <div
      data-gte-track="true"
      data-gte-timeline-control="true"
      className={`relative overflow-hidden rounded-xl border bg-white ${
        isActive ? "border-sky-300 ring-1 ring-sky-100" : "border-slate-200"
      }`}
      onMouseDown={onFocusWorkspace}
    >
      {saveError && (
        <div className="absolute right-2 top-1 z-40 rounded bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
          {saveError}
        </div>
      )}
      <div
        ref={scrollRef}
        className="overflow-x-hidden overflow-y-hidden"
        style={{ height: RULER_HEIGHT + ROW_HEIGHT * DRUM_VOICES.length }}
        onScroll={(event) => {
          if (syncingScrollRef.current) return;
          const element = event.currentTarget;
          const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
          onSharedTimelineScrollRatioChange?.(
            maxScroll > 0 ? element.scrollLeft / maxScroll : 0
          );
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as Element;
          if (target.closest("[data-drum-hit='true']")) return;
          const point = pointerContentPoint(event.clientX, event.clientY);
          if (
            !point ||
            event.clientY <
              event.currentTarget.getBoundingClientRect().top + RULER_HEIGHT
          ) {
            return;
          }
          event.preventDefault();
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
          };
        }}
      >
        <div
          className="relative select-none"
          style={{
            width: timelineWidth,
            height: RULER_HEIGHT + ROW_HEIGHT * DRUM_VOICES.length,
          }}
        >
          <div
            className="absolute left-0 top-0 z-30 border-b border-r border-slate-200 bg-slate-100"
            style={{ width: LABEL_WIDTH, height: RULER_HEIGHT }}
          />
          <div
            className="absolute top-0 border-b border-slate-200 bg-slate-50"
            style={{ left: LABEL_WIDTH, right: 0, height: RULER_HEIGHT }}
          >
            {Array.from({ length: barCount }, (_, index) => (
              <span
                key={`drum-bar-${index}`}
                className="absolute top-0.5 text-[9px] font-semibold text-slate-500"
                style={{ left: index * barWidth + 6 }}
              >
                Bar {index + 1}
              </span>
            ))}
          </div>

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
                className="sticky left-0 z-20 flex h-full items-center justify-between border-r border-slate-200 bg-slate-100 px-2 text-[10px] font-semibold text-slate-700"
                style={{ width: LABEL_WIDTH }}
                title={`${voice.label} · key ${voice.key}`}
              >
                <span className="truncate">{voice.label}</span>
                <kbd className="ml-1 rounded bg-white px-1 text-[9px] text-slate-500">
                  {voice.key}
                </kbd>
              </div>
            </div>
          ))}

          {gridLines.map((frame) => {
            const isBar = frame % FRAMES_PER_BAR === 0;
            return (
              <div
                key={`drum-grid-${frame}`}
                className={`pointer-events-none absolute ${
                  isBar ? "bg-slate-400" : "bg-slate-200"
                }`}
                style={{
                  left: LABEL_WIDTH + frame * pxPerFrame,
                  top: RULER_HEIGHT,
                  width: isBar ? 1.5 : 1,
                  height: ROW_HEIGHT * DRUM_VOICES.length,
                }}
              />
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

          {(dragPreviewNotes ?? snapshot.notes).map((note) => {
            const voice = getDrumVoiceForNote(note);
            const voiceIndex = DRUM_VOICES.findIndex((candidate) => candidate.id === voice.id);
            const selected = selectedNoteIds.has(note.id);
            return (
              <button
                key={note.id}
                type="button"
                data-drum-hit="true"
                className={`absolute z-20 flex h-3.5 w-3.5 cursor-grab touch-none items-center justify-center rounded border text-[9px] font-bold shadow-sm active:cursor-grabbing ${
                  selected
                    ? "border-sky-700 bg-sky-600 text-white"
                    : "border-slate-600 bg-white text-slate-800 hover:bg-sky-50"
                }`}
                style={{
                  left:
                    LABEL_WIDTH +
                    (note.startTime + gridStep / 2) * pxPerFrame -
                    7,
                  top: RULER_HEIGHT + voiceIndex * ROW_HEIGHT + 3,
                }}
                title={`${voice.label} at frame ${note.startTime}`}
                aria-label={`${voice.label} drum hit`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  event.preventDefault();
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
                  event.stopPropagation();
                  void previewDrumVoice(voice.id).catch(() => {});
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  void deleteHits([note.id]);
                }}
              >
                {symbolForVoice(voice.id)}
              </button>
            );
          })}

          <div
            ref={playheadRef}
            className="pointer-events-none absolute left-0 top-0 z-20 w-px bg-rose-500"
            style={{ height: RULER_HEIGHT + ROW_HEIGHT * DRUM_VOICES.length }}
          />
        </div>
      </div>
      {playbackUiVisible && (
        <div
          data-gte-floating-ui="true"
          className="pointer-events-none fixed bottom-10 left-1/2 z-[9997] flex -translate-x-1/2 items-center gap-2 px-2"
        >
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
        </div>
      )}
    </div>
  );
}
