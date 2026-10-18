import type { PricingMarket } from "./pricingMarket";
import { localizedPriceAmount, type DisplayCurrency } from "./localizedPricing";
export function buildPricingProductStructuredData(showPro: boolean, currency: DisplayCurrency = "USD", market: PricingMarket = "standard") {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Note2Tabs",
    offers: {
      "@type": "AggregateOffer",
      offerCount: showPro ? 5 : 3,
      lowPrice: "0",
      highPrice: localizedPriceAmount(showPro ? "PRO" : "PREMIUM", "yearly", currency, market).toFixed(2),
      priceCurrency: currency,
    },
  } as const;
}
