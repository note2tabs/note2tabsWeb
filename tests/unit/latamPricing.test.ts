import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import proxy from "../../proxy";
import { LATAM_USD_COUNTRIES, countryPricingMarket, requestPricingMarket, readPricingMarketCookie } from "../../lib/pricingMarket";
import { displayCurrencyForCountry, localizedPriceAmount, localizedAnnualSaving } from "../../lib/localizedPricing";
import { verifyStripePrice } from "../../lib/stripePriceParity";
import { getStripePaidPlanConfigs } from "../../lib/stripePremium";
import { buildPricingProductStructuredData } from "../../lib/pricingStructuredData";

function enableLatam() {
 vi.stubEnv("LATAM_PRICING_ENABLED", "true");
 for (const plan of ["PREMIUM", "PRO"]) for (const interval of ["MONTHLY", "YEARLY"]) vi.stubEnv(`STRIPE_MARKET_LATAM_${plan}_${interval}`, `price_latam_${plan}_${interval}`);
}
afterEach(() => vi.unstubAllEnvs());
describe("LatAm USD offers", () => {
 it.each(LATAM_USD_COUNTRIES)("selects regional USD for %s in edge cookies and checkout geography", async country => {
  enableLatam();
  const r = await proxy(new NextRequest("https://www.note2tabs.com/pricing", {headers:{"x-vercel-ip-country":country}}));
  expect(r.cookies.get("n2t_pricing_market")?.value).toBe("latam");
  expect(r.cookies.get("n2t_currency")?.value).toBe("USD");
  expect(requestPricingMarket(country)).toBe("latam");
 });
 it.each(["US", "CA", "ES", "BR", "MX", "BZ", "GY", "SR", "", "unknown"])("preserves existing prices for %s", country => {
  enableLatam(); expect(requestPricingMarket(country)).toBe("standard");
 });
 it("recognizes regional price IDs for fulfillment even when new regional checkout is paused", () => {
  enableLatam();vi.stubEnv("STRIPE_PRICE_PREMIUM_MONTHLY","base_premium");vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY","base_pro");vi.stubEnv("STRIPE_PRODUCT_PRO","product_pro");vi.stubEnv("LATAM_PRICING_ENABLED","false");
  const configs=getStripePaidPlanConfigs();
  expect(configs.PREMIUM?.priceIds).toContain("price_latam_PREMIUM_MONTHLY");
  expect(configs.PRO?.priceIds).toContain("price_latam_PRO_YEARLY");
 });
 it("does not expose a discount unless checkout configuration is complete", () => {
  enableLatam(); vi.stubEnv("STRIPE_MARKET_LATAM_PRO_YEARLY", "");
  expect(requestPricingMarket("AR")).toBe("standard");
  expect(countryPricingMarket(" ar ")).toBe("latam");
  expect(readPricingMarketCookie("n2t_pricing_market=latam")).toBe("latam");
  expect(readPricingMarketCookie("n2t_pricing_market=latam_fake")).toBe("standard");
 });
 it("keeps display, annual saving, structured data and Stripe checks consistent", async () => {
  expect(localizedPriceAmount("PREMIUM", "monthly", "USD", "latam")).toBe(2.99);
  expect(localizedPriceAmount("PREMIUM", "yearly", "USD", "latam")).toBe(29.99);
  expect(localizedPriceAmount("PRO", "monthly", "USD", "latam")).toBe(7.49);
  expect(localizedPriceAmount("PRO", "yearly", "USD", "latam")).toBe(74.99);
  expect(localizedAnnualSaving("PREMIUM", "USD", "en", "latam")).toBe("$6");
  expect(localizedAnnualSaving("PRO", "USD", "en", "latam")).toBe("$15");
  expect(buildPricingProductStructuredData(true,"USD","latam").offers.highPrice).toBe("74.99");
  expect(localizedPriceAmount("PREMIUM","monthly",displayCurrencyForCountry("MX"),"standard")).toBe(89);
  expect(localizedPriceAmount("PREMIUM","monthly","BRL","standard")).toBe(14.99);
  const stripe = {prices:{retrieve:vi.fn().mockResolvedValue({active:true,currency:"usd",unit_amount:299,recurring:{interval:"month"}})}} as any;
  await expect(verifyStripePrice(stripe,"price_latam_test","PREMIUM","monthly","USD","latam")).resolves.toBeUndefined();
  await expect(verifyStripePrice(stripe,"price_latam_test","PREMIUM","monthly","USD")).rejects.toThrow("mismatch");
 });
});
