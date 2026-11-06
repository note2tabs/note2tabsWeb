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

/** A live score can grow while its AudioContext and clock keep running. */
export function createLivePlaybackLookaheadScheduler<T extends PlaybackLookaheadEvent>(
  initial: readonly T[], schedule: (event: T) => void, lookahead: number,
  identity: (event: T) => string, end: (event: T) => number,
) {
  let ordered = [...initial].sort((a, b) => a.start - b.start), next = 0;
  const scheduled = new Set<string>();
  const pump = (elapsed: number) => {
    while (next < ordered.length && ordered[next].start <= elapsed + lookahead) {
      const event = ordered[next++], key = identity(event);
      if (scheduled.has(key)) continue;
      scheduled.add(key);
      if (end(event) > elapsed) schedule(event);
    }
  };
  pump.replace = (events: readonly T[]) => { ordered = [...events].sort((a, b) => a.start - b.start); next = 0; };
  return pump;
}
