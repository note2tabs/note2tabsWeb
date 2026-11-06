import type { CanvasSnapshot } from "../types/gte";
import type { TranscriberTrack } from "./gteApi";
import { quantizeItems } from "./gteQuantize";
import { processImportedCanvas } from "./gteImportProcessing";
import { scaleImportedLane } from "./gteImportRhythm";
import { synthesizeTimingMap } from "./gteTiming";
import { detectImportedKey } from "./gteImportedKey";
import { TRANSCRIBER_FINGERING_OPTIMIZATION_PASSES } from "./gteImportPolicy";
export type StreamingCompletionSource = { tracks: TranscriberTrack[]; bpm?: number; beatsPerBar?: number; name?: string };

/** Finalize the CURRENT score, never reimport raw predictions over user edits.
 * The model BPM is authoritative; no preferred-note-length doubling/halving. */
export function completeStreamingCanvas(current: CanvasSnapshot, source: StreamingCompletionSource): CanvasSnapshot {
  const canvas = structuredClone(current);
  const numerator = source.beatsPerBar || canvas.editors[0]?.timeSignature || 4;
  const bpm = Number.isFinite(source.bpm) && source.bpm! > 0 ? source.bpm! : 60 * numerator / (canvas.secondsPerBar || 2);
  const secondsPerBar = 60 * numerator / bpm;
  canvas.secondsPerBar = secondsPerBar;
  canvas.editors = canvas.editors.map(lane => {
    const factor = (480 / secondsPerBar) / lane.fps;
    let next = factor === 1 ? lane : scaleImportedLane(lane, factor, secondsPerBar);
    next = { ...next, fps: 480 / secondsPerBar, secondsPerBar, timeSignature: numerator, timeSignatureBottom: 4 };
    const items = [...next.notes.map(note => ({ id: `n:${note.id}`, start: note.startTime, length: note.length,
      keys: [`${note.midiNum}:${note.notationVoice || 1}`] })), ...next.chords.map(chord => ({ id: `c:${chord.id}`, start: chord.startTime, length: chord.length,
      keys: chord.originalMidi.map(midi => `${midi}:${chord.notationVoice || 1}`) }))];
    const snapped = quantizeItems(items, { step: 480 / numerator / 4, quantizeLength: true });
    next.notes = next.notes.flatMap(note => { const time = snapped.get(`n:${note.id}`); return time ? [{ ...note, startTime: time.start, length: time.length }] : []; });
    next.chords = next.chords.flatMap(chord => { const time = snapped.get(`c:${chord.id}`); return time ? [{ ...chord, startTime: time.start, length: time.length }] : []; });
    return next;
  });
  const total = Math.max(480, ...canvas.editors.map(lane => lane.totalFrames));
  canvas.timingMap = synthesizeTimingMap(secondsPerBar, total, numerator, 4);
  const result = processImportedCanvas(canvas, TRANSCRIBER_FINGERING_OPTIMIZATION_PASSES, canvas.editors.map(lane => lane.id));
  const key = detectImportedKey(result.editors.map(lane => ({ name: lane.name || "Track", trackType: lane.trackType === "drums" ? "drums" : "tab", instrumentId: lane.instrumentId || "", segments: [
    ...lane.notes.map(note => ({ pitch_midi: note.midiNum, start_time_s: note.startTime / lane.fps, end_time_s: (note.startTime + note.length) / lane.fps })),
    ...lane.chords.flatMap(chord => chord.originalMidi.map(pitch_midi => ({ pitch_midi, start_time_s: chord.startTime / lane.fps, end_time_s: (chord.startTime + chord.length) / lane.fps }))),
  ] })));
  return { ...result, ...key };
}

