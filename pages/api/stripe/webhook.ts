import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";
import { stripeClient } from "../../../lib/stripe";
import { prisma } from "../../../lib/prisma";
import {
  PREMIUM_MONTHLY_CREDITS,
  STARTING_CREDITS,
  capCreditBalance,
} from "../../../lib/credits";
import {
  getStripePremiumConfig,
  stripeCheckoutSessionMatchesPremium,
  stripeInvoiceMatchesPremium,
  stripeInvoiceRenewalAt,
  stripeSubscriptionId,
  stripeSubscriptionMatchesPremium,
  type StripePremiumConfig,
} from "../../../lib/stripePremium";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readBuffer(req: NextApiRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

type UserIdentifier = { id: string } | { email: string };

const ENTITLED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

const REVOKED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
  "paused",
  "unpaid",
]);

const normalizeEmail = (email?: string | null) => {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
};

async function resolveUserIdentifierFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<UserIdentifier | null> {
  const userIdRaw = session?.metadata?.userId;
  if (typeof userIdRaw === "string" && userIdRaw.trim()) {
    return { id: userIdRaw.trim() };
  }

  const detailsEmail = normalizeEmail(session?.customer_details?.email || null);
  if (detailsEmail) return { email: detailsEmail };

  const customerEmail = normalizeEmail(
    typeof session?.customer_email === "string" ? session.customer_email : null
  );
  if (customerEmail) return { email: customerEmail };

  if (!stripeClient || typeof session?.customer !== "string" || !session.customer) {
    return null;
  }
  try {
    const customer = await stripeClient.customers.retrieve(session.customer);
    if (customer && !("deleted" in customer)) {
      const email = normalizeEmail(customer.email);
      if (email) return { email };
    }
  } catch (error) {
    console.error("Webhook customer lookup failed.", error);
  }
  return null;
}

async function resolveEmailFromCustomerRef(
  customerRef: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!customerRef) return null;
  if (typeof customerRef === "object") {
    if ("deleted" in customerRef) return null;
    return normalizeEmail(customerRef.email);
  }
  if (!stripeClient || typeof customerRef !== "string" || !customerRef.trim()) {
    return null;
  }
  try {
    const customer = await stripeClient.customers.retrieve(customerRef);
    if (customer && !("deleted" in customer)) {
      return normalizeEmail(customer.email);
    }
  } catch (error) {
    console.error("Webhook customer retrieval failed.", error);
  }
  return null;
}

async function customerHasEntitledSubscription(
  customerId: string,
  premiumConfig: StripePremiumConfig
) {
  if (!stripeClient || !customerId.trim()) return false;
  const subscriptions = await stripeClient.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  return subscriptions.data.some(
    (subscription) =>
      stripeSubscriptionMatchesPremium(subscription, premiumConfig) &&
      ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)
  );
}

async function emailHasEntitledSubscription(
  email: string,
  premiumConfig: StripePremiumConfig,
  excludedCustomerId?: string | null
) {
  if (!stripeClient) return false;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  const customers = await stripeClient.customers.list({
    email: normalizedEmail,
    limit: 100,
  });
  for (const customer of customers.data) {
    if ("deleted" in customer) continue;
    if (excludedCustomerId && customer.id === excludedCustomerId) continue;
    if (await customerHasEntitledSubscription(customer.id, premiumConfig)) {
      return true;
    }
  }
  return false;
}

async function setPremiumForIdentifier(identifier: UserIdentifier) {
  const user = await prisma.user.findFirst({
    where: identifier,
    select: { id: true, role: true, tokensRemaining: true },
  });
  if (!user) return;
  if (user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD") {
    return;
  }
  const isAlreadyPremium = user.role === "PREMIUM";
  const tokensRemaining =
    !isAlreadyPremium
      ? PREMIUM_MONTHLY_CREDITS
      : capCreditBalance(user.tokensRemaining);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: "PREMIUM",
      tokensRemaining,
    },
  });
}

type RenewalInvoiceDetails = {
  invoiceId: string;
  stripeSubscriptionId: string;
  renewalAt: Date;
};

const prismaErrorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";

async function grantRenewalForIdentifier(
  identifier: UserIdentifier,
  renewal: RenewalInvoiceDetails
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const alreadyProcessed = await tx.stripeRenewalInvoice.findUnique({
            where: { invoiceId: renewal.invoiceId },
            select: { invoiceId: true },
          });
          if (alreadyProcessed) return "duplicate" as const;

          const user = await tx.user.findFirst({
            where: identifier,
            select: { id: true, role: true, tokensRemaining: true },
          });
          if (!user || user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD") {
            return "ignored" as const;
          }

          const latestGrantedRenewal = await tx.stripeRenewalInvoice.findFirst({
            where: { userId: user.id, granted: true },
            orderBy: [{ renewalAt: "desc" }, { processedAt: "desc" }],
            select: { renewalAt: true },
          });
          const isOutOfOrder = Boolean(
            latestGrantedRenewal && renewal.renewalAt <= latestGrantedRenewal.renewalAt
          );

          await tx.stripeRenewalInvoice.create({
            data: {
              invoiceId: renewal.invoiceId,
              userId: user.id,
              stripeSubscriptionId: renewal.stripeSubscriptionId,
              renewalAt: renewal.renewalAt,
              granted: !isOutOfOrder,
            },
          });
          if (isOutOfOrder) return "out_of_order" as const;

          const tokensRemaining =
            user.role === "PREMIUM"
              ? capCreditBalance(user.tokensRemaining + PREMIUM_MONTHLY_CREDITS)
              : PREMIUM_MONTHLY_CREDITS;
          await tx.user.update({
            where: { id: user.id },
            data: { role: "PREMIUM", tokensRemaining },
          });
          return "granted" as const;
        },
        { isolationLevel: "Serializable" }
      );
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === "P2002") return "duplicate" as const;
      if (code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  return "ignored" as const;
}

async function downgradePremiumByEmail(
  email: string,
  premiumConfig: StripePremiumConfig,
  customerId?: string | null
) {
  if (customerId && (await customerHasEntitledSubscription(customerId, premiumConfig))) {
    return;
  }
  if (await emailHasEntitledSubscription(email, premiumConfig, customerId)) {
    return;
  }

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase() },
    select: { id: true, role: true },
  });
  if (!user || user.role !== "PREMIUM") return;
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "FREE", tokensRemaining: STARTING_CREDITS },
  });
}

async function checkoutSessionIsForPremium(
  session: Stripe.Checkout.Session,
  premiumConfig: StripePremiumConfig
) {
  if (!stripeClient) return false;
  if (session.mode && session.mode !== "subscription") return false;

  const subscriptionRef = session.subscription;
  if (subscriptionRef && typeof subscriptionRef === "object") {
    if (stripeSubscriptionMatchesPremium(subscriptionRef, premiumConfig)) return true;
  } else if (typeof subscriptionRef === "string") {
    const subscription = await stripeClient.subscriptions.retrieve(subscriptionRef);
    if (stripeSubscriptionMatchesPremium(subscription, premiumConfig)) return true;
  }

  if (!session.id) return false;
  const lineItems = await stripeClient.checkout.sessions.listLineItems(session.id, { limit: 100 });
  return lineItems.data.some((lineItem) =>
    stripeCheckoutSessionMatchesPremium(
      { line_items: { data: [lineItem] } } as Stripe.Checkout.Session,
      premiumConfig
    )
  );
}

async function premiumSubscriptionForInvoice(
  invoice: Stripe.Invoice,
  premiumConfig: StripePremiumConfig
) {
  if (!stripeClient) return null;
  const matchingLine = invoice.lines?.data?.find((line) =>
    stripeInvoiceMatchesPremium(
      { lines: { data: [line] } } as Stripe.Invoice,
      premiumConfig
    )
  );
  const subscriptionRef = invoice.subscription || matchingLine?.subscription || null;
  if (!subscriptionRef) return null;
  const subscription =
    typeof subscriptionRef === "string"
      ? await stripeClient.subscriptions.retrieve(subscriptionRef)
      : subscriptionRef;
  if (!stripeSubscriptionMatchesPremium(subscription, premiumConfig)) return null;
  if (invoice.lines?.data?.length && !stripeInvoiceMatchesPremium(invoice, premiumConfig)) return null;
  return subscription;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const premiumConfig = getStripePremiumConfig();
  if (!stripeClient || !process.env.STRIPE_WEBHOOK_SECRET || !premiumConfig) {
    return res.status(503).json({ error: "Stripe not configured yet." });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    return res.status(400).json({ error: "Missing signature" });
  }

  let event: Stripe.Event;
  try {
    const buf = await readBuffer(req);
    event = stripeClient.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed.", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      if (!(await checkoutSessionIsForPremium(checkoutSession, premiumConfig))) {
        return res.status(200).json({ received: true, ignored: "unrelated_checkout" });
      }
      const identifier = await resolveUserIdentifierFromCheckoutSession(checkoutSession);
      if (identifier) {
        await setPremiumForIdentifier(identifier);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      if (!stripeSubscriptionMatchesPremium(subscription, premiumConfig)) {
        return res.status(200).json({ received: true, ignored: "unrelated_subscription" });
      }
      const email = await resolveEmailFromCustomerRef(subscription.customer);
      if (email) {
        await downgradePremiumByEmail(
          email,
          premiumConfig,
          stripeSubscriptionId(subscription.customer)
        );
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      if (!stripeSubscriptionMatchesPremium(subscription, premiumConfig)) {
        return res.status(200).json({ received: true, ignored: "unrelated_subscription" });
      }
      const email = await resolveEmailFromCustomerRef(subscription.customer);
      if (email && ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        await setPremiumForIdentifier({ email });
      }
      if (email && REVOKED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        await downgradePremiumByEmail(
          email,
          premiumConfig,
          stripeSubscriptionId(subscription.customer)
        );
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const premiumSubscription = await premiumSubscriptionForInvoice(invoice, premiumConfig);
      if (!premiumSubscription) {
        return res.status(200).json({ received: true, ignored: "unrelated_invoice" });
      }
      const email =
        normalizeEmail(invoice.customer_email) || (await resolveEmailFromCustomerRef(invoice.customer));
      if (email) {
        const isRenewal = invoice.billing_reason === "subscription_cycle";
        if (!ENTITLED_SUBSCRIPTION_STATUSES.has(premiumSubscription.status)) {
          return res.status(200).json({ received: true, ignored: "subscription_not_entitled" });
        }
        if (isRenewal) {
          const subscriptionId = stripeSubscriptionId(premiumSubscription);
          const renewalAt = stripeInvoiceRenewalAt(invoice, premiumConfig);
          if (!invoice.id || !subscriptionId || !renewalAt) {
            return res.status(200).json({ received: true, ignored: "invalid_renewal" });
          }
          const result = await grantRenewalForIdentifier(
            { email },
            {
              invoiceId: invoice.id,
              stripeSubscriptionId: subscriptionId,
              renewalAt,
            }
          );
          return res.status(200).json({ received: true, renewal: result });
        }
        await setPremiumForIdentifier({ email });
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const premiumSubscription = await premiumSubscriptionForInvoice(invoice, premiumConfig);
      if (!premiumSubscription) {
        return res.status(200).json({ received: true, ignored: "unrelated_invoice" });
      }
      if (!ENTITLED_SUBSCRIPTION_STATUSES.has(premiumSubscription.status)) {
        const customerId = stripeSubscriptionId(premiumSubscription.customer);
        const email =
          normalizeEmail(invoice.customer_email) || (await resolveEmailFromCustomerRef(invoice.customer));
        if (email) {
          await downgradePremiumByEmail(email, premiumConfig, customerId);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error", error);
    return res.status(500).json({ error: "Webhook handler failed." });
  }
}
