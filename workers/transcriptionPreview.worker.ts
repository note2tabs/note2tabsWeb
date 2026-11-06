import { completeStreamingCanvas } from "../lib/gteStreamingCompletion";
import { createPreviewBuilder, buildUnsettledGhosts, WaitingForPreviewTempoError } from "../lib/gteTranscriptionPreview";
import type { TranscriptionPreviewPayload } from "../lib/transcriptionPreviewProtocol";

const build = createPreviewBuilder();
self.onmessage = (event: MessageEvent<any>) => {
  if (event.data.type === "complete") {
    try { self.postMessage({ type: "complete", revision: event.data.revision, canvas: completeStreamingCanvas(event.data.canvas, event.data.source) }); }
    catch { self.postMessage({ type: "complete", revision: event.data.revision, error: "Could not finish the arrangement. Your edits are still here." }); }
    return;
  }
  try { const canvas=build(event.data.payload); self.postMessage({ request: event.data.request, canvas, provisionalGhosts: buildUnsettledGhosts(event.data.payload,canvas), throughSeconds: event.data.payload.complete ? event.data.payload.durationSeconds : event.data.payload.settledSeconds ?? event.data.payload.processedSeconds }); }
  catch (error) {
    if (error instanceof WaitingForPreviewTempoError) {
      self.postMessage({ request: event.data.request, waitingForTempo: true });
    } else {
      self.postMessage({ request: event.data.request, error: "Live editor update unavailable" });
    }
  }
};
