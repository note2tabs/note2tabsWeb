import { createPreviewBuilder } from "../lib/gteTranscriptionPreview";
import type { TranscriptionPreviewPayload } from "../lib/transcriptionPreviewProtocol";

const build = createPreviewBuilder();
self.onmessage = (event: MessageEvent<{ request: string; payload: TranscriptionPreviewPayload }>) => {
  try { self.postMessage({ request: event.data.request, canvas: build(event.data.payload) }); }
  catch { self.postMessage({ request: event.data.request, error: "Preview unavailable" }); }
};
