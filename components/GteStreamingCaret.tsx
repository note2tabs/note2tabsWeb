import { useSyncExternalStore } from "react";
import { getStreamingHead, subscribeStreamingHead } from "../lib/gteStreamingHead";

/** The transcription write head: a thin caret with a soft glow on the not-yet-written side.
 * Subscribes to the head store itself, so only this element re-renders as it moves. */
export default function GteStreamingCaret({ fps, locate, rowStride, scale, height }: {
  fps: number; scale: number; rowStride: number; height: number;
  locate: (frame: number) => { rowIndex: number; inRowStart: number } | undefined;
}) {
  const head = useSyncExternalStore(subscribeStreamingHead, getStreamingHead, () => null);
  if (head === null || !(fps > 0)) return null;
  const position = locate(Math.round(head * fps));
  if (!position) return null;
  return <span aria-hidden="true" data-streaming-caret="true" className="gte-streaming-caret"
    style={{ top: position.rowIndex * rowStride, left: position.inRowStart * scale, height }} />;
}
