export const MIN_PLAYBACK_SCHEDULE_LEAD_SECONDS = 0.1;

const normalizedLatency = (value: number | undefined) =>
  Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;

/**
 * Leave enough time for playback state and the audio-clock playhead loop to
 * initialize before the first scheduled sound. Browser-reported output
 * latency can be only a few milliseconds and is not an adequate scheduling
 * lead on its own.
 */
export const getPlaybackScheduleLeadSeconds = (
  baseLatency: number | undefined,
  outputLatency: number | undefined
) =>
  Math.max(
    MIN_PLAYBACK_SCHEDULE_LEAD_SECONDS,
    normalizedLatency(baseLatency) + normalizedLatency(outputLatency)
  );
