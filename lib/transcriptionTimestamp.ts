/** Clip start/end inputs use "microwave" entry: digits fill in from the right, so
 * 14 -> 0:14, 310 -> 3:10, 1000 -> 10:00. The text is always derived from the digits
 * alone, so typing, backspacing and pasting "1:30" all behave the same way. */

export const formatTimestamp = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/** Display text for whatever was typed. Seconds above 59 are kept as typed (0:75) so no digit is lost
 * mid-entry; they are carried into minutes by `parseTimestampInput` and on blur. */
export const maskTimestampInput = (value: string) => {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 5);
  if (!digits) return "";
  const number = Number(digits);
  return `${Math.floor(number / 100)}:${String(number % 100).padStart(2, "0")}`;
};

/** Seconds for a masked value ("3:10"), carrying seconds over 59 ("0:75" -> 75 s). Null when empty. */
export const parseTimestampInput = (value: string): number | null => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const number = Number(digits);
  return Math.floor(number / 100) * 60 + (number % 100);
};
