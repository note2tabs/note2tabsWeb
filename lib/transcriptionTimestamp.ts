/** Clip start/end inputs. Typing must never be rewritten under the user's fingers:
 * the text stays exactly as typed, is parsed leniently, and is only normalised on blur. */

export const formatTimestamp = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

/** Keep only what can be part of a timestamp; never insert or move characters. */
export const sanitizeTimestampInput = (value: string) => value.replace(/[^\d:]/g, "").slice(0, 8);

/**
 * Accepts `90` (seconds), `1:30`, `1:3`, `01:30`, `1:02:03`, and the unit forms `1m30s`, `90s`, `2m`.
 * Returns null while the text is not (yet) a complete time, e.g. `1:` or an empty field.
 */
export const parseTimestampInput = (value: string): number | null => {
  const text = value.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;
  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(text);
  if (units && /[hm]/.test(text)) {
    const [, h, m, s] = units;
    return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  }
  if (/^\d+s$/.test(text)) return Number(text.slice(0, -1));
  if (/^\d+$/.test(text)) return Number(text);
  const parts = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
  if (!parts) return null;
  const [, first, second, third] = parts;
  const seconds = third !== undefined ? Number(third) : Number(second);
  const minutes = third !== undefined ? Number(second) : Number(first);
  const hours = third !== undefined ? Number(first) : 0;
  if (seconds > 59 || minutes > 59 && third !== undefined) return null;
  return hours * 3600 + minutes * 60 + seconds;
};
