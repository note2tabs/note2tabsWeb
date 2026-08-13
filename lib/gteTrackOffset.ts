import type { EditorSnapshot } from "../types/gte";

export const GTE_TRACK_OFFSET_BAR_FRAMES = 480;

const finiteFrame = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
};

export const normalizeTrackOffsetFrames = (value: unknown) =>
  Math.max(0, finiteFrame(value));

export const offsetTrackToFrame = (
  lane: EditorSnapshot,
  requestedOffsetFrames: unknown
): EditorSnapshot => {
  const currentOffset = normalizeTrackOffsetFrames(lane.timelineOffsetFrames);
  const nextOffset = normalizeTrackOffsetFrames(requestedOffsetFrames);
  const delta = nextOffset - currentOffset;
  if (delta === 0) return lane;
  const shift = (value: unknown) => Math.max(0, finiteFrame(value) + delta);

  return {
    ...lane,
    timelineOffsetFrames: nextOffset,
    totalFrames: Math.max(
      GTE_TRACK_OFFSET_BAR_FRAMES,
      finiteFrame(lane.totalFrames) + delta
    ),
    notes: lane.notes.map((note) => ({ ...note, startTime: shift(note.startTime) })),
    chords: lane.chords.map((chord) => ({ ...chord, startTime: shift(chord.startTime) })),
    drumLoops: (lane.drumLoops || []).map((loop) => ({
      ...loop,
      sourceStart: shift(loop.sourceStart),
      sourceEnd: shift(loop.sourceEnd),
      loopEnd: shift(loop.loopEnd),
    })),
    cutPositionsWithCoords: lane.cutPositionsWithCoords.map((cut) => [
      [shift(cut[0][0]), shift(cut[0][1])],
      [...cut[1]],
    ]),
  };
};
