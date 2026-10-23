import type { EditorSnapshot, TimingMapV2 } from "../types/gte";
import type { TranscriberSegmentGroup, TranscriberQuantization } from "./gteApi";
import { frameToSeconds, secondsToFrame } from "./gteTiming";
import { importedInstrument } from "./gteImportedInstrument";
import type { TranscriberTrack } from "./gteApi";

/** Older import servers require guitar-playable transport pitches even for
 * pitched instruments. Preserve the originals in the caller and reconstruct
 * them below after timing alignment; these transport pitches are never shown. */
export function pitchedImportTransport<T extends { tracks?: TranscriberTrack[]; segmentGroups?: TranscriberSegmentGroup[] }>(payload: T): T {
  if (!payload.tracks?.length || payload.tracks.length !== payload.segmentGroups?.length) return payload;
  const groups = payload.segmentGroups.slice();
  const tracks = payload.tracks.map((track, index) => {
    if (importedInstrument(track).instrumentType !== "notation" || track.segments.some(segment => !Number.isFinite(segment.pitch_midi) || !Number.isFinite(segment.start_time_s) || !Number.isFinite(segment.end_time_s))) return track;
    const segments = track.segments.map(segment => ({ ...segment, pitch_midi: Math.max(40, Math.min(86, segment.pitch_midi!)) }));
    groups[index] = segments;
    return { ...track, name: "Notation", trackType: "tab" as const, instrumentId: "gm:piano", program: 0, segments };
  });
  return { ...payload, tracks, segmentGroups: groups };
}

/** Rebuild pitched imports from source events, not guitar fingerings. The
 * backend's aligned timing map remains authoritative; quantization is opt-in. */
export function restorePitchedImport(lane: EditorSnapshot, segments: TranscriberSegmentGroup, map?: TimingMapV2, quantization?: TranscriberQuantization): EditorSnapshot {
  if (!map?.bars.length || !segments.length || segments.some(segment => !Number.isFinite(segment.start_time_s) || !Number.isFinite(segment.end_time_s) || !Number.isFinite(segment.pitch_midi))) return lane;
  const offset = Math.max(0, lane.timelineOffsetFrames ?? 0);
  const originSeconds = frameToSeconds(map, offset);
  const step = 480 / Number((quantization?.subdivision ?? "1/16").slice(2));
  const strength = Math.max(0, Math.min(1, quantization?.strength ?? 1));
  const notes = segments.map((segment, index) => {
    let start = secondsToFrame(map, originSeconds + segment.start_time_s!) - offset;
    let end = Math.max(start + 1, secondsToFrame(map, originSeconds + segment.end_time_s!) - offset);
    if (quantization?.enabled) {
      start = Math.max(0, Math.round(start + (Math.round(start / step) * step - start) * strength));
      if (quantization.quantizeDurations) {
        const length = Math.max(step, end - start);
        end = start + Math.round(length + (Math.max(step, Math.round(length / step) * step) - length) * strength);
      } else end = Math.max(start + 1, end);
    }
    return { id: index + 1, startTime: start + offset, length: end - start, midiNum: segment.pitch_midi!,
      tab: [0, 0] as [number, number], optimals: [],
      velocity: typeof segment.amplitude === "number" ? Math.max(0, Math.min(1, segment.amplitude)) : 1,
      pitchBend: segment.pitch_bend ?? undefined, notationVoice: 1 as const };
  });
  return { ...lane, notes, chords: [], noteEffects: [], notation: {},
    totalFrames: Math.max(lane.totalFrames, Math.ceil(notes.reduce((end, note) => Math.max(end, note.startTime + note.length), 0) / 480) * 480) };
}
