import { describe, expect, it, vi } from "vitest";
import { verifyStripePrice } from "../../lib/stripePriceParity";
import { DISPLAY_CURRENCIES, localizedPriceAmount } from "../../lib/localizedPricing";
import manifest from "../../docs/stripe-price-parity-20261015.json";
import type Stripe from "stripe";

describe("Stripe price parity", () => {
  it("matches every provisioned amount to the website, including zero-decimal currencies", async () => {
    for (const row of manifest) {
      const plan = row.plan as "PREMIUM" | "PRO";
      const interval = row.interval as "monthly" | "yearly";
      const retrieve = vi.fn().mockResolvedValue({active:true,currency:"usd",unit_amount:Math.round(row.amounts.USD*100),recurring:{interval:interval === "yearly" ? "year" : "month"},currency_options:Object.fromEntries(DISPLAY_CURRENCIES.map(c=>[c.toLowerCase(),{unit_amount:Math.round(row.amounts[c]*(["JPY","KRW"].includes(c)?1:100))}]))});
      for (const currency of DISPLAY_CURRENCIES) {
        expect(row.amounts[currency]).toBe(localizedPriceAmount(plan,interval,currency));
        await verifyStripePrice({prices:{retrieve}} as unknown as Stripe,row.id,plan,interval,currency);
      }
      expect(retrieve).toHaveBeenCalledTimes(1);
    }
  });
  it.each([
    {active:true,unit_amount:2190,recurring:{interval:"month"}},
    {active:false,unit_amount:1499,recurring:{interval:"month"}},
    {active:true,unit_amount:1499,recurring:{interval:"year"}},
  ])("rejects stale, inactive and wrong-interval configurations: %j", async (price) => {
    const retrieve=vi.fn().mockResolvedValue({...price,currency:"brl"});
    await expect(verifyStripePrice({prices:{retrieve}} as unknown as Stripe,`invalid_${price.active}_${price.unit_amount}_${price.recurring.interval}`,"PREMIUM","monthly","BRL")).rejects.toThrow("configuration mismatch");
  });
});
