export const PREMIUM_PROMPT_SIGNAL_EVENT = "note2tabs:premium-prompt-signal";

const CREDITS_SNAPSHOT_KEY = "note2tabs:premium-prompt-credits";

export type PremiumPromptSignal =
  | { type: "credits"; remaining: number; recordedAt: number }
  | { type: "transcription_completed"; recordedAt: number };

function dispatchSignal(signal: PremiumPromptSignal) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PremiumPromptSignal>(PREMIUM_PROMPT_SIGNAL_EVENT, {
      detail: signal,
    })
  );
}

export function publishCreditsForPremiumPrompt(remaining: number) {
  if (typeof window === "undefined" || !Number.isFinite(remaining)) return;
  const signal: PremiumPromptSignal = {
    type: "credits",
    remaining: Math.max(0, Math.floor(remaining)),
    recordedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(CREDITS_SNAPSHOT_KEY, JSON.stringify(signal));
  } catch {
    // The live signal still works when storage is unavailable.
  }
  dispatchSignal(signal);
}

export function publishTranscriptionCompletedForPremiumPrompt() {
  dispatchSignal({ type: "transcription_completed", recordedAt: Date.now() });
}

export function readCreditsForPremiumPrompt() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CREDITS_SNAPSHOT_KEY) || "null"
    ) as PremiumPromptSignal | null;
    if (
      parsed?.type !== "credits" ||
      !Number.isFinite(parsed.remaining) ||
      Date.now() - parsed.recordedAt > 24 * 60 * 60 * 1000
    ) {
      return null;
    }
    return parsed.remaining;
  } catch {
    return null;
  }
}
