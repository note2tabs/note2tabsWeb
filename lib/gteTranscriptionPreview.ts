import type { CanvasSnapshot, EditorSnapshot } from "../types/gte";
import type { TranscriberTrack } from "./gteApi";
import { importedInstrument } from "./gteImportedInstrument";
import { restorePitchedImport } from "./gteNotationImport";
import { synthesizeTimingMap } from "./gteTiming";
import { detectImportedKey } from "./gteImportedKey";
import { getAllTabsForMidi, getTuningPreset } from "./gteTuning";
import { getDrumVoiceByMidi, DRUM_VOICES } from "./gteDrums";
import { generatePlayingCoordinatesInSnapshot } from "./gtePlayingCoordinates";
import { optimizeTrackFingeringInSnapshot, finalizeOptimizedTrackFingeringInSnapshot, mergeRedundantCutRegionsInSnapshot } from "./gteFingeringOptimization";
import { cleanTinyOverlapsInSnapshot } from "./gteOverlapCleanup";
import { TRANSCRIBER_FINGERING_OPTIMIZATION_PASSES } from "./gteImportPolicy";
import { assignVoices } from "./gteAssignVoices";

import { previewMetadata, streamingTrackKey, type TranscriptionPreviewPayload } from "./transcriptionPreviewProtocol";
export type { TranscriptionPreviewMetadata, TranscriptionPreviewPayload } from "./transcriptionPreviewProtocol";

/** Four-bar provisional optimization. Final import never consumes these choices. */
export const STREAMING_CHUNK_BARS = 4;
export function createPreviewBuilder() {
  let streamId = "";
  const cache = new Map<string, { fingerprint: string; lane: EditorSnapshot }>();
  return (payload: TranscriptionPreviewPayload): CanvasSnapshot => {
    if (!previewMetadata(payload) || !Array.isArray(payload.tracks) || payload.tracks.length > 128) throw new Error("Invalid transcription preview");
    if (streamId !== payload.streamId) { cache.clear(); streamId = payload.streamId; }
    const beats = payload.tempoAnalysis?.beatsPerBar;
    const numerator = typeof beats === "number" && Number.isInteger(beats) && beats >= 1 && beats <= 16 ? beats : 4;
    const bpm = Number(payload.tempoAnalysis?.bpm), secondsPerBar = 60 * numerator / (Number.isFinite(bpm) && bpm >= 20 && bpm <= 400 ? bpm : 120);
    const totalFrames = Math.max(480, Math.ceil(payload.processedSeconds / secondsPerBar) * 480);
    const timingMap = synthesizeTimingMap(secondsPerBar, totalFrames, numerator, 4);
    const editors = payload.tracks.map(source => {
      if (!Array.isArray(source.segments) || source.segments.some(note => !Number.isFinite(note.start_time_s) || !Number.isFinite(note.end_time_s) || !Number.isInteger(note.pitch_midi) || note.pitch_midi! < 0 || note.pitch_midi! > 127 || note.start_time_s! < 0 || note.end_time_s! <= note.start_time_s!)) throw new Error("Invalid preview notes");
      const trackKey = streamingTrackKey(source), id = `preview-${streamId}-${trackKey}`;
      const trackFingerprint = JSON.stringify([source, secondsPerBar, numerator, totalFrames, Math.floor((payload.settledSeconds ?? payload.processedSeconds) / (STREAMING_CHUNK_BARS * secondsPerBar)), payload.complete]);
      const cachedTrack = cache.get(`${trackKey}:track`);
      if (cachedTrack?.fingerprint === trackFingerprint) return cachedTrack.lane;
      const instrument = importedInstrument(source);
      const seed: EditorSnapshot = { id, name: source.name, program: source.program, ...instrument, trackType: source.trackType,
        tuning: instrument.instrumentType === "bass-tab" ? { openStringMidi: getTuningPreset("bass-standard").openStringMidi } : undefined,
        timeSignature: numerator, timeSignatureBottom: 4,
        framesPerMessure: 480, fps: 480 / secondsPerBar, secondsPerBar, totalFrames, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
      const groups = new Map<number, Array<{ segment: TranscriberTrack["segments"][number]; index: number }>>();
      source.segments.forEach((segment, index) => {
        const chunk = Math.floor(segment.start_time_s! / secondsPerBar / STREAMING_CHUNK_BARS);
        const group = groups.get(chunk) ?? []; group.push({ segment, index }); groups.set(chunk, group);
      });
      const result: EditorSnapshot = { ...seed, noteEffects: [], notation: {} };
      for (const [chunk, group] of groups) {
        const key = `${trackKey}:${chunk}`, offset = chunk * STREAMING_CHUNK_BARS * 480;
        const origin = chunk * STREAMING_CHUNK_BARS * secondsPerBar;
        const settled = payload.complete || origin + STREAMING_CHUNK_BARS * secondsPerBar <= (payload.settledSeconds ?? payload.processedSeconds);
        const fingerprint = JSON.stringify([group, secondsPerBar, numerator, settled]);
        let lane = cache.get(key)?.fingerprint === fingerprint ? cache.get(key)!.lane : undefined;
        if (!lane) {
          const segments = group.map(({ segment }) => ({ ...segment, start_time_s: segment.start_time_s! - origin, end_time_s: segment.end_time_s! - origin }));
          const localMap = synthesizeTimingMap(secondsPerBar, STREAMING_CHUNK_BARS * 480, numerator, 4);
          lane = restorePitchedImport({ ...seed, totalFrames: STREAMING_CHUNK_BARS * 480 }, segments, localMap, { enabled: false });
          lane.notes.forEach((note, index) => {
            const entry = group[index], sourceId = Number(entry.segment.sourceId);
            note.id = Number.isSafeInteger(sourceId) && sourceId >= 0 && entry.segment.sourceId !== undefined ? sourceId + 1 : entry.index + 1;
          });
          if (instrument.instrumentType === "drums") lane.notes.forEach(note => { note.tab = [Math.max(0, DRUM_VOICES.findIndex(voice => voice.id === getDrumVoiceByMidi(note.midiNum)?.id)), 0]; });
          else {
            if (instrument.instrumentType !== "notation") {
              lane.notes.forEach(note => { note.optimals = getAllTabsForMidi(lane!, note.midiNum); note.tab = note.optimals[0] ?? [0, 0]; });
              if (settled) {
                cleanTinyOverlapsInSnapshot(lane, { manual: true });
                for (let pass = 0; pass < TRANSCRIBER_FINGERING_OPTIMIZATION_PASSES; pass++) {
                  generatePlayingCoordinatesInSnapshot(lane);
                  optimizeTrackFingeringInSnapshot(lane);
                  finalizeOptimizedTrackFingeringInSnapshot(lane);
                  mergeRedundantCutRegionsInSnapshot(lane);
                }
              }
            }
            if (settled) lane = assignVoices({ track: lane }).track;
          }
          lane.notes.forEach(note => {
            // Inference owns negative IDs; local editor additions use positive
            // IDs, so later chunks can never collide with a user's new note.
            const source = group.filter(entry => entry.segment.pitch_midi! % 12 === note.midiNum % 12)
              .sort((a, b) => Math.abs((a.segment.start_time_s! - origin) * seed.fps - note.startTime) - Math.abs((b.segment.start_time_s! - origin) * seed.fps - note.startTime))[0];
            const sourceId = Number(source?.segment.sourceId);
            note.id = -(source && Number.isSafeInteger(sourceId) && sourceId >= 0 && source.segment.sourceId !== undefined ? sourceId + 1 : (source?.index ?? 0) + 1);
            note.startTime += offset;
          });
          lane.chords.forEach(chord => { chord.startTime += offset; chord.id = -(1_000_000 + chunk * 100_000 + chord.id); });
          lane.cutPositionsWithCoords = lane.cutPositionsWithCoords.map(([range, coord]) => [[range[0] + offset, range[1] + offset], coord]);
          lane.optimalsByTime = Object.fromEntries(Object.entries(lane.optimalsByTime).map(([frame, value]) => [String(Number(frame) + offset), value]));
          cache.set(key, { fingerprint, lane });
        }
        result.notes.push(...lane.notes); result.chords.push(...lane.chords);
        result.cutPositionsWithCoords.push(...lane.cutPositionsWithCoords);
        Object.assign(result.optimalsByTime, lane.optimalsByTime);
      }
      cache.set(`${trackKey}:track`, { fingerprint: trackFingerprint, lane: result });
      return result;
    });
    return { id: `preview-${streamId}`, editors, timingMap, secondsPerBar, ...detectImportedKey(payload.tracks) };
  };
}
