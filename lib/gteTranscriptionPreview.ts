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
import { quantizeItems } from "./gteQuantize";
import { FIXED_NOTE_VELOCITY } from "./gteFixedVelocity";
import { assignVoices } from "./gteAssignVoices";

import { previewMetadata, streamingTrackKey, type TranscriptionPreviewPayload } from "./transcriptionPreviewProtocol";
export type { TranscriptionPreviewMetadata, TranscriptionPreviewPayload } from "./transcriptionPreviewProtocol";

/** Quantize globally before partitioning: boundary clusters and same-pitch
 * overlaps must see their neighbours, even when those start in another bar. */
export function quantizeStreamingSegments(source: TranscriberTrack, secondsPerBar: number, numerator: number) {
  const fps = 480 / secondsPerBar;
  const raw = source.segments.map((segment, index) => {
    const start = Math.round(segment.start_time_s! * fps);
    return { id: index, start, length: Math.max(1, Math.round(segment.end_time_s! * fps) - start), keys: [`m${segment.pitch_midi}`] };
  });
  const snapped = quantizeItems(raw, { step: 480 / numerator / 4, quantizeLength: true });
  return source.segments.flatMap((segment, index) => {
    const note = snapped.get(index);
    return note ? [{ ...segment, sourceId: segment.sourceId ?? String(index), start_time_s: note.start / fps, end_time_s: (note.start + note.length) / fps }] : [];
  });
}

/**
 * Mirrors the backend's MIDI timing (muscriptor `BeatGrid.bar_offset` + `onset_delay`): the finished
 * file puts every note at `t - delay + bar_offset(min_shift = delay)`, so bar 1 starts on the song's first
 * downbeat. The live preview must apply the same shift, or notes straddle bar lines and quantize onto the
 * wrong grid until the final import re-aligns everything.
 */
export function streamingBarOffset(firstDownbeat: number, bpm: number, beatsPerBar: number | null, minShift = 0) {
  const barSeconds = beatsPerBar && beatsPerBar > 0 ? beatsPerBar * 60 / bpm : null;
  const step = barSeconds ?? 60 / bpm;
  let offset = barSeconds === null ? 0 : (step - firstDownbeat % step) % step;
  if (offset < minShift) offset += step * Math.ceil((minShift - offset) / step);
  return offset;
}

const ONSET_SUBDIVISIONS = [1, 2, 3, 4, 6, 8, 12, 16, 24], MIN_ONSET_CONCENTRATION = .5, MIN_ONSETS = 40, MAX_ONSET_DELAY_S = .04;
/** Port of the backend's `estimate_onset_delay`, on a constant-tempo grid anchored at the first downbeat
 * (the preview does not carry the individual tracked beats). Seconds the onsets run late; null if unsure. */
export function estimateOnsetDelay(onsets: readonly number[], bpm: number, firstDownbeat: number): number | null {
  const period = 60 / bpm;
  const phases = [...new Set(onsets.map(time => Math.round(time * 1000) / 1000))].map(time => (time - firstDownbeat) / period);
  if (phases.length < MIN_ONSETS) return null;
  let best: { r: number; delayBeats: number } | null = null;
  for (const subdivision of ONSET_SUBDIVISIONS) {
    if (period / (2 * subdivision) < MAX_ONSET_DELAY_S) continue;
    let re = 0, im = 0;
    for (const phase of phases) {
      const angle = 2 * Math.PI * (((phase * subdivision) % 1) + 1) % (2 * Math.PI);
      re += Math.cos(angle); im += Math.sin(angle);
    }
    re /= phases.length; im /= phases.length;
    const r = Math.hypot(re, im);
    if (!best || r > best.r) best = { r, delayBeats: Math.atan2(im, re) / (2 * Math.PI * subdivision) };
  }
  if (!best || best.r < MIN_ONSET_CONCENTRATION) return null;
  const delay = best.delayBeats * period;
  return Math.abs(delay) > MAX_ONSET_DELAY_S ? null : delay;
}

/** Canonical one-bar processing, shared by progressive and complete raw input. */
export class WaitingForPreviewTempoError extends Error {
  constructor() { super("Waiting for preprocessing tempo"); this.name = "WaitingForPreviewTempoError"; }
}

export const STREAMING_CHUNK_BARS = 1;
export function createPreviewBuilder() {
  let streamId = "";
  let initialTempo: { bpm: number; numerator: number } | null = null;
  // Locked per stream, like the tempo, so already-placed notes never wobble as more arrive.
  let timeline: { firstDownbeat: number; beatsPerBar: number | null; delay: number | null } | null = null;
  let lastShift = 0;
  const cache = new Map<string, { fingerprint: string; lane: EditorSnapshot }>();
  const build = (payload: TranscriptionPreviewPayload): CanvasSnapshot => {
    if (!previewMetadata(payload) || !Array.isArray(payload.tracks) || payload.tracks.length > 128) throw new Error("Invalid transcription preview");
    if (streamId !== payload.streamId) { cache.clear(); initialTempo = null; timeline = null; lastShift = 0; streamId = payload.streamId; }
    const beats = payload.tempoAnalysis?.beatsPerBar;
    const modelBpm = Number(payload.tempoAnalysis?.bpm);
    if (!initialTempo) {
      if (!Number.isFinite(modelBpm) || modelBpm < 20 || modelBpm > 400) throw new WaitingForPreviewTempoError();
      initialTempo = { bpm: modelBpm, numerator: typeof beats === "number" && Number.isInteger(beats) && beats >= 1 && beats <= 16 ? beats : 4 };
    }
    const { bpm, numerator } = initialTempo, secondsPerBar = 60 * numerator / bpm;
    // Final tracks come from the already aligned MIDI; only live preview notes still need the shift.
    const firstDownbeat = Number(payload.tempoAnalysis?.firstDownbeat);
    if (!payload.complete && !timeline && payload.tempoAnalysis?.firstDownbeat != null && Number.isFinite(firstDownbeat) && firstDownbeat >= 0)
      timeline = { firstDownbeat, beatsPerBar: typeof beats === "number" && Number.isInteger(beats) && beats > 0 ? beats : null, delay: null };
    if (!payload.complete && timeline && timeline.delay === null) {
      const reported = payload.tempoAnalysis?.onsetDelay;
      timeline.delay = typeof reported === "number" && Number.isFinite(reported) ? reported
        : estimateOnsetDelay(payload.tracks.flatMap(track => track.segments.map(note => note.start_time_s!)), bpm, timeline.firstDownbeat);
    }
    const shift = payload.complete || !timeline ? 0
      : streamingBarOffset(timeline.firstDownbeat, bpm, timeline.beatsPerBar, timeline.delay ?? 0) - (timeline.delay ?? 0);
    lastShift = shift;
    const totalFrames = Math.max(480, Math.ceil((Math.max(payload.durationSeconds, payload.processedSeconds) + shift) / secondsPerBar) * 480);
    const timingMap = synthesizeTimingMap(secondsPerBar, totalFrames, numerator, 4);
    const editors = payload.tracks.map(source => {
      if (!Array.isArray(source.segments) || source.segments.some(note => !Number.isFinite(note.start_time_s) || !Number.isFinite(note.end_time_s) || !Number.isInteger(note.pitch_midi) || note.pitch_midi! < 0 || note.pitch_midi! > 127 || note.start_time_s! < 0 || note.end_time_s! <= note.start_time_s!)) throw new Error("Invalid preview notes");
      const trackKey = streamingTrackKey(source), id = `preview-${streamId}-${trackKey}`;
      const trackFingerprint = JSON.stringify([source, secondsPerBar, numerator, totalFrames, (payload.settledSeconds ?? payload.processedSeconds), payload.complete, Math.round(shift * 1000)]);
      const cachedTrack = cache.get(`${trackKey}:track`);
      if (cachedTrack?.fingerprint === trackFingerprint) return cachedTrack.lane;
      const instrument = importedInstrument(source);
      const seed: EditorSnapshot = { id, name: source.name, program: source.program, ...instrument, trackType: source.trackType,
        tuning: instrument.instrumentType === "bass-tab" ? { openStringMidi: getTuningPreset("bass-standard").openStringMidi } : undefined,
        timeSignature: numerator, timeSignatureBottom: 4,
        framesPerMessure: 480, fps: 480 / secondsPerBar, secondsPerBar, totalFrames, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
      const groups = new Map<number, Array<{ segment: TranscriberTrack["segments"][number]; index: number }>>();
      const aligned = shift ? { ...source, segments: source.segments.map(note => ({ ...note, start_time_s: note.start_time_s! + shift, end_time_s: note.end_time_s! + shift })) } : source;
      quantizeStreamingSegments(aligned, secondsPerBar, numerator).forEach((segment, index) => {
        const chunk = Math.floor(segment.start_time_s! / secondsPerBar / STREAMING_CHUNK_BARS);
        const group = groups.get(chunk) ?? []; group.push({ segment, index }); groups.set(chunk, group);
      });
      const result: EditorSnapshot = { ...seed, noteEffects: [], notation: {} };
      for (const [chunk, group] of groups) {
        const key = `${trackKey}:${chunk}`, offset = chunk * STREAMING_CHUNK_BARS * 480;
        const origin = chunk * STREAMING_CHUNK_BARS * secondsPerBar;
        const settled = payload.complete || origin + STREAMING_CHUNK_BARS * secondsPerBar + secondsPerBar / numerator / 12 <= (payload.settledSeconds ?? payload.processedSeconds) + shift;
        if (!settled) continue;
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
                  optimizeTrackFingeringInSnapshot(lane, { simplifyOversizedChords: true });
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
            note.id = -Math.abs(note.id);
            note.velocity = FIXED_NOTE_VELOCITY;
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
  /** Seconds the last built payload was shifted by, so callers can place raw times on the same timeline. */
  return Object.assign(build, { shiftSeconds: () => lastShift });
}

/** Unsettled inference is visible immediately, but stays outside the musical
 * model until the normal bar quantization/optimization has validated it. */
export function buildUnsettledGhosts(payload: TranscriptionPreviewPayload, canvas: CanvasSnapshot, shiftSeconds = 0): import("./gteStreamingGhosts").StreamingGhostLayers {
 if(payload.complete)return {};
 const bar=canvas.secondsPerBar || 2, numerator=canvas.editors[0]?.timeSignature || 4;
 const settled=Math.max(0,Math.floor(((payload.settledSeconds ?? 0)+shiftSeconds-bar/numerator/12)/bar))*480;
 return Object.fromEntries(payload.tracks.map(track=>{
  const lane=canvas.editors.find(item=>item.id.endsWith(`-${streamingTrackKey(track)}`));
  if(!lane)return ["",[]];
  const notes=track.segments.filter(note=>(note.start_time_s!+shiftSeconds)*lane.fps>=settled).slice(0,128).flatMap((note,index)=>{
   const playable=getAllTabsForMidi(lane,note.pitch_midi!);
   if(lane.instrumentType !== "notation" && lane.instrumentType !== "drums" && !playable.length)return [];
   const tab: [number,number]=lane.instrumentType === "notation" ? [0,0] : lane.instrumentType === "drums" ? [Math.max(0,DRUM_VOICES.findIndex(voice=>voice.id===getDrumVoiceByMidi(note.pitch_midi!)?.id)),0] : playable[0];
   return [{key:`unsettled:${note.sourceId ?? index}`,phase:"preview" as const,showLabel:false,start:Math.round((note.start_time_s!+shiftSeconds)*lane.fps),length:Math.max(1,Math.round((note.end_time_s!-note.start_time_s!)*lane.fps)),midi:note.pitch_midi!,tab}];
  });
  const counts=new Map<number,number>();for(const note of notes){const onset=Math.round(note.start/30);counts.set(onset,(counts.get(onset) ?? 0)+1);}
  return [lane.id,notes.map(note=>({...note,shape:(counts.get(Math.round(note.start/30)) ?? 0)>1 ? "chord" as const : "note" as const}))];
 }));
}
