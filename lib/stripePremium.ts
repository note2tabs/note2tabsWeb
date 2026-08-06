import type Stripe from "stripe";

export type StripePremiumConfig = {
  priceId: string;
  productId: string | null;
};

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
  if (
    session?.metadata?.note2tabsPlan === "premium" &&
    session.metadata.note2tabsPriceId === config.priceId
  ) {
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
