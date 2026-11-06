import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CanvasSnapshot } from "../types/gte";
import { previewMetadata, type TranscriptionPreviewMetadata, type TranscriptionPreviewPayload } from "../lib/transcriptionPreviewProtocol";
import { useTranscriptionPreviewPlayback } from "./useTranscriptionPreviewPlayback";
import { applyStreamingEdits, emptyStreamingEdits, readStreamingEdits, recordStreamingEdit, saveStreamingEdits, type StreamingEdits } from "../lib/gteStreamingEdits";
import { streamingTrackKey } from "../lib/transcriptionPreviewProtocol";
import type { EditorSnapshot } from "../types/gte";
import styles from "./TranscriptionStreamingPreview.module.css";

const Canvas = dynamic(() => import("./GteWorkspace"), { ssr: false });
const Midi = dynamic(() => import("./GteMidiWorkspace"), { ssr: false });
const Tab = dynamic(() => import("./GtePracticeTab"), { ssr: false });
const Sheets = dynamic(() => import("./GteNotationWorkspace"), { ssr: false });
const Drums = dynamic(() => import("./GteDrumNotation"), { ssr: false });
const Roll = dynamic(() => import("./GtePracticePianoRoll"), { ssr: false });
const unchanged = () => {};
const emptySelection = new Set<number>();
const waiting: TranscriptionPreviewMetadata = { version: 1, streamId: "waiting", revision: 0, processedSeconds: 0, durationSeconds: 1, complete: false };
type Props = { jobId: string; name: string; metadata: TranscriptionPreviewMetadata | null; finishing: boolean; onEditsChange?: (draft: StreamingEdits) => void };

function PreviewSeek({ end, getPosition, seek }: { end: number; getPosition: () => number; seek: (seconds: number) => void }) {
  const slider = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const update = () => { if (slider.current) slider.current.value = String(Math.min(end, getPosition())); };
    update(); const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [end, getPosition]);
  return <input ref={slider} aria-label="Seek preview" type="range" min={0} max={end} step={.01} defaultValue={0} onChange={event => seek(Number(event.target.value))} />;
}

export default function TranscriptionStreamingPreview({ jobId, name, metadata: incomingMetadata, finishing, onEditsChange }: Props) {
  const metadata = incomingMetadata ?? waiting;
  const [canvas, setCanvas] = useState<CanvasSnapshot | null>(null);
  const [active, setActive] = useState("");
  const [view, setView] = useState<"edit" | "practice" | "roll">("edit");
  const [notationMode, setNotationMode] = useState<"sheets" | "midi">("sheets");
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const draft = useRef<StreamingEdits>(emptyStreamingEdits()), base = useRef<CanvasSnapshot | null>(null), working = useRef<CanvasSnapshot | null>(null);
  const history = useRef<{ past: StreamingEdits[]; future: StreamingEdits[] }>({ past: [], future: [] });
  const editsCallback = useRef(onEditsChange); editsCallback.current = onEditsChange;
  const storageFailed = useRef(false);
  const music = useRef<HTMLDivElement>(null);
  useEffect(() => { music.current?.toggleAttribute("inert", finishing); }, [finishing]);
  const [notice, setNotice] = useState("");
  const worker = useRef<Worker | null>(null), busy = useRef(false);
  const wanted = useRef("");
  const pending = useRef<{ request: string; payload: TranscriptionPreviewPayload } | null>(null);
  const playback = useTranscriptionPreviewPlayback(canvas);
  const live = useRef(playback); live.current = playback;
  const showDraft = (value: StreamingEdits) => {
    draft.current = value;
    editsCallback.current?.(value);
    try { saveStreamingEdits(jobId, value); storageFailed.current = false; setNotice(""); }
    catch { storageFailed.current = true; setNotice("Your edits are kept in this tab, but device storage is unavailable. Keep this tab open until the editor is saved."); }
    if (base.current) { const merged = applyStreamingEdits(base.current, value); working.current = merged; setCanvas(merged); }
    setHistorySize({ undo: history.current.past.length, redo: history.current.future.length });
  };
  const edit = (laneId: string, next: EditorSnapshot) => {
    const previous = working.current?.editors.find(lane => lane.id === laneId);
    if (!previous) return;
    const value = recordStreamingEdit(draft.current, streamingTrackKey(previous), previous, next);
    if (JSON.stringify(value) === JSON.stringify(draft.current)) return;
    history.current.past.push(draft.current); if (history.current.past.length > 50) history.current.past.shift();
    history.current.future = []; showDraft(value);
  };
  const undo = () => { const previous = history.current.past.pop(); if (previous) { history.current.future.push(draft.current); showDraft(previous); } };
  const redo = () => { const next = history.current.future.pop(); if (next) { history.current.past.push(draft.current); showDraft(next); } };
  useEffect(() => {
    draft.current = readStreamingEdits(jobId); history.current = { past: [], future: [] };
    editsCallback.current?.(draft.current);
  }, [jobId]);
  useEffect(() => {
    const instance = new Worker(new URL("../workers/transcriptionPreview.worker.ts", import.meta.url));
    worker.current = instance;
    instance.onmessage = event => {
      busy.current = false;
      if (event.data.request === wanted.current && event.data.canvas) { base.current = event.data.canvas; const merged = applyStreamingEdits(event.data.canvas, draft.current); working.current = merged; setCanvas(merged); if (!storageFailed.current) setNotice(""); }
      else if (event.data.request === wanted.current && event.data.error) setNotice("The preview is catching up. Your transcription is still running.");
      if (pending.current) { busy.current = true; instance.postMessage(pending.current); pending.current = null; }
    };
    instance.onerror = () => { busy.current = false; setNotice("The preview is unavailable. Your transcription will still open when complete."); };
    return () => { instance.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    base.current = null; working.current = null; setCanvas(null); setActive(""); live.current.pause(); live.current.seek(0);
  }, [jobId, metadata.streamId]);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const request = `${metadata.streamId}:${metadata.revision}`; wanted.current = request;
    if (metadata.revision < 1) return () => controller.abort();
    const load = async () => {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/preview`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Preview not ready");
        const payload = await response.json() as TranscriptionPreviewPayload;
        const revision = previewMetadata(payload);
        // A replaced artifact can be newer than status. Never mix retries or go backwards.
        if (!revision || revision.streamId !== metadata.streamId || revision.revision < metadata.revision) throw new Error("Stale preview");
        if (stopped) return;
        const item = { request, payload };
        if (busy.current || !worker.current) pending.current = item;
        else { busy.current = true; worker.current.postMessage(item); }
      } catch {
        if (!stopped) timer = setTimeout(load, 8000);
      }
    };
    void load();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [jobId, metadata.streamId, metadata.revision]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || (event.target instanceof Element && event.target.closest("input,select,textarea,[contenteditable=true]"))) return;
      event.preventDefault(); event.stopPropagation(); void live.current.toggle();
    };
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, []);
  const selected = canvas?.editors.find(lane => lane.id === active) ?? canvas?.editors[0];
  const lanes = selected ? [selected] : [];
  const end = canvas ? Math.max(1, ...canvas.editors.map(lane => lane.totalFrames / lane.fps)) : 1;
  const progress = Math.min(100, Math.max(0, 100 * metadata.processedSeconds / metadata.durationSeconds));
  return <section className={styles.preview} aria-label="Live transcription preview">
    <header className={styles.header}>
      <div className={styles.status}><span>Note2Tabs is transcribing &quot;{name}&quot;</span><small>{canvas?.keyBase !== undefined && <>{["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][canvas.keyBase]} {canvas.keyType ? "Minor" : "Major"} {"\u00b7"} </>}{finishing ? "Finishing your arrangement..." : "Live editing - final timing applied when complete"}</small></div>
      <div role="progressbar" aria-label="Transcription progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className={styles.progress}><div style={{ width: `${progress}%` }} /></div>
    </header>
    <div className={styles.controls}>
      <div role="group" aria-label="Preview visualization">{(["edit", "practice", "roll"] as const).map(mode => <button type="button" key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === "edit" ? "Edit" : mode === "practice" ? "Practice" : "Piano roll"}</button>)}</div>
      {<select aria-label="Preview track" value={selected?.id ?? ""} onChange={event => setActive(event.target.value)}>{canvas?.editors.map(lane => <option value={lane.id} key={lane.id}>{lane.name}</option>)}</select>}
      {view === "edit" && selected?.instrumentType === "notation" && <div role="group" aria-label="Notation editing view">
        <button type="button" aria-pressed={notationMode === "sheets"} onClick={() => setNotationMode("sheets")}>Sheets</button>
        <button type="button" aria-pressed={notationMode === "midi"} onClick={() => setNotationMode("midi")}>MIDI view</button>
      </div>}
    </div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div ref={music} className={styles.music} aria-busy={finishing}>
      {!lanes.length && <p role="status">Waiting for the first notes…</p>}
      {lanes.map(lane => {
        const props = { editorId: lane.id, snapshot: lane, onSnapshotChange: (next: EditorSnapshot) => edit(lane.id, next), editMenuDisabled: finishing, autoAssignVoices: false, allowBackend: false, embedded: true,
          isActive: !finishing, practiceMode: view !== "edit", canvasKeyBase: canvas?.keyBase, canvasKeyType: canvas?.keyType,
          getGlobalPlaybackFrame: playback.getFrame, globalPlaybackFrame: playback.getFrame(), globalPlaybackIsPlaying: playback.playing, followPlayback: view !== "edit",
          historyUndoCount: historySize.undo, historyRedoCount: historySize.redo, onRequestUndo: undo, onRequestRedo: redo,
          playbackSpeed: playback.speed, globalPlaybackTimelineEnd: lane.totalFrames, playbackUiVisible: false,
          onGlobalPlaybackFrameChange: (frame: number) => playback.seek(frame / lane.fps) };
        return <article key={lane.id}>
          {view === "roll" ? <Roll {...props} /> : view === "edit" && lane.instrumentType === "notation" && notationMode === "midi" ? <Midi {...props} /> : view === "edit" && lane.instrumentType !== "notation" && lane.instrumentType !== "drums" ? <Canvas {...props} /> : lane.instrumentType === "drums" ? <Drums {...props} /> : lane.instrumentType === "notation" ? <Sheets {...props} /> :
            <Tab snapshot={lane} editorId={lane.id} getFrame={playback.getFrame} playing={playback.playing} active={view !== "edit"} selectedBars={emptySelection} onBarSelect={unchanged} onPlayFrom={frame => playback.seek(frame / lane.fps)} />}
        </article>;
      })}
    </div>
    <footer className={styles.transport}>
      <button type="button" className="button-primary button-small" disabled={!canvas} onClick={() => void playback.toggle()}>{playback.playing ? "Pause" : "Play"}</button>
      <PreviewSeek end={end} getPosition={playback.getSeconds} seek={playback.seek} />
      <select aria-label="Preview playback speed" value={playback.speed} onChange={event => playback.changeSpeed(Number(event.target.value))}>{[.5, .75, 1, 1.25].map(speed => <option key={speed} value={speed}>{speed * 100}%</option>)}</select>
      {playback.error && <small role="alert">{playback.error}</small>}
    </footer>
  </section>;
}
