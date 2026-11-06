import type { CanvasSnapshot } from "../types/gte";
import type { TranscriberTrack } from "./gteApi";
import { applyStreamingEdits, hasStreamingEdits, type StreamingEditContext, type StreamingEdits } from "./gteStreamingEdits";
import { importedInstrument } from "./gteImportedInstrument";
import { restorePitchedImport } from "./gteNotationImport";
import { scaleImportedLane, scaleImportTimingMap } from "./gteImportRhythm";
import { detectImportedKey } from "./gteImportedKey";

export function hasStreamingRhythmEdits(draft?: StreamingEdits) {
  return Boolean(draft?.addedTracks?.length || draft?.removedTrackKeys?.length || draft?.tracks.some(track => track.events.some(edit => !edit.before || !edit.after ||
    edit.before.startSeconds !== edit.after.startSeconds || edit.before.lengthSeconds !== edit.after.lengthSeconds) ||
    track.settings.some(edit => edit.field === "notation" && JSON.stringify((edit.before as any)?.rests) !== JSON.stringify((edit.after as any)?.rests))));
}

/** The ordinary tempo policy sees the current music, including edits, once. */
export function streamingRhythmReference(canvas: CanvasSnapshot, draft: StreamingEdits | undefined, ids: readonly string[], tracks: readonly TranscriberTrack[] | undefined, context: StreamingEditContext) {
  if (!hasStreamingRhythmEdits(draft)) return canvas;
  const source = { ...canvas, editors: canvas.editors.map(lane => {
    const track = tracks?.[ids.indexOf(lane.id)];
    return track && importedInstrument(track).instrumentType === "notation"
      ? restorePitchedImport(lane, track.segments, context.timingMap, context.quantization) : lane;
  }) };
  return applyStreamingEdits(source, draft, ids, tracks, { ...context, final: true });
}

/** No draft means an exact identity operation, including all canonical metadata. */
export function finalizeStreamingEdits(baseline: CanvasSnapshot, draft: StreamingEdits | undefined, ids: readonly string[], tracks: readonly TranscriberTrack[] | undefined, context: StreamingEditContext) {
  if (!hasStreamingEdits(draft)) return baseline;
  draft = draft!;
  let result = applyStreamingEdits(baseline, draft, ids, tracks, { ...context, final: true });
  if (ids.length === result.editors.length) {
    // Rebar only after canonical fingering is chosen. A changed preferred BPM
    // must not recalculate fingerings in passages the user left untouched.
    const ratio = (context.streamingRhythmScale ?? context.rhythmScale ?? 1) / (context.rhythmScale ?? 1);
    if (ratio !== 1 && result.timingMap) {
      const map = scaleImportTimingMap(result.timingMap, ratio);
      if (map !== result.timingMap) {
        const secondsPerBar = map.bars[0].endSeconds - map.bars[0].startSeconds;
        result = { ...result, timingMap: map, secondsPerBar, editors: result.editors.map(lane => scaleImportedLane(lane, ratio, secondsPerBar)) };
      }
    }
    const affectsKey = draft.tracks.some(track => track.events.some(edit => {
      if (!edit.before || !edit.after || edit.before.lengthSeconds !== edit.after.lengthSeconds) return true;
      const pitches = (event: typeof edit.before) => event!.kind === "note" ? [event!.value.midiNum % 12] : event!.value.originalMidi.map(midi => midi % 12).sort();
      return JSON.stringify(pitches(edit.before)) !== JSON.stringify(pitches(edit.after));
    }));
    const key = affectsKey ? detectImportedKey(result.editors.map(lane => ({ name: lane.name ?? "Track", trackType: lane.trackType === "drums" ? "drums" : "tab", instrumentId: lane.instrumentId ?? "", segments: [
      ...lane.notes.map(note => ({ pitch_midi: note.midiNum, start_time_s: note.startTime / lane.fps, end_time_s: (note.startTime + note.length) / lane.fps })),
      ...lane.chords.flatMap(chord => chord.originalMidi.map(pitch_midi => ({ pitch_midi, start_time_s: chord.startTime / lane.fps, end_time_s: (chord.startTime + chord.length) / lane.fps }))),
    ] }))) : null;
    if (key && !draft.canvasSettings?.some(change => change.field === "keyBase" || change.field === "keyType")) { result.keyBase = key.keyBase; result.keyType = key.keyType; }
  }
  return result;
}
