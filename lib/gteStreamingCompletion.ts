import type { CanvasSnapshot } from "../types/gte";
import type { TranscriberTrack } from "./gteApi";
export type StreamingCompletionSource = { tracks: TranscriberTrack[]; bpm?: number; beatsPerBar?: number; name?: string };

/** Chunks are already quantized/optimized using preprocessing tempo. Completion
 * is a snapshot boundary only: never rescale, revoice or refinger user work. */
export function completeStreamingCanvas(current: CanvasSnapshot, _source: StreamingCompletionSource): CanvasSnapshot {
  return structuredClone(current);
}
