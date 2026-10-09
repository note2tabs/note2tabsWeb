import type Stripe from "stripe";
import { getStripePaidPlanConfigs } from "./stripePremium";

type StripeProductResolver = Pick<Stripe, "prices">;

export async function getPaidPlanProductIds(stripe: StripeProductResolver) {
  const productIds = await Promise.all(
    Object.values(getStripePaidPlanConfigs())
      .filter((config): config is NonNullable<typeof config> => Boolean(config))
      .map(async (config) => {
        if (config.productId) return config.productId;
        const price = await stripe.prices.retrieve(config.priceId);
        return typeof price.product === "string" ? price.product : price.product?.id || null;
      })
  );

  return [...new Set(productIds.filter((productId): productId is string => Boolean(productId)))];
}

export function couponSupportsProducts(coupon: Stripe.Coupon, requiredProductIds: string[]) {
  const eligibleProducts = coupon.applies_to?.products;
  // A coupon without applies_to is valid for every product.
  if (!eligibleProducts?.length) return true;
  const eligible = new Set(eligibleProducts);
  return requiredProductIds.every((productId) => eligible.has(productId));
}
