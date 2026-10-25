import type { CanvasSnapshot } from "../types/gte";
import { isNotationTrack } from "./gteNotation";
/** Entry context changes presentation, never the model or instrument detection. */
export const TRANSCRIPTION_ENTRY_TITLES = {
  piano: "Transcribe piano audio",
  bass: "Transcribe bass audio",
  drums: "Transcribe drum audio",
  ukulele: "Transcribe ukulele audio",
} as const;
export function transcriptionEntryInstrument(value: unknown): keyof typeof TRANSCRIPTION_ENTRY_TITLES | undefined {
  return typeof value === "string" && Object.hasOwn(TRANSCRIPTION_ENTRY_TITLES, value)
    ? value as keyof typeof TRANSCRIPTION_ENTRY_TITLES : undefined;
}
export function transcriptionEntryHref(instrument: keyof typeof TRANSCRIPTION_ENTRY_TITLES, youtube = false) {
  return instrument === "piano" ? `/piano-transcription${youtube ? "?mode=youtube" : ""}`
    : `/transcribe?instrument=${instrument}${youtube ? "&mode=youtube" : ""}`;
}

/** Focus actual transcribed piano notes; never create or relabel a track. */
export function focusPianoTranscription(canvas: CanvasSnapshot): CanvasSnapshot {
  const piano = canvas.editors.find(lane => isNotationTrack(lane) &&
    /piano/i.test([lane.instrumentId, lane.chordEditor?.instrumentSound, lane.name].join(" ")) &&
    (lane.notes.length > 0 || lane.chords.length > 0));
  return piano ? { ...canvas, activeLaneId: piano.id } : canvas;
}
