export type ChordPlaybackStrum = {
  time: number;
  direction: "down" | "up" | "mute";
};

export type ChordPlaybackWindow = ChordPlaybackStrum & {
  startFrame: number;
  endFrame: number;
};

type BuildChordPlaybackWindowsOptions = {
  chordStart: number;
  chordLength: number;
  strums?: readonly ChordPlaybackStrum[] | null;
  maxRingFrames: number;
};

/**
 * Resolves the absolute ringing window for every strum. Mute strums are kept in
 * the result because they cut off the preceding strum, although callers should
 * not schedule notes for the mute window itself.
 */
export const buildChordPlaybackWindows = ({
  chordStart,
  chordLength,
  strums,
  maxRingFrames,
}: BuildChordPlaybackWindowsOptions): ChordPlaybackWindow[] => {
  const start = Math.max(0, Math.round(Number(chordStart) || 0));
  const length = Math.max(0, Math.round(Number(chordLength) || 0));
  const chordEnd = start + length;
  const maxRing = Math.max(1, Math.round(Number(maxRingFrames) || 1));
  if (length <= 0) return [];

  const normalized = (Array.isArray(strums) && strums.length
    ? strums
    : [{ time: 0, direction: "down" as const }]
  )
    .map((strum, index) => ({
      time: Math.max(0, Math.min(length, Math.round(Number(strum.time) || 0))),
      direction:
        strum.direction === "up" ? ("up" as const) : strum.direction === "mute" ? ("mute" as const) : ("down" as const),
      index,
    }))
    .sort((left, right) => left.time - right.time || left.index - right.index);

  return normalized.map((strum, index) => {
    const startFrame = start + strum.time;
    const nextStrumStart = normalized[index + 1]
      ? start + normalized[index + 1].time
      : chordEnd;
    return {
      time: strum.time,
      direction: strum.direction,
      startFrame,
      endFrame: Math.min(chordEnd, nextStrumStart, startFrame + maxRing),
    };
  });
};

