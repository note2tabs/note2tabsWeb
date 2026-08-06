import { useRef, useState, type ReactNode } from "react";
import { gteApi } from "../lib/gteApi";
import { TAB_IMPORT_ACCEPT, parseTabImportFile } from "../lib/gteTabImport";
import type { CanvasSnapshot, EditorSnapshot, Note, TabCoord } from "../types/gte";

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

  const handleFile = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    onError("");
    let createdEditorId: string | null = null;
    const addedLaneIds: string[] = [];
    try {
      const parsed = await parseTabImportFile(file);
      const importTracks: ImportTrack[] =
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
    </>
  );
}
