import type Stripe from "stripe";
import { stripeSubscriptionMatchesPremium, type StripePremiumConfig } from "./stripePremium";

export const MANAGEABLE_PREMIUM_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "paused",
  "unpaid",
]);

type StripeClient = Pick<Stripe, "customers" | "subscriptions">;

export type PremiumCustomerState = {
  trialEligible: boolean;
  premiumCustomer: Stripe.Customer | null;
  fallbackCustomer: Stripe.Customer | null;
  manageableCustomer: Stripe.Customer | null;
  incompleteSubscriptionIds: string[];
  subscriptionState: string[];
};

export async function inspectPremiumCustomerState(input: {
  stripe: StripeClient;
  email: string;
  config: StripePremiumConfig;
}): Promise<PremiumCustomerState> {
  const customers = await input.stripe.customers.list({
    email: input.email,
    limit: 100,
  });
  const existingCustomers = customers.data.filter(
    (customer): customer is Stripe.Customer => Boolean(customer && !("deleted" in customer))
  );

  let hasPremiumHistory = false;
  let premiumCustomer: Stripe.Customer | null = null;
  let manageableCustomer: Stripe.Customer | null = null;
  const incompleteSubscriptionIds: string[] = [];
  const subscriptionState: string[] = [];

  const customerSubscriptionStates: Array<{
    customer: Stripe.Customer;
    premiumSubscriptions: Stripe.Subscription[];
  }> = [];
  // Same-email duplicates are uncommon, but Stripe can return many historical
  // customers. Resolve small batches in parallel so checkout is not a linear
  // network waterfall while avoiding an unbounded API burst.
  for (let offset = 0; offset < existingCustomers.length; offset += 5) {
    const batch = existingCustomers.slice(offset, offset + 5);
    customerSubscriptionStates.push(
      ...(await Promise.all(
        batch.map(async (customer) => {
          const subscriptions = await input.stripe.subscriptions.list({
            customer: customer.id,
            status: "all",
            limit: 100,
          });
          return {
            customer,
            premiumSubscriptions: subscriptions.data.filter((subscription) =>
              stripeSubscriptionMatchesPremium(subscription, input.config)
            ),
          };
        })
      ))
    );
  }

  for (const { customer, premiumSubscriptions } of customerSubscriptionStates) {
    if (premiumSubscriptions.length && !premiumCustomer) premiumCustomer = customer;
    if (premiumSubscriptions.length > 0) hasPremiumHistory = true;
    if (
      !manageableCustomer &&
      premiumSubscriptions.some((subscription) =>
        MANAGEABLE_PREMIUM_STATUSES.has(subscription.status)
      )
    ) {
      manageableCustomer = customer;
    }
    subscriptionState.push(
      `${customer.id}:${premiumSubscriptions
        .map((subscription) => `${subscription.id}:${subscription.status}`)
        .sort()
        .join(",")}`
    );
    premiumSubscriptions.forEach((subscription) => {
      if (subscription.status === "incomplete") incompleteSubscriptionIds.push(subscription.id);
    });
  }

  return {
    trialEligible: !hasPremiumHistory,
    premiumCustomer,
    fallbackCustomer: existingCustomers[0] || null,
    manageableCustomer,
    incompleteSubscriptionIds,
    subscriptionState,
  };
}
