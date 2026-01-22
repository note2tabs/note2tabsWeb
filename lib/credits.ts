export type CreditsSummary = {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
  unlimited: boolean;
};

export const STARTING_CREDITS = 10;
export const FREE_MONTHLY_CREDITS = 10;
export const PREMIUM_MONTHLY_CREDITS = 50;
export const CREDIT_INTERVAL_SEC = 30;
export const DEFAULT_DURATION_SEC = 30;

export function getCreditWindow(now: Date = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, resetAt };
}

export function durationToCredits(durationSec?: number | null) {
  const safeDuration =
    typeof durationSec === "number" && durationSec > 0 ? durationSec : DEFAULT_DURATION_SEC;
  return Math.max(1, Math.ceil(safeDuration / CREDIT_INTERVAL_SEC));
}

export function calculateCreditsUsed(durations: Array<number | null | undefined>) {
  return durations.reduce<number>((total, duration) => total + durationToCredits(duration), 0);
}

const startOfMonthUtc = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));

const countMonthlyGrants = (createdAt: Date, now: Date) => {
  const start = startOfMonthUtc(createdAt);
  const end = startOfMonthUtc(now);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  return Math.max(0, months) + 1;
};

type BuildCreditsOptions = {
  durations: Array<number | null | undefined>;
  resetAt: Date;
  isPremium: boolean;
  userCreatedAt?: Date;
};

export function buildCreditsSummary({
  durations,
  resetAt,
  isPremium,
  userCreatedAt,
}: BuildCreditsOptions): CreditsSummary {
  const used = calculateCreditsUsed(durations);
  if (!isPremium) {
    const limit = FREE_MONTHLY_CREDITS;
    const remaining = Math.max(0, limit - used);
    return {
      used,
      limit,
      remaining,
      resetAt: resetAt.toISOString(),
      unlimited: false,
    };
  }
  const createdAt = userCreatedAt || new Date();
  const grants = countMonthlyGrants(createdAt, new Date());
  const limit = STARTING_CREDITS + grants * PREMIUM_MONTHLY_CREDITS;
  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    resetAt: resetAt.toISOString(),
    unlimited: false,
  };
}
