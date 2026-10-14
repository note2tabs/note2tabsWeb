import { usePriceTaxBehavior } from "../lib/useDisplayCurrency";
import { useLocale } from "../lib/i18n/react";
import { translate } from "../lib/i18n/translate";

export default function PriceTaxNote() {
  const behavior = usePriceTaxBehavior();
  const { locale } = useLocale();
  return <p className="pricing-plan__reassurance">{translate(behavior === "exclusive"
    ? "Applicable sales tax is added at checkout."
    : behavior === "inclusive" ? "Price includes applicable taxes."
    : "Tax treatment is confirmed at checkout.", locale)}</p>;
}
