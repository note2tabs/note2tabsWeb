import { useLocale } from "../lib/i18n/react";

/** Current checkout uses the advertised total without adding tax. If tax-exclusive
 * checkout is enabled later, update this promise with the billing change. */
export default function PriceTaxNote() {
  const { t } = useLocale();
  return <p className="pricing-plan__tax-note">{t("No additional tax at checkout")}</p>;
}
