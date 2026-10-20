import {
  PLAN_CATALOG,
  type SubscriptionPlan,
  type PaidSubscriptionPlan,
} from "./subscriptionPlans";
export type LimitContext = {
  plan: SubscriptionPlan;
  fileBytes?: number;
  clipSeconds?: number;
  remaining?: number;
  required?: number;
  resetLabel?: string;
  attempt?: number;
  beforeCheckout?: () => Promise<void>;
};
/** Never sell a plan that is too small or equal to the customer's current plan. */
export function limitUpgradePlan(
  reason: string,
  context: LimitContext,
): PaidSubscriptionPlan | null {
  const { plan, fileBytes = 0, clipSeconds = 0, required = 0 } = context;
  if (plan === "PRO") return null;
  const candidates: PaidSubscriptionPlan[] =
    plan === "PREMIUM" ? ["PRO"] : ["PREMIUM", "PRO"];
  return (
    candidates.find((p) => {
      const definition = PLAN_CATALOG[p];
      if (fileBytes > definition.maxUploadBytes) return false;
      if (
        reason === "youtube_duration_limit" &&
        clipSeconds > definition.youtubePositionLimitSeconds
      )
        return false;
      if (
        required >
        (plan === "FREE"
          ? definition.monthlyCredits
          : Math.max(context.remaining || 0, definition.monthlyCredits))
      )
        return false;
      return true;
    }) || null
  );
}
