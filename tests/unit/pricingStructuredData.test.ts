import { describe, expect, it } from "vitest";
import { buildPricingProductStructuredData } from "../../lib/pricingStructuredData";

describe("pricing product structured data", () => {
  it("uses a Google-supported AggregateOffer when Pro is enabled", () => {
    const product = buildPricingProductStructuredData(true);

    expect(product.offers).toEqual({
      "@type": "AggregateOffer",
      offerCount: 5,
      lowPrice: "0",
      highPrice: "149.99",
      priceCurrency: "USD",
    });
  });

  it("keeps the aggregate accurate when Pro is hidden", () => {
    const product = buildPricingProductStructuredData(false);

    expect(product.offers["@type"]).toBe("AggregateOffer");
    expect(product.offers.offerCount).toBe(3);
    expect(product.offers.highPrice).toBe("59.99");
  });
});
