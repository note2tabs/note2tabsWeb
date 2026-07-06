export const MAX_FREE_FILE_SNIPPET_SEC = 60;
export const DEFAULT_FILE_SNIPPET_SEC = 60;

export type FileClipRange = {
  start: number;
  end: number;
};

const toDurationLimit = (durationSec: number | null) =>
  durationSec !== null && Number.isFinite(durationSec) && durationSec > 0 ? Math.ceil(durationSec) : null;

export function getFileClipMaxLengthSec(isPremiumUser: boolean) {
  return isPremiumUser ? Number.MAX_SAFE_INTEGER : MAX_FREE_FILE_SNIPPET_SEC;
}

export function getDefaultFileClipRange(durationSec: number | null, isPremiumUser: boolean): FileClipRange {
  const durationLimit = toDurationLimit(durationSec);
  const defaultEnd =
    durationLimit !== null
      ? Math.min(durationLimit, isPremiumUser ? durationLimit : MAX_FREE_FILE_SNIPPET_SEC)
      : DEFAULT_FILE_SNIPPET_SEC;
  return { start: 0, end: defaultEnd };
}

export function clampFileClipStart(
  startTime: number,
  endTime: number | null,
  durationSec: number | null,
  isPremiumUser: boolean
): FileClipRange {
  const durationLimit = toDurationLimit(durationSec);
  const maxStart = durationLimit !== null ? Math.max(0, durationLimit - 1) : Number.MAX_SAFE_INTEGER;
  const start = Math.min(maxStart, Math.max(0, startTime));
  const maxClip = getFileClipMaxLengthSec(isPremiumUser);
  const fallbackLength = isPremiumUser ? DEFAULT_FILE_SNIPPET_SEC : Math.min(maxClip, DEFAULT_FILE_SNIPPET_SEC);
  const unclampedEnd =
    endTime === null || endTime <= start ? start + fallbackLength : Math.min(endTime, start + maxClip);
  const end = durationLimit !== null ? Math.min(durationLimit, unclampedEnd) : unclampedEnd;
  return { start, end: Math.max(start + 1, end) };
}

export function clampFileClipEnd(
  startTime: number | null,
  endTime: number,
  durationSec: number | null,
  isPremiumUser: boolean
) {
  const start = startTime !== null ? Math.max(0, startTime) : 0;
  const minEnd = start + 1;
  const maxClip = getFileClipMaxLengthSec(isPremiumUser);
  const maxEndByClip = start + maxClip;
  const durationLimit = toDurationLimit(durationSec);
  const maxEndByDuration = durationLimit !== null ? durationLimit : Number.MAX_SAFE_INTEGER;
  return Math.min(maxEndByClip, maxEndByDuration, Math.max(minEnd, endTime));
}

export function isFileClipRangeValid(
  startTime: number | null,
  endTime: number | null,
  durationSec: number | null,
  isPremiumUser: boolean
) {
  if (startTime === null || endTime === null) return false;
  if (startTime < 0 || endTime <= startTime) return false;
  const durationLimit = toDurationLimit(durationSec);
  if (durationLimit !== null && endTime > durationLimit) return false;
  return isPremiumUser || endTime - startTime <= MAX_FREE_FILE_SNIPPET_SEC;
}
