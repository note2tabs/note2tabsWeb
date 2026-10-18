import { readPricingMarketCookie, type PricingMarket } from "./pricingMarket";
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

export const PricingMarketContext = createContext<PricingMarket>("standard");
export function usePricingMarket() {
  const initialMarket = useContext(PricingMarketContext);
  const [market, setMarket] = useState<PricingMarket>(initialMarket);
  useEffect(() => setMarket(/(?:^|;\s*)n2t_pricing_market=/.test(document.cookie) ? readPricingMarketCookie(document.cookie) : initialMarket), [initialMarket]);
  return market;
}
