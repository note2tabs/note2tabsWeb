import { stripeCurrencyScale } from "../lib/creditUpgradePricing";
import type { CreditUpgradeQuote } from "./CreditUpgradeReview";
import { useLocale } from "../lib/i18n/react";
export function upgradeMoney(quote: CreditUpgradeQuote, amount: number, locale: string) {
  const digits = stripeCurrencyScale(quote.currency) === 1 ? 0 : 2;
  const format = new Intl.NumberFormat(locale, { style: "currency", currency: quote.currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
  return format.format(amount / stripeCurrencyScale(quote.currency));
}
export const upgradeDiscountPercent = (quote: CreditUpgradeQuote) => Math.min(100, Math.ceil(quote.discount * 100 / quote.regularAmount));
export default function CreditUpgradeSummary({ quote }: { quote: CreditUpgradeQuote }) {
  const { t, locale } = useLocale();
  return <div className="credit-upgrade-summary">
    <p>{t("Then {amount}/month", { amount: upgradeMoney(quote, quote.regularAmount, locale) })}</p>
    <p>{t("{credits} credits exchanged · {amount} off your first month", { credits: quote.credits, amount: upgradeMoney(quote, quote.discount, locale) })}</p>
  </div>;
}
