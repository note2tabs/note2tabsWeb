import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import JobStatusLayout, { type JobResponse, type PendingJobPresentation } from "./JobStatusLayout";
import type { CanvasSnapshot } from "../types/gte";
import { previewMetadata, type TranscriptionPreviewMetadata, type TranscriptionPreviewPayload } from "../lib/transcriptionPreviewProtocol";
import { applyStreamingEdits, emptyStreamingEdits, readStreamingEdits, recordStreamingCanvasEdit, saveStreamingEdits, type StreamingEdits } from "../lib/gteStreamingEdits";
import { preloadStreamingEditor } from "../lib/gteStreamingPreload";
import { cleanStreamingGhosts } from "../lib/gteStreamingGhosts";
import { createStreamingReveal } from "../lib/gteStreamingReveal";
import { setStreamingHead } from "../lib/gteStreamingHead";
import type { StreamingCompletionSource } from "../lib/gteStreamingCompletion";
import type { EditorSnapshot } from "../types/gte";
import styles from "./TranscriptionStreamingPreview.module.css";

const Editor = dynamic(() => import("./GteEditorWorkspace"), { ssr: false });
const waiting: TranscriptionPreviewMetadata = { version: 1, streamId: "waiting", revision: 0, processedSeconds: 0, durationSeconds: 1, complete: false };
type Props = { jobId: string; name: string; metadata: TranscriptionPreviewMetadata | null; finishing: boolean; onEditsChange?: (draft: StreamingEdits) => void; finalSource?: StreamingCompletionSource | null; onSave?: (canvas: CanvasSnapshot) => Promise<string>; loadingJob?: JobResponse | null; pendingPresentation?: PendingJobPresentation | null };

export default function TranscriptionStreamingPreview({ jobId, name, metadata: incomingMetadata, finishing, onEditsChange, finalSource, onSave, loadingJob, pendingPresentation }: Props) {
  const lastMetadata = useRef(incomingMetadata ?? waiting);
  if (incomingMetadata) lastMetadata.current = incomingMetadata;
  const metadata = lastMetadata.current;
  const [phase, setPhase] = useState<"streaming" | "finishing" | "saving" | "saved">("streaming");
  const [savedEditorId, setSavedEditorId] = useState<string | null>(null);
  const revealed = useRef(createStreamingReveal({ previewMs: 300 }));
  const sourceComplete = useRef(false), finalizing = useRef(false), finalError = useRef(false), editRevision = useRef(0);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const finalSourceRef = useRef(finalSource); finalSourceRef.current = finalSource;
  const saveRef = useRef(onSave); saveRef.current = onSave;
  const interaction = useRef({ pointer: false, until: 0 });
  const [canvas, setCanvas] = useState<CanvasSnapshot | null>(null);
  const openedEditor = useRef(false);
  const [ghosts, setGhosts] = useState<import("../lib/gteStreamingGhosts").StreamingGhostLayers>({});
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const draft = useRef<StreamingEdits>(emptyStreamingEdits()), base = useRef<CanvasSnapshot | null>(null), working = useRef<CanvasSnapshot | null>(null);
  const history = useRef<{ past: StreamingEdits[]; future: StreamingEdits[] }>({ past: [], future: [] });
  const editsCallback = useRef(onEditsChange); editsCallback.current = onEditsChange;
  useEffect(() => { void preloadStreamingEditor(); }, []);
  const displayGhosts = () => { const layers=revealed.current.ghosts(); for(const lane of working.current?.editors ?? []) if(layers[lane.id]) layers[lane.id]=cleanStreamingGhosts(lane,layers[lane.id]); return layers; };
  const storageFailed = useRef(false);
  const [notice, setNotice] = useState("");
  // The first artifact proves inference is running: open the editor now, even before the first note.
  const [artifactSeen, setArtifactSeen] = useState(false);
  const worker = useRef<Worker | null>(null), busy = useRef(false);
  const wanted = useRef(""), applied = useRef<{ streamId: string; revision: number } | null>(null);
  const pending = useRef<{ request: string; payload: TranscriptionPreviewPayload } | null>(null);
  const showDraft = (value: StreamingEdits) => {
    editRevision.current += 1; interaction.current.until = Date.now() + 350;
    draft.current = value;
    editsCallback.current?.(value);
    try { saveStreamingEdits(jobId, value); storageFailed.current = false; setNotice(""); }
    catch { storageFailed.current = true; setNotice("Your edits are kept in this tab, but device storage is unavailable. Keep this tab open until the editor is saved."); }
    if (base.current) { const merged = applyStreamingEdits(base.current, value); working.current = merged; setCanvas(merged); setGhosts(displayGhosts()); }
    setHistorySize({ undo: history.current.past.length, redo: history.current.future.length });
  };
  const edit = (_before: CanvasSnapshot, next: CanvasSnapshot) => {
    const previous = working.current;
    if (!previous || phaseRef.current === "saved") return;
    const value = recordStreamingCanvasEdit(draft.current, previous, next);
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
  const applySource = (source: CanvasSnapshot) => {
    base.current = source;
    const merged = applyStreamingEdits(source, draft.current);
    working.current = merged; setCanvas(merged);
  };
  const finishLatestRef = useRef<() => void>(() => {});
  finishLatestRef.current = () => {
    if (finalError.current || !sourceComplete.current || revealed.current.pending() || finalizing.current || busy.current || !working.current || !finalSourceRef.current || phaseRef.current === "saved" || phaseRef.current === "saving") return;
    finalizing.current = true; setPhase("finishing");
    worker.current?.postMessage({ type: "complete", revision: editRevision.current, canvas: working.current, source: finalSourceRef.current });
  };
  const saveLatestRef = useRef<() => Promise<void>>(async () => {});
  saveLatestRef.current = async () => {
    if (!saveRef.current || !working.current) return;
    setPhase("saving"); phaseRef.current = "saving";
    try {
      let id: string;
      for (;;) {
        const revision = editRevision.current;
        id = await saveRef.current(working.current!);
        if (revision === editRevision.current) break;
      }
      try { window.localStorage.removeItem(`note2tabs:stream-edits:v1:${jobId}`); } catch {}
      setSavedEditorId(id); setPhase("saved"); phaseRef.current = "saved";
      setNotice("");
    } catch {
      setPhase("finishing"); phaseRef.current = "finishing";
      setNotice("Your arrangement is ready here, but saving failed. Keep this tab open and retry saving.");
    }
  };
  useEffect(() => {
    const pointerUp = () => { interaction.current.pointer = false; interaction.current.until = Date.now() + 150; };
    const typing = (event: KeyboardEvent) => { if (event.code !== "Space") interaction.current.until = Date.now() + 450; };
    window.addEventListener("blur", pointerUp); window.addEventListener("pointerup", pointerUp); window.addEventListener("pointercancel", pointerUp); window.addEventListener("keydown", typing, true);
    const timer = window.setInterval(() => {
      if (interaction.current.pointer || Date.now() < interaction.current.until || phaseRef.current === "saved" || phaseRef.current === "saving" || finalizing.current) return;
      const next = revealed.current.advance(125); if (next && next !== base.current) applySource(next);
      // Before the first note the caret rests at bar 1, so the editor already looks alive.
      setStreamingHead(revealed.current.headSeconds() ?? (openedEditor.current && !sourceComplete.current ? 0 : null));
      const layers=displayGhosts(); setGhosts(previous => JSON.stringify(previous) === JSON.stringify(layers) ? previous : layers);
      finishLatestRef.current();
    }, 125);
    return () => { clearInterval(timer); setStreamingHead(null); window.removeEventListener("blur", pointerUp); window.removeEventListener("pointerup", pointerUp); window.removeEventListener("pointercancel", pointerUp); window.removeEventListener("keydown", typing, true); };
  }, []);
  useEffect(() => {
    const instance = new Worker(new URL("../workers/transcriptionPreview.worker.ts", import.meta.url));
    worker.current = instance;
    instance.onmessage = event => {
      if (event.data.type === "complete") {
        finalizing.current = false;
        if (event.data.error) { finalError.current = true; setNotice(event.data.error); return; }
        if (event.data.revision !== editRevision.current) { finishLatestRef.current(); return; }
        // Keep the same mounted editor, selection and transport. No navigation.
        base.current = event.data.canvas; working.current = event.data.canvas; setCanvas(event.data.canvas);
        draft.current = emptyStreamingEdits(); history.current = { past: [], future: [] }; setHistorySize({ undo: 0, redo: 0 }); editsCallback.current?.(draft.current);
        void saveLatestRef.current();
        return;
      }
      busy.current = false;
      if (event.data.request === wanted.current && event.data.canvas) {
        const first = !openedEditor.current || !base.current || base.current.editors[0]?.id === "awaiting-first-track";
        const next = revealed.current.receive(event.data.canvas, event.data.request.endsWith(":final"), event.data.throughSeconds ?? lastMetadata.current.settledSeconds ?? lastMetadata.current.processedSeconds, event.data.provisionalGhosts ?? {});
        if (first && next) { applySource(revealed.current.advance() ?? next); setGhosts(displayGhosts()); }
        if (event.data.request.endsWith(":final")) sourceComplete.current = true;
        if (!storageFailed.current) setNotice("");
        finishLatestRef.current();
      }
      else if (event.data.request === wanted.current && event.data.error) setNotice("The live editor could not update. Your transcription is still running.");
      if (pending.current) { busy.current = true; instance.postMessage(pending.current); pending.current = null; }
    };
    instance.onerror = () => { busy.current = false; setNotice("The live editor is unavailable. Your transcription will still open when complete."); };
    return () => { instance.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    // The direct poll may already have applied this very stream before status announced it.
    if (applied.current?.streamId === metadata.streamId) return;
    base.current = null; working.current = null; revealed.current.reset(); setStreamingHead(null); sourceComplete.current = false; applied.current = null; setCanvas(null);
  }, [jobId, metadata.streamId]);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    if (finalSource) return () => controller.abort();
    // Poll the artifact directly instead of waiting for the slower job-status poll
    // to announce each revision; only genuinely newer revisions reach the worker.
    const load = async () => {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/preview`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Preview not ready");
        const payload = await response.json() as TranscriptionPreviewPayload;
        const revision = previewMetadata(payload);
        if (!revision || stopped) throw new Error("Stale preview");
        const current = applied.current, expected = lastMetadata.current.streamId;
        // A new inference attempt is only trusted once job status has announced it.
        const sameStream = current?.streamId === revision.streamId;
        if (!sameStream && revision.streamId !== expected && (current || expected !== "waiting")) throw new Error("Stale preview");
        if (sameStream && revision.revision <= current!.revision) throw new Error("Unchanged preview");
        void preloadStreamingEditor(payload.tracks);
        applied.current = { streamId: revision.streamId, revision: revision.revision }; setArtifactSeen(true);
        const request = `${revision.streamId}:${revision.revision}`; wanted.current = request;
        const item = { request, payload };
        if (busy.current || !worker.current) pending.current = item;
        else { busy.current = true; worker.current.postMessage(item); }
      } catch {}
      if (!stopped) timer = setTimeout(load, 2500);
    };
    void load();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [jobId, finalSource]);
  useEffect(() => {
    if (!finalSource) return;
    void preloadStreamingEditor(finalSource.tracks);
    const request = `${metadata.streamId}:final`; wanted.current = request;
    const end = finalSource.tracks.reduce((maximum, track) => track.segments.reduce((value, note) => Math.max(value, note.end_time_s || 0), maximum), metadata.durationSeconds);
    const payload: TranscriptionPreviewPayload = { version: 1, streamId: metadata.streamId, revision: metadata.revision || 1, complete: true,
      processedSeconds: end, settledSeconds: end, durationSeconds: end, tracks: finalSource.tracks,
      tempoAnalysis: { bpm: base.current && base.current.editors[0]?.id !== "awaiting-first-track" ? 60 * (base.current.editors[0]?.timeSignature || 4) / (base.current.secondsPerBar || 2) : finalSource.bpm || 120, beatsPerBar: base.current?.editors[0]?.id !== "awaiting-first-track" && base.current?.editors[0]?.timeSignature || finalSource.beatsPerBar || 4 } };
    const item = { request, payload };
    if (busy.current || !worker.current) pending.current = item;
    else { busy.current = true; worker.current.postMessage(item); }
  }, [finalSource]);
  const progress = phase === "saved" ? 100 : Math.min(99, Math.max(0, 100 * revealed.current.throughSeconds() / metadata.durationSeconds));
  const initial = useRef<CanvasSnapshot>({ id: `stream-${jobId}`, name, secondsPerBar: 2, editors: [{
    id: "awaiting-first-track", name: "Guitar", program: 25, instrumentType: "guitar-tab", instrumentId: "acoustic_guitar", trackType: "tab",
    fps: 240, totalFrames: 480, framesPerMessure: 480, timeSignature: 4, timeSignatureBottom: 4, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {},
  }] });
  const shown = canvas ?? initial.current;
  const workspaceCanvas = useMemo(() => ({ ...shown, id: savedEditorId || `stream-${jobId}`, name: shown.name || name }), [shown, jobId, name, savedEditorId]);
  if (!working.current) working.current = shown;
  if (!base.current) base.current = shown;
  const stage = phase === "saving" ? "Saving your arrangement..." : phase === "finishing" ? "Finishing your arrangement..." : sourceComplete.current || revealed.current.pending() ? "Adding notes - you can edit and play" : "Listening - you can edit and play";
  const ready = artifactSeen || Boolean(canvas && (sourceComplete.current || canvas.editors.some(lane => lane.notes.length || lane.chords.length) || Object.values(ghosts).some(notes => notes.some(note => note.phase === "preview"))));
  if (ready) openedEditor.current = true;
  return <>
    {notice && <p role="status" className={styles.notice}>{notice}{phase === "finishing" && <button type="button" onClick={() => { if (finalError.current) { finalError.current = false; finishLatestRef.current(); } else void saveLatestRef.current(); }}>Retry</button>}</p>}
    {!openedEditor.current ? <main className={`page page-tight ${styles.waiting}`}>
      <div className="container stack">
        <h1 className="page-title">Preparing your transcription</h1>
        <JobStatusLayout job={loadingJob ? { ...loadingJob, status: "processing" } : null} pendingPresentation={pendingPresentation}
          onRestart={() => {}} onDownloadTabs={() => {}} hasWatchedAd showAdGate={false} onRetryAd={() => {}}
          adContainerKey={0} onSkipAd={() => {}} showFallbackVideo={false} onVideoComplete={() => {}} />
      </div>
    </main> : <Editor editorId={savedEditorId || `stream-${jobId}`} isGuestMode={savedEditorId === "guest"} hasAccount passedTutorial
      hydratedCanvas={savedEditorId ? workspaceCanvas : undefined}
      streaming={phase === "saved" ? undefined : { canvas: workspaceCanvas, ghosts, name, progress, finishing: phase !== "streaming", stage,
        onInteractionStart: () => { interaction.current.pointer = true; setGhosts({}); },
        onChange: edit, undo, redo, undoCount: historySize.undo, redoCount: historySize.redo }} />}
  </>;
}
