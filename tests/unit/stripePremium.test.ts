import { afterEach, describe, expect, it } from "vitest";
import { stripeSubscriptionBillingInterval } from "../../lib/stripePremium";

const originalPremiumYearly = process.env.STRIPE_PRICE_PREMIUM_YEARLY;

afterEach(() => {
  process.env.STRIPE_PRICE_PREMIUM_YEARLY = originalPremiumYearly;
});

describe("stripeSubscriptionBillingInterval", () => {
  it("recognizes legacy annual prices by their recurring interval after a price rotation", () => {
    process.env.STRIPE_PRICE_PREMIUM_YEARLY = "price_new_yearly";

    const subscription = {
      items: {
        data: [{ price: { id: "price_legacy_yearly", recurring: { interval: "year" } } }],
      },
    };

    expect(stripeSubscriptionBillingInterval(subscription as never, "PREMIUM")).toBe("yearly");
  });

  it("keeps monthly subscriptions monthly", () => {
    process.env.STRIPE_PRICE_PREMIUM_YEARLY = "price_new_yearly";

    const subscription = {
      items: {
        data: [{ price: { id: "price_monthly", recurring: { interval: "month" } } }],
      },
    };

    expect(stripeSubscriptionBillingInterval(subscription as never, "PREMIUM")).toBe("monthly");
  });
});
