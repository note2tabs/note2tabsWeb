export function buildPricingProductStructuredData(showPro: boolean) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Note2Tabs",
    offers: {
      "@type": "AggregateOffer",
      offerCount: showPro ? 5 : 3,
      lowPrice: "0",
      highPrice: showPro ? "149.99" : "59.99",
      priceCurrency: "USD",
    },
  } as const;
}
