import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gteApi } from "../lib/gteApi";
import {
  TAB_IMPORT_ACCEPT,
  getTabImportExtension,
  parseTabImportFile,
  type ParsedTabFileImport,
} from "../lib/gteTabImport";
import type { CanvasSnapshot, EditorSnapshot, GteTrackType, Note, TabCoord } from "../types/gte";
import {
  DEFAULT_TRACK_INSTRUMENT_ID,
  prepareTrackInstrument,
  schedulePreparedTrackNote,
} from "../lib/gteSamplePlayback";
import { createPlaybackLookaheadScheduler } from "../lib/gtePlaybackLookahead";
import { buildImportTrackPreviewEvents } from "../lib/gteImportTrackPreview";
import {
  getAllTabsForMidi,
  getTabMidi as getSnapshotTabMidi,
} from "../lib/gteTuning";
import { getTrackTypeLabel, normalizeGteTrackType } from "../lib/gteTrackTypes";

type Props = {
  editorId?: string;
  createEditor?: (name: string) => Promise<{ editorId: string; laneId: string }>;
  onImported: (editorId: string, result?: ImportResult) => void | Promise<void>;
  onError: (message: string) => void;
  className: string;
  disabled?: boolean;
  children: ReactNode;
  busyLabel?: ReactNode;
  title?: string;
};

type ImportTrack = {
  name?: string;
  stamps: Array<[number, TabCoord, number]>;
  midiNotes?: number[];
  framesPerMessure?: number;
  fps?: number;
  totalFrames?: number;
  representation?: GteTrackType;
  detectionConfidence?: "high" | "medium" | "low";
  midiProgram?: number;
};

export type ImportResult = {
  firstLaneId: string;
  tracks: Array<{
    laneId: string;
    name: string;
    representation: GteTrackType;
    detectionConfidence: "high" | "medium" | "low";
  }>;
};

type SelectableImportFormat = "MIDI" | "MusicXML";

type PendingTrackSelection = {
  format: SelectableImportFormat;
  parsed: ParsedTabFileImport;
  tracks: ImportTrack[];
  selectedIndexes: Set<number>;
};

type ActiveTrackPreview = {
  ctx: AudioContext;
  animationFrame: number | null;
  trackIndex: number;
};

const getSelectableImportFormat = (fileName: string): SelectableImportFormat | null => {
  const extension = getTabImportExtension(fileName);
  if (extension === "mid" || extension === "midi") return "MIDI";
  if (extension === "xml" || extension === "musicxml" || extension === "mxl") return "MusicXML";
  return null;
};

const getImportFormatLabel = (fileName: string) => {
  const selectable = getSelectableImportFormat(fileName);
  if (selectable) return selectable;
  const extension = getTabImportExtension(fileName);
  if (extension === "json") return "Note2Tabs file";
  if (["gp", "gp3", "gp4", "gp5", "gpx", "gtp"].includes(extension)) return "Guitar Pro file";
  return "tab file";
};

const isCanvasSnapshot = (value: unknown): value is CanvasSnapshot =>
  Boolean(value && typeof value === "object" && Array.isArray((value as CanvasSnapshot).editors));

const clampTab = (tab: TabCoord | undefined): TabCoord => [
  Math.max(0, Math.min(5, Math.round(Number(tab?.[0] ?? 0)))),
  Math.max(0, Math.min(24, Math.round(Number(tab?.[1] ?? 0)))),
];

const getTabMidi = (lane: EditorSnapshot, tab: TabCoord) => {
  return getSnapshotTabMidi(lane, tab, 0);
};

const buildDefaultCuts = (lane: EditorSnapshot, totalFrames: number, framesPerBar: number) => {
  const fallbackCoord = lane.cutPositionsWithCoords?.[0]?.[1] ?? ([5, 0] as TabCoord);
  const cuts = [];
  for (let start = 0; start < totalFrames; start += framesPerBar) {
    cuts.push([[start, Math.min(totalFrames, start + framesPerBar)], fallbackCoord] as [[number, number], TabCoord]);
  }
  return cuts;
};

const applyImportTrackToLane = (lane: EditorSnapshot, track: ImportTrack): EditorSnapshot => {
  const representation = normalizeGteTrackType(track.representation);
  const representedLane: EditorSnapshot = {
    ...lane,
    editorType: representation,
    trackType: representation,
    type: representation,
    ...(representation === "bass"
      ? {
          tuning: {
            presetId: "bass-standard",
            label: "Standard bass",
            openStringMidi: [43, 38, 33, 28],
            capo: 0,
          },
        }
      : {}),
  };
  const framesPerBar = Math.max(1, Math.round(Number(track.framesPerMessure ?? lane.framesPerMessure ?? 480)));
  const notes: Note[] = track.stamps.map((entry, index) => {
    const sourceMidi = Number(track.midiNotes?.[index]);
    const importedMidi = Number.isFinite(sourceMidi)
      ? Math.round(sourceMidi)
      : getTabMidi(representedLane, clampTab(entry[1]));
    const possibleTabs = getAllTabsForMidi(representedLane, importedMidi);
    const tab = representation === "bass" && possibleTabs.length
      ? [...possibleTabs].sort((left, right) => left[1] - right[1] || left[0] - right[0])[0]
      : clampTab(entry[1]);
    const startTime = Math.max(0, Math.round(Number(entry[0] ?? 0)));
    const length = Math.max(1, Math.round(Number(entry[2] ?? Math.round(framesPerBar / 16))));
    return {
      id: index + 1,
      startTime,
      length,
      midiNum: importedMidi,
      tab,
      optimals: possibleTabs,
    };
  });
  const totalFrames = Math.max(
    framesPerBar,
    Math.round(Number(track.totalFrames ?? lane.totalFrames ?? framesPerBar)),
    ...notes.map((note) => note.startTime + note.length)
  );
  return {
    ...representedLane,
    name: track.name || lane.name,
    framesPerMessure: framesPerBar,
    fps: Math.max(1, Math.round(Number(track.fps ?? lane.fps ?? 240))),
    totalFrames,
    notes: notes.sort((a, b) => a.startTime - b.startTime || a.id - b.id),
    chords: [],
    noteEffects: [],
    cutPositionsWithCoords: buildDefaultCuts(lane, totalFrames, framesPerBar),
    optimalsByTime: {},
  };
};

export default function GteFileImportButton({
  editorId,
  createEditor,
  onImported,
  onError,
  className,
  disabled,
  children,
  busyLabel = "Importing...",
  title,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Importing tab file");
  const [pendingTrackSelection, setPendingTrackSelection] = useState<PendingTrackSelection | null>(null);
  const [previewTrackIndex, setPreviewTrackIndex] = useState<number | null>(null);
  const [previewLoadingIndex, setPreviewLoadingIndex] = useState<number | null>(null);
  const activeTrackPreviewRef = useRef<ActiveTrackPreview | null>(null);
  const previewRequestRef = useRef(0);

  const stopTrackPreview = useCallback((updateState = true) => {
    previewRequestRef.current += 1;
    const active = activeTrackPreviewRef.current;
    activeTrackPreviewRef.current = null;
    if (active?.animationFrame !== null && active?.animationFrame !== undefined) {
      cancelAnimationFrame(active.animationFrame);
    }
    if (active && active.ctx.state !== "closed") void active.ctx.close().catch(() => {});
    if (updateState) {
      setPreviewTrackIndex(null);
      setPreviewLoadingIndex(null);
    }
  }, []);

  useEffect(() => () => stopTrackPreview(false), [stopTrackPreview]);

  const playTrackPreview = async (track: ImportTrack, trackIndex: number) => {
    if (previewTrackIndex === trackIndex || previewLoadingIndex === trackIndex) {
      stopTrackPreview();
      return;
    }
    stopTrackPreview();
    const events = buildImportTrackPreviewEvents(track.stamps, track.fps);
    if (!events.length) return;

    const requestId = previewRequestRef.current;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.65;
    master.connect(ctx.destination);
    activeTrackPreviewRef.current = { ctx, animationFrame: null, trackIndex };
    setPreviewLoadingIndex(trackIndex);

    try {
      // Resume synchronously from the click so browser audio policies permit playback.
      const resumePromise = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
      const [instrument] = await Promise.all([
        prepareTrackInstrument(ctx, DEFAULT_TRACK_INSTRUMENT_ID),
        resumePromise,
      ]);
      if (previewRequestRef.current !== requestId || activeTrackPreviewRef.current?.ctx !== ctx) return;

      const playbackStart = ctx.currentTime + 0.04;
      const scheduleAhead = createPlaybackLookaheadScheduler(
        events,
        (event) => schedulePreparedTrackNote({
          ctx,
          destination: master,
          instrument,
          midi: event.midi,
          gain: 0.7,
          startTime: playbackStart + event.start,
          duration: event.duration,
        }),
        4
      );
      const playbackEnd = Math.max(...events.map((event) => event.start + event.duration));
      setPreviewLoadingIndex(null);
      setPreviewTrackIndex(trackIndex);
      scheduleAhead(0);

      const tick = () => {
        if (previewRequestRef.current !== requestId || activeTrackPreviewRef.current?.ctx !== ctx) return;
        const elapsed = Math.max(0, ctx.currentTime - playbackStart);
        scheduleAhead(elapsed);
        if (elapsed >= playbackEnd + 0.12) {
          stopTrackPreview();
          return;
        }
        const animationFrame = requestAnimationFrame(tick);
        if (activeTrackPreviewRef.current?.ctx === ctx) {
          activeTrackPreviewRef.current.animationFrame = animationFrame;
        }
      };
      const animationFrame = requestAnimationFrame(tick);
      if (activeTrackPreviewRef.current?.ctx === ctx) {
        activeTrackPreviewRef.current.animationFrame = animationFrame;
      }
    } catch (error) {
      if (previewRequestRef.current !== requestId) return;
      stopTrackPreview();
      onError(error instanceof Error ? error.message : "Could not preview this track.");
    }
  };

  const handleFile = async (file: File | null, preparedSelection?: PendingTrackSelection) => {
    if ((!file && !preparedSelection) || busy) return;
    stopTrackPreview();
    setBusy(true);
    setLoadingLabel(`Importing ${preparedSelection?.format || getImportFormatLabel(file?.name || "")}`);
    onError("");
    let createdEditorId: string | null = null;
    const addedLaneIds: string[] = [];
    try {
      if (file && /\.json$/i.test(file.name)) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error("This Note2Tabs JSON file is too large to import safely.");
        }
        const payload = JSON.parse(await file.text()) as {
          format?: unknown;
          editor?: unknown;
        };
        const importedEditor =
          payload?.editor && typeof payload.editor === "object"
            ? (payload.editor as EditorSnapshot)
            : null;
        if (!importedEditor || !Array.isArray(importedEditor.notes)) {
          throw new Error("This is not a valid Note2Tabs editor JSON file.");
        }
        const rawTrackType =
          importedEditor.trackType || importedEditor.editorType || importedEditor.type;
        const trackType =
          rawTrackType === "drums" || rawTrackType === "chords" ? rawTrackType : "tab";
        let targetEditorId = editorId;
        let laneId: string | undefined;
        if (targetEditorId) {
          const added = await gteApi.addCanvasEditor(
            targetEditorId,
            importedEditor.name,
            { editorType: trackType, trackType, type: trackType }
          );
          laneId = added.editor.id;
          addedLaneIds.push(laneId);
        } else {
          const created = await createEditor?.(importedEditor.name || "Imported track");
          targetEditorId = created?.editorId;
          laneId = created?.laneId;
          createdEditorId = targetEditorId || null;
        }
        if (!targetEditorId || !laneId) {
          throw new Error("Could not create an editor for this Note2Tabs JSON file.");
        }
        await gteApi.importEditorJson(targetEditorId, laneId, payload);
        await onImported(targetEditorId);
        return;
      }
      const parsed = preparedSelection?.parsed ?? await parseTabImportFile(file as File);
      const availableTracks: ImportTrack[] =
        parsed.tracks && parsed.tracks.length > 0
          ? parsed.tracks
          : [
              {
                name: parsed.name,
                stamps: parsed.stamps,
                framesPerMessure: parsed.framesPerMessure,
                fps: parsed.fps,
                totalFrames: parsed.totalFrames,
                midiNotes: parsed.midiNotes,
                representation: parsed.representation,
                detectionConfidence: parsed.detectionConfidence,
                midiProgram: parsed.midiProgram,
              },
            ];
      const selectableFormat = getSelectableImportFormat(parsed.fileName);
      if (!preparedSelection && selectableFormat) {
        setPendingTrackSelection({
          format: selectableFormat,
          parsed,
          tracks: availableTracks,
          selectedIndexes: new Set(availableTracks.map((_, index) => index)),
        });
        return;
      }
      const importTracks = preparedSelection
        ? availableTracks.filter((_, index) => preparedSelection.selectedIndexes.has(index))
        : availableTracks;
      if (!importTracks.length) {
        throw new Error("Select at least one track to import.");
      }
      let targetEditorId = editorId;
      let firstLaneId: string | undefined;
      let currentCanvas: CanvasSnapshot | null = null;

      if (targetEditorId) {
        const firstRepresentation = normalizeGteTrackType(importTracks[0]?.representation);
        const added = await gteApi.addCanvasEditor(
          targetEditorId,
          importTracks[0]?.name || parsed.name,
          {
            editorType: firstRepresentation,
            trackType: firstRepresentation,
            type: firstRepresentation,
            ...(firstRepresentation === "bass"
              ? {
                  tuning: {
                    presetId: "bass-standard",
                    label: "Standard bass",
                    openStringMidi: [43, 38, 33, 28],
                    capo: 0,
                  },
                }
              : {}),
          }
        );
        firstLaneId = added.editor.id;
        currentCanvas = added.canvas;
        addedLaneIds.push(firstLaneId);
      } else {
        const created = await createEditor?.(parsed.name);
        targetEditorId = created?.editorId;
        firstLaneId = created?.laneId;
        createdEditorId = targetEditorId || null;
        if (targetEditorId) {
          const loaded = await gteApi.getEditor(targetEditorId);
          currentCanvas = isCanvasSnapshot(loaded) ? loaded : null;
        }
      }

      if (!targetEditorId || !firstLaneId || !currentCanvas || importTracks.length === 0) {
        throw new Error("Could not create an editor for this tab.");
      }
      const laneIds = [firstLaneId];
      for (let index = 0; index < importTracks.length; index += 1) {
        const track = importTracks[index];
        if (index > 0) {
          const representation = normalizeGteTrackType(track.representation);
          const added = await gteApi.addCanvasEditor(
            targetEditorId,
            track.name || `${parsed.name} ${index + 1}`,
            {
              editorType: representation,
              trackType: representation,
              type: representation,
              ...(representation === "bass"
                ? {
                    tuning: {
                      presetId: "bass-standard",
                      label: "Standard bass",
                      openStringMidi: [43, 38, 33, 28],
                      capo: 0,
                    },
                  }
                : {}),
            }
          );
          currentCanvas = added.canvas;
          laneIds.push(added.editor.id);
          addedLaneIds.push(added.editor.id);
        }
      }
      const nextCanvas: CanvasSnapshot = {
        ...currentCanvas,
        editors: currentCanvas.editors.map((lane) => {
          const trackIndex = laneIds.indexOf(lane.id);
          return trackIndex >= 0 ? applyImportTrackToLane(lane, importTracks[trackIndex]) : lane;
        }),
      };
      await gteApi.applySnapshot(targetEditorId, nextCanvas);
      await onImported(targetEditorId, {
        firstLaneId,
        tracks: importTracks.map((track, index) => ({
          laneId: laneIds[index],
          name: track.name || `${parsed.name} ${index + 1}`,
          representation: normalizeGteTrackType(track.representation),
          detectionConfidence: track.detectionConfidence || "low",
        })),
      });
    } catch (err: unknown) {
      if (editorId && addedLaneIds.length) {
        await Promise.all(addedLaneIds.map((laneId) => gteApi.deleteCanvasEditor(editorId, laneId).catch(() => {})));
      } else if (createdEditorId) {
        await gteApi.deleteEditor(createdEditorId).catch(() => {});
      }
      const message = err instanceof Error ? err.message : "Could not import this tab file.";
      onError(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggleTrack = (index: number) => {
    setPendingTrackSelection((current) => {
      if (!current) return current;
      const selectedIndexes = new Set(current.selectedIndexes);
      if (selectedIndexes.has(index)) selectedIndexes.delete(index);
      else selectedIndexes.add(index);
      return { ...current, selectedIndexes };
    });
  };

  const setTrackRepresentation = (index: number, representation: GteTrackType) => {
    setPendingTrackSelection((current) => {
      if (!current) return current;
      return {
        ...current,
        tracks: current.tracks.map((track, trackIndex) =>
          trackIndex === index
            ? { ...track, representation, detectionConfidence: "high" }
            : track
        ),
      };
    });
  };

  const cancelTrackSelection = () => {
    stopTrackPreview();
    setPendingTrackSelection(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const confirmTrackSelection = () => {
    const selection = pendingTrackSelection;
    if (!selection || selection.selectedIndexes.size === 0) return;
    stopTrackPreview();
    setPendingTrackSelection(null);
    void handleFile(null, selection);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={TAB_IMPORT_ACCEPT}
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0] || null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={className}
        disabled={disabled || busy}
        title={title}
      >
        {busy ? <span className="import-thinking-text">{busyLabel}</span> : children}
      </button>
      {busy && typeof document !== "undefined" && createPortal(
        <div
          data-gte-floating-ui="true"
          className="fixed inset-0 z-[11000] flex items-center justify-center bg-white/45 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label={loadingLabel}
        >
          <div className="flex min-w-52 flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-7 py-6 shadow-xl">
            <span
              className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-slate-800"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-slate-800">{loadingLabel}</span>
          </div>
        </div>,
        document.body
      )}
      {pendingTrackSelection && typeof document !== "undefined" && createPortal(
        <div
          data-gte-floating-ui="true"
          className="fixed inset-0 z-[10999] flex items-center justify-center bg-slate-900/20 px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelTrackSelection();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gte-import-track-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 id="gte-import-track-title" className="text-base font-semibold text-slate-900">
              Select tracks to import
            </h2>
            <p className="mt-1 text-sm text-slate-500">{pendingTrackSelection.parsed.fileName}</p>
            <div className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
              {pendingTrackSelection.tracks.map((track, index) => (
                <div
                  key={`${track.name || "track"}-${index}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={pendingTrackSelection.selectedIndexes.has(index)}
                      onChange={() => toggleTrack(index)}
                      className="h-4 w-4 accent-slate-900"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                      {track.name || `Track ${index + 1}`}
                    </span>
                  </label>
                  <span className="shrink-0 text-xs text-slate-400">
                    {track.stamps.length} {track.stamps.length === 1 ? "note" : "notes"}
                  </span>
                  <select
                    value={normalizeGteTrackType(track.representation)}
                    onChange={(event) =>
                      setTrackRepresentation(index, event.target.value as GteTrackType)
                    }
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600"
                    aria-label={`Representation for ${track.name || `track ${index + 1}`}`}
                  >
                    {(["guitar", "bass", "drums", "notation", "chords"] as const).map((type) => (
                      <option key={type} value={type}>{getTrackTypeLabel(type)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void playTrackPreview(track, index)}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                      previewTrackIndex === index
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                    aria-label={previewTrackIndex === index ? `Stop ${track.name || `track ${index + 1}`}` : `Preview ${track.name || `track ${index + 1}`}`}
                    title={previewTrackIndex === index ? "Stop preview" : "Preview track from its first note"}
                  >
                    {previewLoadingIndex === index ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" aria-hidden="true" />
                    ) : previewTrackIndex === index ? (
                      <span className="h-2.5 w-2.5 rounded-[1px] bg-current" aria-hidden="true" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                        <polygon points="8,5 19,12 8,19" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setPendingTrackSelection((current) =>
                    current
                      ? {
                          ...current,
                          selectedIndexes: current.selectedIndexes.size === current.tracks.length
                            ? new Set()
                            : new Set(current.tracks.map((_, index) => index)),
                        }
                      : current
                  )
                }
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                {pendingTrackSelection.selectedIndexes.size === pendingTrackSelection.tracks.length
                  ? "Clear all"
                  : "Select all"}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelTrackSelection}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmTrackSelection}
                  disabled={pendingTrackSelection.selectedIndexes.size === 0}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Import selected
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
