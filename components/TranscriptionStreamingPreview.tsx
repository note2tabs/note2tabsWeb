import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CanvasSnapshot } from "../types/gte";
import { previewMetadata, type TranscriptionPreviewMetadata, type TranscriptionPreviewPayload } from "../lib/transcriptionPreviewProtocol";
import { applyStreamingEdits, emptyStreamingEdits, readStreamingEdits, recordStreamingCanvasEdit, saveStreamingEdits, type StreamingEdits } from "../lib/gteStreamingEdits";
import { streamingTrackKey } from "../lib/transcriptionPreviewProtocol";
import type { EditorSnapshot } from "../types/gte";
import styles from "./TranscriptionStreamingPreview.module.css";

const Editor = dynamic(() => import("./GteEditorWorkspace"), { ssr: false });
const waiting: TranscriptionPreviewMetadata = { version: 1, streamId: "waiting", revision: 0, processedSeconds: 0, durationSeconds: 1, complete: false };
type Props = { jobId: string; name: string; metadata: TranscriptionPreviewMetadata | null; finishing: boolean; onEditsChange?: (draft: StreamingEdits) => void };

export default function TranscriptionStreamingPreview({ jobId, name, metadata: incomingMetadata, finishing, onEditsChange }: Props) {
  const metadata = incomingMetadata ?? waiting;
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
    draft.current = value;
    editsCallback.current?.(value);
    try { saveStreamingEdits(jobId, value); storageFailed.current = false; setNotice(""); }
    catch { storageFailed.current = true; setNotice("Your edits are kept in this tab, but device storage is unavailable. Keep this tab open until the editor is saved."); }
    if (base.current) { const merged = applyStreamingEdits(base.current, value); working.current = merged; setCanvas(merged); }
    setHistorySize({ undo: history.current.past.length, redo: history.current.future.length });
  };
  const edit = (_before: CanvasSnapshot, next: CanvasSnapshot) => {
    const previous = working.current;
    if (!previous || finishing) return;
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
    base.current = null; working.current = null; setCanvas(null);
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
  const progress = Math.min(100, Math.max(0, 100 * metadata.processedSeconds / metadata.durationSeconds));
  const initial = useRef<CanvasSnapshot>({ id: `stream-${jobId}`, name, secondsPerBar: 2, editors: [{
    id: "awaiting-first-track", name: "Guitar", program: 25, instrumentType: "guitar-tab", instrumentId: "acoustic_guitar", trackType: "tab",
    fps: 240, totalFrames: 480, framesPerMessure: 480, timeSignature: 4, timeSignatureBottom: 4, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {},
  }] });
  const shown = canvas ?? initial.current;
  const workspaceCanvas = useMemo(() => ({ ...shown, id: `stream-${jobId}`, name: shown.name || name }), [shown, jobId, name]);
  if (!working.current) working.current = shown;
  if (!base.current) base.current = shown;
  return <>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <Editor editorId={`stream-${jobId}`} isGuestMode={false} hasAccount passedTutorial
      streaming={{ canvas: workspaceCanvas, name, progress, finishing,
        onChange: edit, undo, redo, undoCount: historySize.undo, redoCount: historySize.redo }} />
  </>;
}
