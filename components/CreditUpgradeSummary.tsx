import type { CreditUpgradeQuote } from "./CreditUpgradeReview";
import { useLocale } from "../lib/i18n/react";
export function upgradeMoney(quote: CreditUpgradeQuote, amount: number, locale: string) {
  const format = new Intl.NumberFormat(locale, { style: "currency", currency: quote.currency });
  return format.format(amount / 10 ** format.resolvedOptions().maximumFractionDigits!);
}
export const upgradeDiscountPercent = (quote: CreditUpgradeQuote) => Math.min(100, Math.ceil(quote.discount * 100 / quote.regularAmount));
export default function CreditUpgradeSummary({ quote }: { quote: CreditUpgradeQuote }) {
  const { t, locale } = useLocale();
  return <div className="credit-upgrade-summary">
    <p>{t("Then {amount}/month", { amount: upgradeMoney(quote, quote.regularAmount, locale) })}</p>
    <p>{t("{credits} credits exchanged · −{amount} (month 1)", { credits: quote.credits, amount: upgradeMoney(quote, quote.discount, locale) })}</p>
  </div>;
}
