import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { readPriceTaxNoteCookie } from "../lib/priceTaxNote";
import { useLocale } from "../lib/i18n/react";

/** Current checkout uses the advertised total without adding tax. If tax-exclusive
 * checkout is enabled later, update this promise with the billing change. */
export default function PriceTaxNote() {
  const { t } = useLocale();
  const router = useRouter();
  // Hide until the edge-set audience cookie is known; never infer from USD.
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(readPriceTaxNoteCookie(document.cookie)); }, [router.asPath]);
  if (!visible) return null;
  return <p className="pricing-plan__tax-note">{t("No additional tax at checkout")}</p>;
}
