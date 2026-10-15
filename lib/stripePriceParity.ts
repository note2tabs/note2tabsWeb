import type Stripe from "stripe";
import { localizedPriceAmount, type DisplayCurrency } from "./localizedPricing";
import type { BillingInterval } from "./stripePremium";
import type { PaidSubscriptionPlan } from "./subscriptionPlans";

const prices = new Map<string, { expires: number; value: Promise<Stripe.Price> }>();

/** Cache expanded price configuration for five minutes; never cache buyer data. */
export async function verifyStripePrice(
  stripe: Stripe,
  priceId: string,
  plan: PaidSubscriptionPlan,
  interval: BillingInterval,
  currency: DisplayCurrency,
) {
  let cached = prices.get(priceId);
  if (!cached || cached.expires < Date.now()) {
    const value = stripe.prices.retrieve(priceId, { expand: ["currency_options"] }).catch(error => {
      prices.delete(priceId);
      throw error;
    });
    cached = { expires: Date.now() + 5 * 60_000, value };
    prices.set(priceId, cached);
  }
  const price = await cached.value;
  const minor = currency === "JPY" || currency === "KRW" ? 1 : 100;
  const expected = Math.round(localizedPriceAmount(plan, interval, currency) * minor);
  const amount = price.currency === currency.toLowerCase()
    ? price.unit_amount
    : price.currency_options?.[currency.toLowerCase()]?.unit_amount;
  if (
    !price.active ||
    price.recurring?.interval !== (interval === "yearly" ? "year" : "month") ||
    amount !== expected
  ) {
    throw new Error(`Stripe price configuration mismatch: ${plan} ${interval} ${currency}`);
  }
}
