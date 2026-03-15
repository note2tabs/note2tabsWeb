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
export const DEV_CREDITS_LIMIT = 9999;

const toSafeDate = (value?: Date | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfUtcMonth = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));

const addUtcMonths = (value: Date, monthsToAdd: number) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + monthsToAdd, 1));

const daysInUtcMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const addMonthsClampedUtc = (value: Date, monthsToAdd: number) => {
  const base = new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth() + monthsToAdd,
      1,
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds()
    )
  );
  const clampedDay = Math.min(
    value.getUTCDate(),
    daysInUtcMonth(base.getUTCFullYear(), base.getUTCMonth())
  );
  base.setUTCDate(clampedDay);
  return base;
};

const countElapsedMonthlyCycles = (anchor: Date, now: Date) => {
  if (now.getTime() < anchor.getTime()) return 0;
  let months =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());
  while (addMonthsClampedUtc(anchor, months).getTime() > now.getTime()) {
    months -= 1;
  }
  while (addMonthsClampedUtc(anchor, months + 1).getTime() <= now.getTime()) {
    months += 1;
  }
  return Math.max(0, months);
};

type CreditWindowOptions = {
  now?: Date;
  userCreatedAt?: Date | null;
};

export function getCreditWindow({ now = new Date(), userCreatedAt }: CreditWindowOptions = {}) {
  const safeNow = toSafeDate(now) || new Date();
  const safeCreatedAt = toSafeDate(userCreatedAt);
  if (!safeCreatedAt) {
    const start = startOfUtcMonth(safeNow);
    const resetAt = addUtcMonths(start, 1);
    return { start, resetAt };
  }
  const elapsed = countElapsedMonthlyCycles(safeCreatedAt, safeNow);
  const start = addMonthsClampedUtc(safeCreatedAt, elapsed);
  const resetAt = addMonthsClampedUtc(safeCreatedAt, elapsed + 1);
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

export function buildDevCreditsSummary(): CreditsSummary {
  return {
    used: 0,
    limit: DEV_CREDITS_LIMIT,
    remaining: DEV_CREDITS_LIMIT,
    resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    unlimited: true,
  };
}

const countMonthlyGrants = (createdAt: Date, now: Date) => {
  const safeNow = toSafeDate(now) || new Date();
  const safeCreatedAt = toSafeDate(createdAt) || safeNow;
  return countElapsedMonthlyCycles(safeCreatedAt, safeNow) + 1;
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
