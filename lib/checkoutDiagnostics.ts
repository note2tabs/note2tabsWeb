import type Stripe from "stripe";

const enrichmentRequestOptions = { timeout: 2500, maxNetworkRetries: 0 };

type ExpandedIntent = Stripe.PaymentIntent & {
  payment_method?: string | Stripe.PaymentMethod | null;
};

/** Deliberate allowlist: no card number, last four, name, address or error text. */
export function safeCheckoutPaymentDiagnostics(intent: Stripe.PaymentIntent) {
  const expanded = intent as ExpandedIntent;
  const charge =
    typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const details = charge?.payment_method_details;
  const method =
    typeof expanded.payment_method === "object"
      ? expanded.payment_method
      : null;
  const failureMethod = intent.last_payment_error?.payment_method;
  return {
    payment_diagnostics_available: true,
    payment_intent_status: intent.status,
    payment_method_type: details?.type || method?.type || failureMethod?.type,
    payment_wallet: details?.card?.wallet?.type,
    authentication_result: details?.card?.three_d_secure?.result,
    authentication_flow: details?.card?.three_d_secure?.authentication_flow,
    next_action_type: intent.next_action?.type,
  };
}

/** Subscription-mode sessions can have a null payment_intent. Only initial
 * subscription invoices may be attributed back to acquiring checkout. */
export async function checkoutForPaymentIntent(
  stripe: Stripe,
  intent: Stripe.PaymentIntent,
) {
  const invoice =
    typeof intent.invoice === "string"
      ? await stripe.invoices.retrieve(intent.invoice)
      : intent.invoice;
  if (invoice && invoice.billing_reason !== "subscription_create") return null;
  const direct = await stripe.checkout.sessions.list({
    payment_intent: intent.id,
    limit: 1,
  });
  if (direct.data[0]) return direct.data[0];
  if (!invoice) return null;
  const subscription =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;
  if (!subscription) return null;
  return (
    (await stripe.checkout.sessions.list({ subscription, limit: 1 })).data[0] ||
    null
  );
}

/** Enrichment must not affect payment fulfillment. Uses the existing pinned
 * API shape; this is not an API-version or payment-method configuration change. */
export async function checkoutPaymentDiagnostics(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  try {
    let reference: string | Stripe.PaymentIntent | null | undefined =
      session.payment_intent;
    if (!reference) {
      let invoice: string | Stripe.Invoice | null | undefined = session.invoice;
      if (!invoice && session.subscription) {
        const subscription =
          typeof session.subscription === "string"
            ? await stripe.subscriptions.retrieve(
                session.subscription,
                {},
                enrichmentRequestOptions,
              )
            : session.subscription;
        invoice = subscription.latest_invoice;
      }
      const expandedInvoice =
        typeof invoice === "string"
          ? await stripe.invoices.retrieve(
              invoice,
              {},
              enrichmentRequestOptions,
            )
          : invoice;
      reference = expandedInvoice?.payment_intent;
    }
    if (!reference) return { payment_diagnostics_available: false };
    const intent =
      typeof reference === "string"
        ? await stripe.paymentIntents.retrieve(
            reference,
            {
              expand: ["latest_charge", "payment_method"],
            },
            enrichmentRequestOptions,
          )
        : reference;
    return safeCheckoutPaymentDiagnostics(intent);
  } catch {
    return { payment_diagnostics_available: false };
  }
}
