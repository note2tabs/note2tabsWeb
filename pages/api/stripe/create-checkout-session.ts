import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { stripeClient } from "../../../lib/stripe";
import { getAppBaseUrl } from "../../../lib/urls";
import {
  getStripePremiumConfig,
  stripeSubscriptionMatchesPremium,
} from "../../../lib/stripePremium";

const PREMIUM_TRIAL_DAYS = 7;
const PREMIUM_ACCESS_ROLES = new Set(["PREMIUM", "ADMIN", "MODERATOR", "MOD"]);
const PORTAL_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "paused",
  "unpaid",
]);

const appendCheckoutSessionId = (path: string) => {
  const hashIndex = path.indexOf("#");
  const pathAndQuery = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  return `${pathAndQuery}${separator}session_id={CHECKOUT_SESSION_ID}${hash}`;
};

const resolveCheckoutReturnPaths = (requestedPath: unknown) => {
  if (requestedPath === "/transcribe?resumeTranscription=1") {
    return {
      success: "/transcribe?resumeTranscription=1&upgrade=success",
      cancel: "/transcribe?resumeTranscription=1&upgrade=cancel",
      manage: "/transcribe?resumeTranscription=1&upgrade=manage",
    };
  }
  if (requestedPath === "/?resumeTranscription=1") {
    return {
      success: "/?resumeTranscription=1&upgrade=success#hero",
      cancel: "/?resumeTranscription=1&upgrade=cancel#hero",
      manage: "/?resumeTranscription=1&upgrade=manage#hero",
    };
  }
  return {
    success: "/settings?upgrade=success",
    cancel: "/settings?upgrade=cancel",
    manage: "/settings?upgrade=manage",
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email || !session.user.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const premiumConfig = getStripePremiumConfig();
  if (!stripeClient || !premiumConfig) {
    return res.status(503).json({ error: "Stripe not configured yet." });
  }

  if (PREMIUM_ACCESS_ROLES.has(session.user.role || "")) {
    return res.status(409).json({ error: "This account already has Premium access." });
  }

  try {
    const baseUrl = getAppBaseUrl(req);
    const returnPaths = resolveCheckoutReturnPaths(req.body?.returnTo);
    const customers = await stripeClient.customers.list({
      email: session.user.email,
      limit: 100,
    });
    const existingCustomers = customers.data.filter(
      (customer) => customer && !("deleted" in customer)
    );

    let trialAlreadyUsed = false;
    let premiumCustomer = null as (typeof existingCustomers)[number] | null;
    const incompleteSubscriptionIds: string[] = [];
    const subscriptionState: string[] = [];
    for (const customer of existingCustomers) {
      const subscriptions = await stripeClient.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 100,
      });
      const premiumSubscriptions = subscriptions.data.filter((subscription) =>
        stripeSubscriptionMatchesPremium(subscription, premiumConfig)
      );
      if (premiumSubscriptions.length && !premiumCustomer) {
        premiumCustomer = customer;
      }
      if (premiumSubscriptions.some((subscription) => Boolean(subscription.trial_start || subscription.trial_end))) {
        trialAlreadyUsed = true;
      }
      subscriptionState.push(
        `${customer.id}:${premiumSubscriptions
          .map((subscription) => `${subscription.id}:${subscription.status}`)
          .sort()
          .join(",")}`
      );
      for (const subscription of premiumSubscriptions) {
        if (subscription.status === "incomplete") {
          incompleteSubscriptionIds.push(subscription.id);
        }
      }
      if (premiumSubscriptions.some((subscription) => PORTAL_SUBSCRIPTION_STATUSES.has(subscription.status))) {
        const portal = await stripeClient.billingPortal.sessions.create({
          customer: customer.id,
          return_url: `${baseUrl}${returnPaths.manage}`,
        });
        return res.status(200).json({
          url: portal.url,
          action: "manage_subscription",
        });
      }
    }

    const existingCustomer = premiumCustomer || existingCustomers[0];
    const checkoutStateHash = createHash("sha256")
      .update(`${session.user.id}|${returnPaths.success}|${subscriptionState.sort().join("|") || "new"}`)
      .digest("hex")
      .slice(0, 24);
    const checkout = await stripeClient.checkout.sessions.create(
      {
        ...(existingCustomer
          ? { customer: existingCustomer.id }
          : { customer_email: session.user.email }),
        mode: "subscription",
        payment_method_collection: "always",
        line_items: [{ price: premiumConfig.priceId, quantity: 1 }],
        ...(!trialAlreadyUsed
          ? { subscription_data: { trial_period_days: PREMIUM_TRIAL_DAYS } }
          : {}),
        success_url: `${baseUrl}${appendCheckoutSessionId(returnPaths.success)}`,
        cancel_url: `${baseUrl}${returnPaths.cancel}`,
        metadata: {
          userId: session.user.id,
          note2tabsPlan: "premium",
          note2tabsPriceId: premiumConfig.priceId,
        },
      },
      { idempotencyKey: `premium-checkout-${session.user.id}-${checkoutStateHash}` }
    );
    for (const subscriptionId of incompleteSubscriptionIds) {
      await stripeClient.subscriptions.cancel(subscriptionId);
    }
    return res.status(200).json({ url: checkout.url });
  } catch (error) {
    console.error("stripe checkout error", error);
    return res.status(500).json({ error: "Could not create checkout session." });
  }
}
