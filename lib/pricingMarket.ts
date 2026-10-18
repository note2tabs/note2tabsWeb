import type { BillingInterval, StripePaidPlanConfig } from "./stripePremium";
import type { PaidSubscriptionPlan } from "./subscriptionPlans";

export type PricingMarket = "standard" | "latam";
export const PRICING_MARKET_COOKIE = "n2t_pricing_market";
// Mexico retains its separately localized MXN offer. Brazil retains BRL.
export const LATAM_USD_COUNTRIES = ["AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE"] as const;
export const LATAM_PRICES = {
  PREMIUM: { monthly: 2.99, yearly: 29.99 },
  PRO: { monthly: 7.49, yearly: 74.99 },
} as const;
export function countryPricingMarket(country: unknown): PricingMarket {
  return typeof country === "string" && (LATAM_USD_COUNTRIES as readonly string[]).includes(country.trim().toUpperCase()) ? "latam" : "standard";
}
export function marketPriceId(plan: PaidSubscriptionPlan, interval: BillingInterval) {
  return process.env[`STRIPE_MARKET_LATAM_${plan}_${interval.toUpperCase()}`]?.trim();
}
export function marketPriceIds(plan: PaidSubscriptionPlan) {
  return (["monthly", "yearly"] as const).map(interval => marketPriceId(plan, interval)).filter((id): id is string => Boolean(id));
}
export function marketPricingEnabled() {
  return process.env.LATAM_PRICING_ENABLED === "true" && (["PREMIUM", "PRO"] as const).every(plan => marketPriceIds(plan).length === 2);
}
export function requestPricingMarket(country: unknown): PricingMarket {
  return marketPricingEnabled() ? countryPricingMarket(country) : "standard";
}
export function marketCheckoutConfig(config: StripePaidPlanConfig, interval: BillingInterval, market: PricingMarket) {
  if (market === "standard") return config;
  const priceId = marketPriceId(config.plan, interval);
  if (!priceId) throw new Error("Latin American price is not configured");
  return { ...config, priceId };
}
export function readPricingMarketCookie(cookie: string): PricingMarket {
  return /(?:^|;\s*)n2t_pricing_market=latam(?:;|$)/.test(cookie) ? "latam" : "standard";
}
