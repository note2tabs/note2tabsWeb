import type { EditorSnapshot, TimingMapV2 } from "../types/gte";
import type { TranscriberSegmentGroup, TranscriberQuantization } from "./gteApi";
import { frameToSeconds, secondsToFrame } from "./gteTiming";
import { quantizeItems } from "./gteQuantize";
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
  const bar = map.bars[0], numerator = Math.max(1, bar?.timeSignature?.numerator ?? 4), denominator = Math.max(1, bar?.timeSignature?.denominator ?? 4);
  const step = 480 * denominator / (numerator * Number((quantization?.subdivision ?? "1/16").slice(2)));
  const raw = segments.map((segment, index) => {
    const start = secondsToFrame(map, originSeconds + segment.start_time_s!) - offset;
    return { id: index, start, length: Math.max(1, secondsToFrame(map, originSeconds + segment.end_time_s!) - offset - start), keys: ["m" + segment.pitch_midi] };
  });
  const snapped = quantization?.enabled
    ? quantizeItems(raw, { step, strength: quantization.strength ?? 1, quantizeLength: quantization.quantizeDurations !== false })
    : undefined;
  const notes = segments.flatMap((segment, index) => {
    const value = snapped ? snapped.get(index) : { start: raw[index].start, length: raw[index].length };
    if (!value) return [];
    return [{ id: index + 1, startTime: value.start + offset, length: value.length, midiNum: segment.pitch_midi!,
      tab: [0, 0] as [number, number], optimals: [],
      velocity: typeof segment.amplitude === "number" ? Math.max(0, Math.min(1, segment.amplitude)) : 1,
      pitchBend: segment.pitch_bend ?? undefined, notationVoice: 1 as const }];
  });
  return { ...lane, notes, chords: [], noteEffects: [], notation: {},
    totalFrames: Math.max(lane.totalFrames, Math.ceil(notes.reduce((end, note) => Math.max(end, note.startTime + note.length), 0) / 480) * 480) };
}
