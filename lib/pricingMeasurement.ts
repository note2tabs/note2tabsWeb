import { effectiveSubscriptionPlan } from "./subscriptionPlans";
import { parseUserAgent } from "./analyticsV2/ua";

export const PRICING_LAYOUT_VERSION = "pricing_cards_v1";
export function pricingMeasurementContext(input: {
  role: string;
  plan: string;
  signedIn: boolean;
  billingInterval: string;
  displayCurrency: string;
  userAgent?: string;
}) {
  const plan = effectiveSubscriptionPlan(input.role, input.plan);
  const staff = ["ADMIN", "MODERATOR", "MOD"].includes(input.role);
  return {
    pricing_layout_version: PRICING_LAYOUT_VERSION,
    pricing_audience: staff ? "staff" : plan === "FREE" ? "acquisition" : "existing_subscriber",
    signedIn: input.signedIn,
    current_plan: plan.toLowerCase(),
    billing_interval: input.billingInterval,
    display_currency: input.displayCurrency.toLowerCase(),
    device_type: parseUserAgent(input.userAgent).deviceType,
  };
}
