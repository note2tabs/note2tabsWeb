export type PlaybackLookaheadEvent = {
  start: number;
};

/**
 * Keeps only a short rolling window of Web Audio sources scheduled. Scheduling
 * an entire large MIDI at once can leave thousands of live AudioNodes attached
 * to the context and starve editor rendering on the main thread.
 */
export const createPlaybackLookaheadScheduler = <T extends PlaybackLookaheadEvent>(
  events: readonly T[],
  scheduleEvent: (event: T) => void,
  lookaheadSeconds: number
) => {
  const ordered = [...events].sort((left, right) => left.start - right.start);
  const horizon = Math.max(0.25, Number(lookaheadSeconds) || 0);
  let nextIndex = 0;

  return (elapsedSeconds: number) => {
    const scheduleUntil = Math.max(0, Number(elapsedSeconds) || 0) + horizon;
    while (nextIndex < ordered.length && ordered[nextIndex].start <= scheduleUntil) {
      scheduleEvent(ordered[nextIndex]);
      nextIndex += 1;
    }
  };
};
