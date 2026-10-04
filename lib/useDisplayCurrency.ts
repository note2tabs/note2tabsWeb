import { useEffect, useState } from "react";
import {
  readDisplayCurrencyCookie,
  type DisplayCurrency,
} from "./localizedPricing";

export function useDisplayCurrency() {
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  useEffect(() => setCurrency(readDisplayCurrencyCookie(document.cookie)), []);
  return currency;
}
