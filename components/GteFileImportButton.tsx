import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gteApi } from "../lib/gteApi";
import {
  TAB_IMPORT_ACCEPT,
  getTabImportExtension,
  parseTabImportFile,
  type ParsedTabFileImport,
} from "../lib/gteTabImport";
import type { CanvasSnapshot, EditorSnapshot, Note, TabCoord } from "../types/gte";
import {
  DEFAULT_TRACK_INSTRUMENT_ID,
  prepareTrackInstrument,
  schedulePreparedTrackNote,
} from "../lib/gteSamplePlayback";
import { createPlaybackLookaheadScheduler } from "../lib/gtePlaybackLookahead";
import { buildImportTrackPreviewEvents } from "../lib/gteImportTrackPreview";

type Props = {
  editorId?: string;
  createEditor?: (name: string) => Promise<{ editorId: string; laneId: string }>;
  onImported: (editorId: string) => void | Promise<void>;
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
  framesPerMessure?: number;
  fps?: number;
  totalFrames?: number;
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
  const midi = lane.tabRef?.[tab[0]]?.[tab[1]];
  return Number.isFinite(Number(midi)) ? Math.round(Number(midi)) : 0;
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
  const framesPerBar = Math.max(1, Math.round(Number(track.framesPerMessure ?? lane.framesPerMessure ?? 480)));
  const notes: Note[] = track.stamps.map((entry, index) => {
    const tab = clampTab(entry[1]);
    const startTime = Math.max(0, Math.round(Number(entry[0] ?? 0)));
    const length = Math.max(1, Math.round(Number(entry[2] ?? Math.round(framesPerBar / 16))));
    return {
      id: index + 1,
      startTime,
      length,
      midiNum: getTabMidi(lane, tab),
      tab,
      optimals: [],
    };
  });
  const totalFrames = Math.max(
    framesPerBar,
    Math.round(Number(track.totalFrames ?? lane.totalFrames ?? framesPerBar)),
    ...notes.map((note) => note.startTime + note.length)
  );
  return {
    ...lane,
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

  const handleFile = async (file: File | null, preparedSelection?: PendingTrackSelection) => {
    if ((!file && !preparedSelection) || busy) return;
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
        const added = await gteApi.addCanvasEditor(targetEditorId, importTracks[0]?.name || parsed.name);
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
          const added = await gteApi.addCanvasEditor(targetEditorId, track.name || `${parsed.name} ${index + 1}`);
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
      await onImported(targetEditorId);
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

  const cancelTrackSelection = () => {
    setPendingTrackSelection(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const confirmTrackSelection = () => {
    const selection = pendingTrackSelection;
    if (!selection || selection.selectedIndexes.size === 0) return;
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
                <label
                  key={`${track.name || "track"}-${index}`}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={pendingTrackSelection.selectedIndexes.has(index)}
                    onChange={() => toggleTrack(index)}
                    className="h-4 w-4 accent-slate-900"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {track.name || `Track ${index + 1}`}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {track.stamps.length} {track.stamps.length === 1 ? "note" : "notes"}
                  </span>
                </label>
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
