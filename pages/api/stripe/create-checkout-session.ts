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
import { getFreshUserRole } from "../../../lib/serverAuth";
import {
  createPostHogServerClient,
  flushPostHogServerClient,
} from "../../../lib/posthogServer";

const PREMIUM_TRIAL_DAYS = 7;
const PREMIUM_ACCESS_ROLES = new Set(["PREMIUM", "ADMIN", "MODERATOR", "MOD"]);
const PORTAL_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "paused",
  "unpaid",
]);

const CHECKOUT_SOURCES = new Set([
  "pricing_page",
  "home_pricing",
  "large_upload_gate",
  "settings",
  "premium_prompt",
]);

const checkoutSource = (value: unknown) =>
  typeof value === "string" && CHECKOUT_SOURCES.has(value) ? value : "unknown";

async function trackCheckoutEvent(
  distinctId: string,
  event: "checkout_session_requested" | "checkout_started" | "checkout_failed",
  properties: Record<string, unknown>
) {
  const client = createPostHogServerClient();
  if (!client) return;
  client.capture({
    distinctId,
    event,
    properties: {
      schema_version: 2,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      ...properties,
    },
  });
  try {
    // Checkout is a low-volume, business-critical funnel. Awaiting this flush
    // prevents Vercel from ending the invocation before PostHog receives it.
    await flushPostHogServerClient(client);
  } catch {
    // Analytics must never prevent a customer from reaching Stripe.
  }
}

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
  const startedAt = Date.now();
  const requestId = String(req.headers["x-vercel-id"] || "local");
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email || !session.user.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const currentRole = await getFreshUserRole(session);
  if (!currentRole) {
    return res.status(401).json({ error: "Account not found" });
  }

  const premiumConfig = getStripePremiumConfig();
  if (!stripeClient || !premiumConfig) {
    return res.status(503).json({ error: "Stripe not configured yet." });
  }

  if (PREMIUM_ACCESS_ROLES.has(currentRole)) {
    return res.status(409).json({ error: "This account already has Premium access." });
  }

  const source = checkoutSource(req.body?.source);
  console.log(JSON.stringify({
    level: "info",
    message: "checkout_session_requested",
    route: "/api/stripe/create-checkout-session",
    requestId,
    source,
  }));
  await trackCheckoutEvent(session.user.id, "checkout_session_requested", {
    plan: "premium_monthly",
    source,
    request_id: requestId,
    $insert_id: `checkout-requested:${requestId}`,
  });

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
        console.log(JSON.stringify({
          level: "info",
          message: "checkout_routed_to_portal",
          route: "/api/stripe/create-checkout-session",
          requestId,
          source,
          duration_ms: Date.now() - startedAt,
        }));
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
    if (!checkout.url) {
      throw new Error("Stripe returned a checkout session without a URL");
    }
    for (const subscriptionId of incompleteSubscriptionIds) {
      await stripeClient.subscriptions.cancel(subscriptionId);
    }
    await trackCheckoutEvent(session.user.id, "checkout_started", {
      plan: "premium_monthly",
      source,
      request_id: requestId,
      $insert_id: `checkout-started:${checkout.id}`,
    });
    console.log(JSON.stringify({
      level: "info",
      message: "checkout_session_created",
      route: "/api/stripe/create-checkout-session",
      requestId,
      source,
      duration_ms: Date.now() - startedAt,
    }));
    return res.status(200).json({ url: checkout.url, checkoutAttemptId: requestId });
  } catch (error) {
    await trackCheckoutEvent(session.user.id, "checkout_failed", {
      plan: "premium_monthly",
      source,
      request_id: requestId,
      failure_stage: "stripe_session_creation",
      $insert_id: `checkout-failed:${requestId}`,
    });
    console.error(JSON.stringify({
      level: "error",
      message: "checkout_session_failed",
      route: "/api/stripe/create-checkout-session",
      requestId,
      source,
      error_type: error instanceof Error ? error.name : "UnknownError",
      duration_ms: Date.now() - startedAt,
    }));
    return res.status(500).json({ error: "Could not create checkout session." });
  }
}
