export function normalizePositiveDurationSec(value: unknown): number | null {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.max(1, Math.round(duration));
}
