export type CreditsSummary = {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
  unlimited: boolean;
};

export const FREE_MONTHLY_CREDITS = 120;
export const DEFAULT_DURATION_SEC = 60;

export function getCreditWindow(now: Date = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, resetAt };
}

export function durationToCredits(durationSec?: number | null) {
  const safeDuration =
    typeof durationSec === "number" && durationSec > 0 ? durationSec : DEFAULT_DURATION_SEC;
  return Math.max(1, Math.ceil(safeDuration / 60));
}

export function calculateCreditsUsed(durations: Array<number | null | undefined>) {
  return durations.reduce<number>((total, duration) => total + durationToCredits(duration), 0);
}

export function buildCreditsSummary(
  durations: Array<number | null | undefined>,
  resetAt: Date,
  unlimited: boolean
): CreditsSummary {
  const used = calculateCreditsUsed(durations);
  const limit = FREE_MONTHLY_CREDITS;
  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    resetAt: resetAt.toISOString(),
    unlimited,
  };
}
