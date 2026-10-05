export const PREMIUM_PROMPT_SIGNAL_EVENT = "note2tabs:premium-prompt-signal";

const CREDITS_SNAPSHOT_KEY = "note2tabs:premium-prompt-credits";
const COMPLETION_SNAPSHOT_KEY = "note2tabs:premium-prompt-completion";
const PRICING_VISITED_KEY = "note2tabs:premium-pricing-visited";

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
  const recordedAt = Date.now();
  try {
    const previous = JSON.parse(
      window.localStorage.getItem(COMPLETION_SNAPSHOT_KEY) || "null"
    ) as { count?: number } | null;
    window.localStorage.setItem(
      COMPLETION_SNAPSHOT_KEY,
      JSON.stringify({ recordedAt, count: Math.max(1, Number(previous?.count || 0) + 1) })
    );
  } catch {
    // The live signal still works when storage is unavailable.
  }
  dispatchSignal({ type: "transcription_completed", recordedAt });
}

export function readPremiumCompletionSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(COMPLETION_SNAPSHOT_KEY) || "null"
    ) as { recordedAt?: number; count?: number } | null;
    if (!parsed || !Number.isFinite(parsed.recordedAt) || !Number.isFinite(parsed.count)) {
      return null;
    }
    return { recordedAt: Number(parsed.recordedAt), count: Math.max(1, Number(parsed.count)) };
  } catch {
    return null;
  }
}

export function markPremiumPricingVisited() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRICING_VISITED_KEY, String(Date.now()));
  } catch {
    // Attribution remains available even when storage is unavailable.
  }
}

export function hasVisitedPremiumPricing() {
  if (typeof window === "undefined") return false;
  try {
    return Number(window.localStorage.getItem(PRICING_VISITED_KEY) || 0) > 0;
  } catch {
    return false;
  }
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
