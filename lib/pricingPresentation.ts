import { PLAN_CATALOG, type PaidSubscriptionPlan } from "./subscriptionPlans";
import type { BillingInterval } from "./stripePremium";

export const PRICING_LAYOUT_VERSION = "checkout_focus_v1";
export const priceUsd = (amount: number) => `$${amount.toFixed(2)}`;
export function planPrice(plan: PaidSubscriptionPlan, billing: BillingInterval) {
  return billing === "yearly" ? PLAN_CATALOG[plan].yearlyPriceUsd : PLAN_CATALOG[plan].monthlyPriceUsd;
}
export function annualSavings(plan: PaidSubscriptionPlan) {
  return Math.round((PLAN_CATALOG[plan].monthlyPriceUsd * 12 - PLAN_CATALOG[plan].yearlyPriceUsd) * 100) / 100;
}
// Accept internal paths and legacy same-origin callback URLs only.
export function authReturnPath(next: unknown, callbackUrl: unknown, origin?: string) {
  const raw = Array.isArray(next) ? next[0] : next;
  const legacy = Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl;
  const value = typeof raw === "string" ? raw : legacy;
  if (typeof value !== "string" || /[\\\u0000-\u0020]/.test(value)) return "/home";
  try {
    const base = origin || "https://internal.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || (!value.startsWith("/") && !origin) || value.startsWith("//")) return "/home";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/home"; }
}
export function checkoutSelection(path: string) {
  const url = new URL(path, "https://internal.invalid");
  if (url.pathname !== "/pricing" || url.searchParams.get("checkout") !== "1") return null;
  const rawPlan = url.searchParams.get("plan");
  const rawBilling = url.searchParams.get("billing");
  if (rawPlan !== "premium" && rawPlan !== "pro") return null;
  if (rawBilling !== "monthly" && rawBilling !== "yearly") return null;
  return { plan: rawPlan === "pro" ? "PRO" as const : "PREMIUM" as const, billing: rawBilling as BillingInterval };
}
