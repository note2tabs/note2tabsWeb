export const SUBSCRIPTION_PLANS = ["FREE", "PREMIUM", "PRO"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];
export type PaidSubscriptionPlan = Exclude<SubscriptionPlan, "FREE">;

export type SubscriptionPlanDefinition = {
  id: SubscriptionPlan;
  name: string;
  analyticsId: "free" | "premium_monthly" | "pro_monthly";
  monthlyPriceUsd: number;
  monthlyCredits: number;
  rolloverCap: number;
  trialDays: number;
  maxUploadBytes: number;
  youtubePositionLimitSeconds: number;
  prioritySupport: boolean;
  earlyAccessEligible: boolean;
};

const MB = 1024 * 1024;

export const PLAN_CATALOG: Record<SubscriptionPlan, SubscriptionPlanDefinition> = {
  FREE: {
    id: "FREE", name: "Free", analyticsId: "free", monthlyPriceUsd: 0,
    monthlyCredits: 10, rolloverCap: 10, trialDays: 0,
    maxUploadBytes: 50 * MB, youtubePositionLimitSeconds: 10 * 60,
    prioritySupport: false, earlyAccessEligible: false,
  },
  PREMIUM: {
    id: "PREMIUM", name: "Premium", analyticsId: "premium_monthly", monthlyPriceUsd: 5.99,
    monthlyCredits: 100, rolloverCap: 200, trialDays: 7,
    maxUploadBytes: 200 * MB, youtubePositionLimitSeconds: 10 * 60,
    prioritySupport: false, earlyAccessEligible: false,
  },
  PRO: {
    id: "PRO", name: "Pro", analyticsId: "pro_monthly", monthlyPriceUsd: 14.99,
    monthlyCredits: 250, rolloverCap: 500, trialDays: 0,
    maxUploadBytes: 500 * MB, youtubePositionLimitSeconds: 20 * 60,
    prioritySupport: true, earlyAccessEligible: true,
  },
};

export const normalizeSubscriptionPlan = (value: unknown): SubscriptionPlan =>
  typeof value === "string" && SUBSCRIPTION_PLANS.includes(value.toUpperCase() as SubscriptionPlan)
    ? value.toUpperCase() as SubscriptionPlan
    : "FREE";

export const isPaidPlan = (plan: unknown): plan is PaidSubscriptionPlan =>
  normalizeSubscriptionPlan(plan) !== "FREE";

export const effectiveSubscriptionPlan = (role: unknown, plan: unknown): SubscriptionPlan => {
  const normalized = normalizeSubscriptionPlan(plan);
  if (normalized !== "FREE") return normalized;
  return role === "PREMIUM" ? "PREMIUM" : "FREE";
};

export const proPlanConfigured = () => Boolean(
  process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() &&
  process.env.STRIPE_PRODUCT_PRO?.trim()
);

export const proPlanCheckoutEnabled = () =>
  proPlanConfigured() && process.env.PRO_PLAN_ENABLED === "true";

export const proPlanPresentationEnabled = () =>
  process.env.NEXT_PUBLIC_PRO_PLAN_ENABLED === "true" ||
  process.env.NEXT_PUBLIC_PRO_PLAN_PREVIEW === "true";
