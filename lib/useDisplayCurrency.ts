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

export function usePriceTaxBehavior() {
  const [behavior, setBehavior] = useState<"inclusive" | "exclusive" | null>(null);
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)n2t_price_tax=(inclusive|exclusive)(?:;|$)/);
    setBehavior(match ? match[1] as "inclusive" | "exclusive" : null);
  }, []);
  return behavior;
}
