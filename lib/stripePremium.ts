import type Stripe from "stripe";
import { proPlanConfigured, type PaidSubscriptionPlan } from "./subscriptionPlans";

export type StripePremiumConfig = {
  priceId: string;
  productId: string | null;
};
export type StripePaidPlanConfig = StripePremiumConfig & { plan: PaidSubscriptionPlan };

type StripeIdReference = string | { id?: string | null } | null | undefined;
type StripePriceReference =
  | string
  | {
      id?: string | null;
      product?: StripeIdReference;
    }
  | null
  | undefined;

const referenceId = (reference: StripeIdReference) => {
  if (typeof reference === "string") return reference;
  return typeof reference?.id === "string" ? reference.id : null;
};

export function getStripePremiumConfig(): StripePremiumConfig | null {
  const priceId = process.env.STRIPE_PRICE_PREMIUM_MONTHLY?.trim();
  if (!priceId) return null;
  return {
    priceId,
    productId: process.env.STRIPE_PRODUCT_PREMIUM?.trim() || null,
  };
}

export function getStripePaidPlanConfigs(): Record<PaidSubscriptionPlan, StripePaidPlanConfig | null> {
  const premium = getStripePremiumConfig();
  const proPriceId = proPlanConfigured() ? process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() : undefined;
  return {
    PREMIUM: premium ? { ...premium, plan: "PREMIUM" } : null,
    PRO: proPriceId ? {
      plan: "PRO",
      priceId: proPriceId,
      productId: process.env.STRIPE_PRODUCT_PRO?.trim() || null,
    } : null,
  };
}

export function getStripePaidPlanConfig(plan: PaidSubscriptionPlan) {
  return getStripePaidPlanConfigs()[plan];
}

export function stripePriceMatchesConfig(price: StripePriceReference, config: StripePremiumConfig) {
  return stripePriceMatchesPremium(price, config);
}

export function stripeSubscriptionPlan(
  subscription: Pick<Stripe.Subscription, "items"> | null | undefined
): PaidSubscriptionPlan | null {
  const configs = getStripePaidPlanConfigs();
  for (const plan of ["PRO", "PREMIUM"] as const) {
    const config = configs[plan];
    if (config && stripeSubscriptionMatchesPremium(subscription, config)) return plan;
  }
  return null;
}

export function stripeCheckoutPlan(
  session: Pick<Stripe.Checkout.Session, "line_items" | "metadata"> | null | undefined
): PaidSubscriptionPlan | null {
  const metadataPlan = session?.metadata?.note2tabsPlan?.toUpperCase();
  const configs = getStripePaidPlanConfigs();
  if ((metadataPlan === "PREMIUM" || metadataPlan === "PRO") && configs[metadataPlan]) {
    const config = configs[metadataPlan];
    if (config && stripeCheckoutSessionMatchesPremium(session, config)) return metadataPlan;
  }
  for (const plan of ["PRO", "PREMIUM"] as const) {
    const config = configs[plan];
    if (config && stripeCheckoutSessionMatchesPremium(session, config)) return plan;
  }
  return null;
}

export function stripePriceMatchesPremium(
  price: StripePriceReference,
  config: StripePremiumConfig
) {
  if (!price) return false;
  if (typeof price === "string") return price === config.priceId;
  if (price.id === config.priceId) return true;
  return Boolean(config.productId && referenceId(price.product) === config.productId);
}

export function stripeSubscriptionMatchesPremium(
  subscription: Pick<Stripe.Subscription, "items"> | null | undefined,
  config: StripePremiumConfig
) {
  return Boolean(
    subscription?.items?.data?.some((item) =>
      stripePriceMatchesPremium(item?.price as StripePriceReference, config)
    )
  );
}

export function stripeInvoiceMatchesPremium(
  invoice: Pick<Stripe.Invoice, "lines"> | null | undefined,
  config: StripePremiumConfig
) {
  return Boolean(
    invoice?.lines?.data?.some((line) =>
      stripePriceMatchesPremium(line?.price as StripePriceReference, config)
    )
  );
}

export function stripeCheckoutSessionMatchesPremium(
  session: Pick<Stripe.Checkout.Session, "line_items" | "metadata"> | null | undefined,
  config: StripePremiumConfig
) {
  if (session?.metadata?.note2tabsPriceId === config.priceId) {
    return true;
  }
  return Boolean(
    session?.line_items?.data?.some((lineItem) =>
      stripePriceMatchesPremium(lineItem?.price as StripePriceReference, config)
    )
  );
}

export function stripeSubscriptionId(
  subscription: string | Pick<Stripe.Subscription, "id"> | null | undefined
) {
  return typeof subscription === "string" ? subscription : subscription?.id || null;
}

export function stripeInvoiceRenewalAt(invoice: Stripe.Invoice, config: StripePremiumConfig) {
  const matchingPeriodEnds = (invoice.lines?.data || [])
    .filter((line) => stripePriceMatchesPremium(line?.price as StripePriceReference, config))
    .map((line) => line?.period?.end)
    .filter((value): value is number => Number.isFinite(value) && value > 0);
  const epochSeconds =
    (matchingPeriodEnds.length ? Math.max(...matchingPeriodEnds) : null) ||
    (Number.isFinite(invoice.period_end) && invoice.period_end > 0 ? invoice.period_end : null) ||
    (Number.isFinite(invoice.created) && invoice.created > 0 ? invoice.created : null);
  return epochSeconds ? new Date(epochSeconds * 1000) : null;
}
