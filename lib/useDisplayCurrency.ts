import { createContext, useContext, useEffect, useState } from "react";
import {
  readDisplayCurrencyCookie,
  type DisplayCurrency,
} from "./localizedPricing";

export const DisplayCurrencyContext = createContext<DisplayCurrency>("USD");
export function useDisplayCurrency() {
  const initialCurrency = useContext(DisplayCurrencyContext);
  const [currency, setCurrency] = useState<DisplayCurrency>(initialCurrency);
  useEffect(() => setCurrency(/(?:^|;\s*)n2t_currency=/.test(document.cookie) ? readDisplayCurrencyCookie(document.cookie) : initialCurrency), [initialCurrency]);
  return currency;
}
