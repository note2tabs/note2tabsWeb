type PlaybackScrollTargetInput = {
  playheadLeft: number;
  maxScroll: number;
  visibleStartInContainer: number;
  visibleWidth: number;
};

export function getPlaybackScrollTarget({
  playheadLeft,
  maxScroll,
  visibleStartInContainer,
  visibleWidth,
}: PlaybackScrollTargetInput) {
  const followOffset = Math.max(0, visibleStartInContainer) + Math.max(1, visibleWidth) * 0.45;
  return Math.max(0, Math.min(Math.max(0, maxScroll), playheadLeft - followOffset));
}
