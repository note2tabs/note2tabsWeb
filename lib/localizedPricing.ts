import type { BillingInterval } from "./stripePremium";
import type { PaidSubscriptionPlan } from "./subscriptionPlans";

export const DISPLAY_CURRENCIES = [
  "USD", "GBP", "EUR", "SEK", "CAD", "AUD", "NZD", "CHF", "NOK", "DKK", "JPY", "SGD",
  "BRL", "INR", "IDR", "CNY", "MXN", "PHP", "MYR", "THB", "ZAR", "PLN", "KRW",
] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export const DISPLAY_CURRENCY_COOKIE = "n2t_currency";

const EURO_COUNTRIES = new Set([
  "AD", "AT", "AX", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR",
  "HR", "IE", "IT", "LT", "LU", "LV", "MC", "ME", "MT", "NL", "PT", "SI",
  "SK", "SM", "VA",
]);

const COUNTRY_CURRENCIES: Partial<Record<string, DisplayCurrency>> = {
  AU: "AUD", CA: "CAD", CH: "CHF", DK: "DKK", FO: "DKK", GL: "DKK",
  GB: "GBP", JP: "JPY", LI: "CHF", NO: "NOK", NZ: "NZD", SE: "SEK",
  SG: "SGD", SJ: "NOK", BR: "BRL", IN: "INR", ID: "IDR",
  CN: "CNY", MX: "MXN", PH: "PHP", MY: "MYR", TH: "THB", ZA: "ZAR", PL: "PLN", KR: "KRW",
};

export function displayCurrencyForCountry(country?: string | null): DisplayCurrency {
  const normalized = country?.trim().toUpperCase();
  if (normalized && COUNTRY_CURRENCIES[normalized]) return COUNTRY_CURRENCIES[normalized];
  if (normalized && EURO_COUNTRIES.has(normalized)) return "EUR";
  return "USD";
}

const PRICES: Record<PaidSubscriptionPlan, Record<BillingInterval, Record<DisplayCurrency, number>>> = {
  PREMIUM: {
    monthly: {
      USD: 5.99, GBP: 4.99, EUR: 5.49, SEK: 59,
      CAD: 8.99, AUD: 8.99, NZD: 10.99, CHF: 4.99,
      NOK: 59, DKK: 39, JPY: 999, SGD: 8.49,
      BRL: 21.90, INR: 299, IDR: 64900,
      CNY: 30, MXN: 89, PHP: 199, MYR: 19.90, THB: 139, ZAR: 69.99, PLN: 19.99, KRW: 7900,
    },
    yearly: {
      USD: 59.99, GBP: 49.99, EUR: 54.99, SEK: 599,
      CAD: 85.99, AUD: 89.99, NZD: 109.99, CHF: 49.99,
      NOK: 599, DKK: 399, JPY: 9999, SGD: 84.99,
      BRL: 219, INR: 2999, IDR: 649000,
      CNY: 300, MXN: 899, PHP: 1999, MYR: 199, THB: 1399, ZAR: 699.99, PLN: 199.99, KRW: 79000,
    },
  },
  PRO: {
    monthly: {
      USD: 14.99, GBP: 11.99, EUR: 13.99, SEK: 149,
      CAD: 21.99, AUD: 21.99, NZD: 26.99, CHF: 12.49,
      NOK: 149, DKK: 99, JPY: 2499, SGD: 20.99,
      BRL: 54.90, INR: 749, IDR: 162900,
      CNY: 75, MXN: 219, PHP: 499, MYR: 49.90, THB: 349, ZAR: 174.99, PLN: 49.99, KRW: 19900,
    },
    yearly: {
      USD: 149.99, GBP: 119.99, EUR: 139.99, SEK: 1499,
      CAD: 214.99, AUD: 219.99, NZD: 269.99, CHF: 124.99,
      NOK: 1499, DKK: 999, JPY: 24999, SGD: 209.99,
      BRL: 549, INR: 7499, IDR: 1629000,
      CNY: 750, MXN: 2199, PHP: 4999, MYR: 499, THB: 3499, ZAR: 1749.99, PLN: 499.99, KRW: 199000,
    },
  },
};

export function localizedPriceAmount(
  plan: PaidSubscriptionPlan,
  interval: BillingInterval,
  currency: DisplayCurrency
) {
  return PRICES[plan][interval][currency];
}

const SYMBOLS: Record<DisplayCurrency, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  SEK: "",
  CAD: "CA$",
  AUD: "A$",
  NZD: "NZ$",
  CHF: "",
  NOK: "",
  DKK: "",
  JPY: "¥",
  SGD: "S$",
  BRL: "R$",
  INR: "₹",
  IDR: "Rp",
  CNY: "¥",
  MXN: "MX$",
  PHP: "₱",
  MYR: "RM",
  THB: "฿",
  ZAR: "R",
  PLN: "",
  KRW: "₩",
};

export function formatLocalizedAmount(amount: number, currency: DisplayCurrency, locale = "en") {
  if (locale === "pt-BR") return new Intl.NumberFormat("pt-BR", {style: "currency", currency}).format(amount);
  const formatted = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  if (currency === "SEK" || currency === "NOK" || currency === "DKK") return `${formatted} kr`;
  if (currency === "CHF") return `CHF ${formatted}`;
  if (currency === "IDR") return `Rp${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`;
  if (currency === "KRW") return `₩${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`;
  if (currency === "PLN") return `${formatted} zł`;
  return `${SYMBOLS[currency]}${formatted}`;
}

export function formatLocalizedPrice(
  plan: PaidSubscriptionPlan,
  interval: BillingInterval,
  currency: DisplayCurrency,
  locale = "en"
) {
  const amount = localizedPriceAmount(plan, interval, currency);
  return formatLocalizedAmount(amount, currency, locale);
}

export function localizedAnnualSaving(plan: PaidSubscriptionPlan, currency: DisplayCurrency, locale = "en") {
  const monthly = PRICES[plan].monthly[currency];
  const yearly = PRICES[plan].yearly[currency];
  const saving = Math.round(monthly * 12 - yearly);
  return formatLocalizedAmount(saving, currency, locale);
}

export function readDisplayCurrencyCookie(cookieHeader: string): DisplayCurrency {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${DISPLAY_CURRENCY_COOKIE}=([^;]+)`));
  const value = match?.[1]?.toUpperCase();
  return DISPLAY_CURRENCIES.includes(value as DisplayCurrency) ? value as DisplayCurrency : "USD";
}
