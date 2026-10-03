import type { BillingInterval } from "./stripePremium";
import type { PaidSubscriptionPlan } from "./subscriptionPlans";

export type DisplayCurrency = "USD" | "GBP" | "EUR" | "SEK";

export const DISPLAY_CURRENCY_COOKIE = "n2t_currency";

const EURO_COUNTRIES = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

export function displayCurrencyForCountry(country?: string | null): DisplayCurrency {
  const normalized = country?.trim().toUpperCase();
  if (normalized === "GB") return "GBP";
  if (normalized === "SE") return "SEK";
  if (normalized && EURO_COUNTRIES.has(normalized)) return "EUR";
  return "USD";
}

const PRICES: Record<PaidSubscriptionPlan, Record<BillingInterval, Record<DisplayCurrency, number>>> = {
  PREMIUM: {
    monthly: { USD: 5.99, GBP: 4.99, EUR: 5.49, SEK: 59 },
    yearly: { USD: 59.99, GBP: 49.99, EUR: 54.99, SEK: 599 },
  },
  PRO: {
    monthly: { USD: 14.99, GBP: 11.99, EUR: 13.99, SEK: 149 },
    yearly: { USD: 149.99, GBP: 119.99, EUR: 139.99, SEK: 1499 },
  },
};

const SYMBOLS: Record<DisplayCurrency, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  SEK: "",
};

export function formatLocalizedAmount(amount: number, currency: DisplayCurrency) {
  const formatted = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return currency === "SEK" ? `${formatted} kr` : `${SYMBOLS[currency]}${formatted}`;
}

export function formatLocalizedPrice(
  plan: PaidSubscriptionPlan,
  interval: BillingInterval,
  currency: DisplayCurrency
) {
  const amount = PRICES[plan][interval][currency];
  return formatLocalizedAmount(amount, currency);
}

export function localizedAnnualSaving(plan: PaidSubscriptionPlan, currency: DisplayCurrency) {
  const monthly = PRICES[plan].monthly[currency];
  const yearly = PRICES[plan].yearly[currency];
  const saving = Math.round(monthly * 12 - yearly);
  return formatLocalizedAmount(saving, currency);
}

export function readDisplayCurrencyCookie(cookieHeader: string): DisplayCurrency {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${DISPLAY_CURRENCY_COOKIE}=([^;]+)`));
  const value = match?.[1]?.toUpperCase();
  return value === "GBP" || value === "EUR" || value === "SEK" ? value : "USD";
}
