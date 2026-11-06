import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CanvasSnapshot } from "../types/gte";
import { previewMetadata, type TranscriptionPreviewMetadata, type TranscriptionPreviewPayload } from "../lib/transcriptionPreviewProtocol";
import { applyStreamingEdits, emptyStreamingEdits, readStreamingEdits, recordStreamingCanvasEdit, saveStreamingEdits, type StreamingEdits } from "../lib/gteStreamingEdits";
import { createStreamingReveal } from "../lib/gteStreamingReveal";
import type { StreamingCompletionSource } from "../lib/gteStreamingCompletion";
import type { EditorSnapshot } from "../types/gte";
import styles from "./TranscriptionStreamingPreview.module.css";

const Editor = dynamic(() => import("./GteEditorWorkspace"), { ssr: false });
const waiting: TranscriptionPreviewMetadata = { version: 1, streamId: "waiting", revision: 0, processedSeconds: 0, durationSeconds: 1, complete: false };
type Props = { jobId: string; name: string; metadata: TranscriptionPreviewMetadata | null; finishing: boolean; onEditsChange?: (draft: StreamingEdits) => void; finalSource?: StreamingCompletionSource | null; onSave?: (canvas: CanvasSnapshot) => Promise<string> };

export default function TranscriptionStreamingPreview({ jobId, name, metadata: incomingMetadata, finishing, onEditsChange, finalSource, onSave }: Props) {
  const lastMetadata = useRef(incomingMetadata ?? waiting);
  if (incomingMetadata) lastMetadata.current = incomingMetadata;
  const metadata = lastMetadata.current;
  const [phase, setPhase] = useState<"streaming" | "finishing" | "saving" | "saved">("streaming");
  const [savedEditorId, setSavedEditorId] = useState<string | null>(null);
  const revealed = useRef(createStreamingReveal());
  const sourceComplete = useRef(false), finalizing = useRef(false), finalError = useRef(false), editRevision = useRef(0);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const finalSourceRef = useRef(finalSource); finalSourceRef.current = finalSource;
  const saveRef = useRef(onSave); saveRef.current = onSave;
  const interaction = useRef({ pointer: false, until: 0 });
  const [canvas, setCanvas] = useState<CanvasSnapshot | null>(null);
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const draft = useRef<StreamingEdits>(emptyStreamingEdits()), base = useRef<CanvasSnapshot | null>(null), working = useRef<CanvasSnapshot | null>(null);
  const history = useRef<{ past: StreamingEdits[]; future: StreamingEdits[] }>({ past: [], future: [] });
  const editsCallback = useRef(onEditsChange); editsCallback.current = onEditsChange;
  const storageFailed = useRef(false);
  const [notice, setNotice] = useState("");
  const worker = useRef<Worker | null>(null), busy = useRef(false);
  const wanted = useRef("");
  const pending = useRef<{ request: string; payload: TranscriptionPreviewPayload } | null>(null);
  const showDraft = (value: StreamingEdits) => {
    editRevision.current += 1; interaction.current.until = Date.now() + 350;
    draft.current = value;
    editsCallback.current?.(value);
    try { saveStreamingEdits(jobId, value); storageFailed.current = false; setNotice(""); }
    catch { storageFailed.current = true; setNotice("Your edits are kept in this tab, but device storage is unavailable. Keep this tab open until the editor is saved."); }
    if (base.current) { const merged = applyStreamingEdits(base.current, value); working.current = merged; setCanvas(merged); }
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
      if (revealed.current.pending()) { const next = revealed.current.advance(); if (next) applySource(next); }
      finishLatestRef.current();
    }, 250);
    return () => { clearInterval(timer); window.removeEventListener("blur", pointerUp); window.removeEventListener("pointerup", pointerUp); window.removeEventListener("pointercancel", pointerUp); window.removeEventListener("keydown", typing, true); };
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
        const first = !base.current || base.current.editors[0]?.id === "awaiting-first-track";
        const next = revealed.current.receive(event.data.canvas);
        if (first && next) applySource(next);
        if (event.data.request.endsWith(":final")) sourceComplete.current = true;
        if (!storageFailed.current) setNotice("");
        finishLatestRef.current();
      }
      else if (event.data.request === wanted.current && event.data.error) setNotice("The preview is catching up. Your transcription is still running.");
      if (pending.current) { busy.current = true; instance.postMessage(pending.current); pending.current = null; }
    };
    instance.onerror = () => { busy.current = false; setNotice("The preview is unavailable. Your transcription will still open when complete."); };
    return () => { instance.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    base.current = null; working.current = null; revealed.current.reset(); sourceComplete.current = false; setCanvas(null);
  }, [jobId, metadata.streamId]);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    if (metadata.revision < 1 || finalSource) return () => controller.abort();
    const request = `${metadata.streamId}:${metadata.revision}`; wanted.current = request;
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
  }, [jobId, metadata.streamId, metadata.revision, finalSource]);
  useEffect(() => {
    if (!finalSource) return;
    const request = `${metadata.streamId}:final`; wanted.current = request;
    const end = finalSource.tracks.reduce((maximum, track) => track.segments.reduce((value, note) => Math.max(value, note.end_time_s || 0), maximum), metadata.durationSeconds);
    const payload: TranscriptionPreviewPayload = { version: 1, streamId: metadata.streamId, revision: metadata.revision || 1, complete: true,
      processedSeconds: end, settledSeconds: end, durationSeconds: end, tracks: finalSource.tracks,
      tempoAnalysis: { bpm: finalSource.bpm || (base.current ? 60 * (base.current.editors[0]?.timeSignature || 4) / (base.current.secondsPerBar || 2) : 120), beatsPerBar: finalSource.beatsPerBar || base.current?.editors[0]?.timeSignature || 4 } };
    const item = { request, payload };
    if (busy.current || !worker.current) pending.current = item;
    else { busy.current = true; worker.current.postMessage(item); }
  }, [finalSource]);
  const progress = phase === "saved" ? 100 : Math.min(99, Math.max(0, 100 * metadata.processedSeconds / metadata.durationSeconds));
  const initial = useRef<CanvasSnapshot>({ id: `stream-${jobId}`, name, secondsPerBar: 2, editors: [{
    id: "awaiting-first-track", name: "Guitar", program: 25, instrumentType: "guitar-tab", instrumentId: "acoustic_guitar", trackType: "tab",
    fps: 240, totalFrames: 480, framesPerMessure: 480, timeSignature: 4, timeSignatureBottom: 4, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {},
  }] });
  const shown = canvas ?? initial.current;
  const workspaceCanvas = useMemo(() => ({ ...shown, id: savedEditorId || `stream-${jobId}`, name: shown.name || name }), [shown, jobId, name, savedEditorId]);
  if (!working.current) working.current = shown;
  if (!base.current) base.current = shown;
  const stage = phase === "saving" ? "Saving your arrangement..." : phase === "finishing" ? "Aligning timing and finishing fingerings..." : sourceComplete.current || revealed.current.pending() ? "Adding notes - you can edit and play" : "Listening - you can edit and play";
  return <>
    {notice && <p role="status" className={styles.notice}>{notice}{phase === "finishing" && <button type="button" onClick={() => { if (finalError.current) { finalError.current = false; finishLatestRef.current(); } else void saveLatestRef.current(); }}>Retry</button>}</p>}
    <Editor editorId={savedEditorId || `stream-${jobId}`} isGuestMode={savedEditorId === "guest"} hasAccount passedTutorial
      hydratedCanvas={savedEditorId ? workspaceCanvas : undefined}
      streaming={phase === "saved" ? undefined : { canvas: workspaceCanvas, name, progress, finishing: phase !== "streaming", stage,
        onInteractionStart: () => { interaction.current.pointer = true; },
        onChange: edit, undo, redo, undoCount: historySize.undo, redoCount: historySize.redo }} />
  </>;
}
