import { completeStreamingCanvas } from "../lib/gteStreamingCompletion";
import { createPreviewBuilder } from "../lib/gteTranscriptionPreview";
import type { TranscriptionPreviewPayload } from "../lib/transcriptionPreviewProtocol";

const build = createPreviewBuilder();
self.onmessage = (event: MessageEvent<any>) => {
  if (event.data.type === "complete") {
    try { self.postMessage({ type: "complete", revision: event.data.revision, canvas: completeStreamingCanvas(event.data.canvas, event.data.source) }); }
    catch { self.postMessage({ type: "complete", revision: event.data.revision, error: "Could not finish the arrangement. Your edits are still here." }); }
    return;
  }
  try { self.postMessage({ request: event.data.request, canvas: build(event.data.payload), throughSeconds: event.data.payload.complete ? event.data.payload.durationSeconds : event.data.payload.settledSeconds ?? event.data.payload.processedSeconds }); }
  catch { self.postMessage({ request: event.data.request, error: "Preview unavailable" }); }
};
