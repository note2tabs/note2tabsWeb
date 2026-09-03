import type Stripe from "stripe";
import { proPlanConfigured, type PaidSubscriptionPlan } from "./subscriptionPlans";

export type StripePremiumConfig = {
  priceId: string;
  priceIds?: string[];
  productId: string | null;
};
export type StripePaidPlanConfig = StripePremiumConfig & { plan: PaidSubscriptionPlan };
export type BillingInterval = "monthly" | "yearly";

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
  const annualPriceId = process.env.STRIPE_PRICE_PREMIUM_YEARLY?.trim();
  return {
    priceId,
    priceIds: [priceId, annualPriceId].filter((value): value is string => Boolean(value)),
    productId: process.env.STRIPE_PRODUCT_PREMIUM?.trim() || null,
  };
}

export function getStripePaidPlanConfigs(): Record<PaidSubscriptionPlan, StripePaidPlanConfig | null> {
  const premium = getStripePremiumConfig();
  const proPriceId = proPlanConfigured() ? process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() : undefined;
  const proAnnualPriceId = process.env.STRIPE_PRICE_PRO_YEARLY?.trim();
  return {
    PREMIUM: premium ? { ...premium, plan: "PREMIUM" } : null,
    PRO: proPriceId ? {
      plan: "PRO",
      priceId: proPriceId,
      priceIds: [proPriceId, proAnnualPriceId].filter((value): value is string => Boolean(value)),
      productId: process.env.STRIPE_PRODUCT_PRO?.trim() || null,
    } : null,
  };
}

export function getStripePaidPlanConfig(plan: PaidSubscriptionPlan, interval: BillingInterval = "monthly") {
  const config = getStripePaidPlanConfigs()[plan];
  if (!config || interval === "monthly") return config;
  const annualPriceId = plan === "PRO"
    ? process.env.STRIPE_PRICE_PRO_YEARLY?.trim()
    : process.env.STRIPE_PRICE_PREMIUM_YEARLY?.trim();
  return annualPriceId ? { ...config, priceId: annualPriceId } : null;
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

export function stripeSubscriptionBillingInterval(
  subscription: Pick<Stripe.Subscription, "items"> | null | undefined,
  plan: PaidSubscriptionPlan
): BillingInterval {
  const yearlyPriceId = (plan === "PRO"
    ? process.env.STRIPE_PRICE_PRO_YEARLY
    : process.env.STRIPE_PRICE_PREMIUM_YEARLY)?.trim();
  return yearlyPriceId && subscription?.items?.data?.some((item) => item.price?.id === yearlyPriceId)
    ? "yearly"
    : "monthly";
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
  const allowedPriceIds = config.priceIds?.length ? config.priceIds : [config.priceId];
  if (typeof price === "string") return allowedPriceIds.includes(price);
  if (price.id && allowedPriceIds.includes(price.id)) return true;
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
  if ((config.priceIds?.length ? config.priceIds : [config.priceId]).includes(session?.metadata?.note2tabsPriceId || "")) {
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
