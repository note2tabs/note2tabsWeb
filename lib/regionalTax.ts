import { displayCurrencyForCountry } from "./localizedPricing";
import type { BillingInterval, StripePaidPlanConfig } from "./stripePremium";

// USD is also our worldwide fallback: currency alone must not decide tax display.
export const PRICE_TAX_COOKIE = "n2t_price_tax";
export function priceTaxBehavior(country: string | null | undefined): "exclusive" | "inclusive" {
  return country === "US" || country === "CA" ? "exclusive" : "inclusive";
}
export function regionalTaxEnabled() {
  return process.env.STRIPE_REGIONAL_TAX_ENABLED === "true";
}
export function regionalCheckoutPrice(config: StripePaidPlanConfig, interval: BillingInterval, country: string) {
  const behavior = priceTaxBehavior(country);
  const priceId = process.env[`STRIPE_TAX_${behavior.toUpperCase()}_${config.plan}_${interval.toUpperCase()}`]?.trim();
  if (!priceId) throw new Error("Regional tax price configuration is incomplete");
  return { priceId, behavior, currency: displayCurrencyForCountry(country).toLowerCase() };
}
