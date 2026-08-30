import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { stripeClient } from "../../../lib/stripe";
import { getAppBaseUrl } from "../../../lib/urls";
import {
  getStripePremiumConfig,
} from "../../../lib/stripePremium";
import { getFreshUserRole } from "../../../lib/serverAuth";
import { createPostHogServerClient } from "../../../lib/posthogServer";
import { inspectPremiumCustomerState } from "../../../lib/stripePremiumOffer";
import {
  normalizePremiumFunnelId,
  normalizePremiumFunnelReason,
  normalizePremiumFunnelSource,
} from "../../../lib/premiumFunnel";
import { normalizePremiumOfferVariant } from "../../../lib/premiumOfferExperiment";
import { parseUserAgent } from "../../../lib/analyticsV2/ua";
import { affiliateClickIdFromRequest, affiliateCodeFromRequest } from "../../../lib/affiliate";
import { trackAffiliateEvent } from "../../../lib/affiliateTracking";
import { prisma } from "../../../lib/prisma";

const PREMIUM_TRIAL_DAYS = 7;
const PREMIUM_ACCESS_ROLES = new Set(["PREMIUM", "ADMIN", "MODERATOR", "MOD"]);
async function trackCheckoutEvent(
  distinctId: string,
  event: "checkout_session_requested" | "checkout_started" | "checkout_failed",
  properties: Record<string, unknown>
) {
  const client = createPostHogServerClient();
  if (!client) return;
  client.capture({ distinctId, event, properties });
  try {
    // Checkout is a low-volume, business-critical funnel. Awaiting this flush
    // prevents Vercel from ending the invocation before PostHog receives it.
    await client.flush();
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
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
  const currentRole = await getFreshUserRole(session);
  if (!currentRole) {
    return res.status(401).json({ error: "Account not found" });
  }

  const premiumConfig = getStripePremiumConfig();
  if (!stripeClient || !premiumConfig) {
    return res.status(503).json({
      error: "Premium checkout is temporarily unavailable. Please try again shortly.",
    });
  }

  if (PREMIUM_ACCESS_ROLES.has(currentRole)) {
    return res.status(409).json({ error: "This account already has Premium access." });
  }

  const source = normalizePremiumFunnelSource(req.body?.source);
  const reason = normalizePremiumFunnelReason(req.body?.reason);
  const offerVariant = normalizePremiumOfferVariant(req.body?.offerVariant);
  const requestedModel = String(req.body?.model || "").toLowerCase();
  const model = source === "heavy_model" || reason.includes("heavy")
    ? "heavy"
    : requestedModel === "light" || requestedModel === "heavy"
      ? requestedModel
      : "unknown";
  const deviceType = parseUserAgent(req.headers["user-agent"]).deviceType;
  const funnelId =
    normalizePremiumFunnelId(req.body?.funnelId) ||
    createHash("sha256")
      .update(`${session.user.id}|${requestId}|${Date.now()}`)
      .digest("hex")
      .slice(0, 24);
  console.log(JSON.stringify({
    level: "info",
    message: "checkout_session_requested",
    route: "/api/stripe/create-checkout-session",
    requestId,
    source,
    reason,
    funnelId,
    offerVariant,
    model,
    deviceType,
  }));
  await trackCheckoutEvent(session.user.id, "checkout_session_requested", {
    plan: "premium_monthly",
    source,
    reason,
    funnel_id: funnelId,
    offer_variant: offerVariant,
    model,
    device_type: deviceType,
    request_id: requestId,
  });

  try {
    const baseUrl = getAppBaseUrl(req);
    const returnPaths = resolveCheckoutReturnPaths(req.body?.returnTo);
    const referralCode = affiliateCodeFromRequest(req);
    const referredAffiliate = referralCode
      ? await prisma.affiliate.findFirst({
          where: { code: referralCode, status: "ACTIVE", userId: { not: session.user.id } },
        })
      : null;
    const customerState = await inspectPremiumCustomerState({
      stripe: stripeClient,
      email: session.user.email,
      config: premiumConfig,
    });
    if (customerState.manageableCustomer) {
      const portal = await stripeClient.billingPortal.sessions.create({
        customer: customerState.manageableCustomer.id,
        return_url: `${baseUrl}${returnPaths.manage}`,
      });
      console.log(JSON.stringify({
        level: "info",
        message: "checkout_routed_to_portal",
        route: "/api/stripe/create-checkout-session",
        requestId,
        source,
        reason,
        funnelId,
        duration_ms: Date.now() - startedAt,
      }));
      return res.status(200).json({
        url: portal.url,
        action: "manage_subscription",
      });
    }

    let attribution = await prisma.affiliateAttribution.findUnique({
      where: { referredUserId: session.user.id },
      include: { affiliate: true },
    });
    if (!attribution && referredAffiliate) {
      attribution = await prisma.affiliateAttribution.create({
        data: { affiliateId: referredAffiliate.id, referredUserId: session.user.id, source: "link" },
        include: { affiliate: true },
      });
    }
    const activeAttribution = attribution?.affiliate.status === "ACTIVE" ? attribution : null;

    const existingCustomer = customerState.premiumCustomer || customerState.fallbackCustomer;
    const checkoutStateHash = createHash("sha256")
      .update(
        `${session.user.id}|${returnPaths.success}|${funnelId}|${
          customerState.subscriptionState.sort().join("|") || "new"
        }`
      )
      .digest("hex")
      .slice(0, 24);
    const checkoutMetadata = {
      userId: session.user.id,
      note2tabsPlan: "premium",
      note2tabsPriceId: premiumConfig.priceId,
      premiumFunnelId: funnelId,
      premiumFunnelSource: source,
      premiumFunnelReason: reason,
      premiumOfferVariant: offerVariant,
      premiumFunnelModel: model,
      premiumTrialIncluded: customerState.trialEligible ? "true" : "false",
      ...(activeAttribution
        ? {
            note2tabsAffiliateId: activeAttribution.affiliateId,
            note2tabsAffiliateAttributionId: activeAttribution.id,
          }
        : {}),
    };
    const checkout = await stripeClient.checkout.sessions.create(
      {
        ...(existingCustomer
          ? { customer: existingCustomer.id }
          : { customer_email: session.user.email }),
        mode: "subscription",
        payment_method_collection: "always",
        line_items: [{ price: premiumConfig.priceId, quantity: 1 }],
        client_reference_id: funnelId,
        subscription_data: {
          ...(customerState.trialEligible ? { trial_period_days: PREMIUM_TRIAL_DAYS } : {}),
          metadata: checkoutMetadata,
        },
        ...(activeAttribution?.affiliate.stripePromotionCodeId
          ? { discounts: [{ promotion_code: activeAttribution.affiliate.stripePromotionCodeId }] }
          : { allow_promotion_codes: true }),
        success_url: `${baseUrl}${appendCheckoutSessionId(returnPaths.success)}`,
        cancel_url: `${baseUrl}${returnPaths.cancel}`,
        metadata: checkoutMetadata,
      },
      { idempotencyKey: `premium-checkout-${session.user.id}-${checkoutStateHash}` }
    );
    if (!checkout.url) {
      throw new Error("Stripe returned a checkout session without a URL");
    }
    for (const subscriptionId of customerState.incompleteSubscriptionIds) {
      await stripeClient.subscriptions.cancel(subscriptionId);
    }
    await trackCheckoutEvent(session.user.id, "checkout_started", {
      plan: "premium_monthly",
      source,
      reason,
      funnel_id: funnelId,
      trial_included: customerState.trialEligible,
      offer_variant: offerVariant,
      model,
      device_type: deviceType,
      request_id: requestId,
      $insert_id: `checkout-started:${checkout.id}`,
    });
    if (activeAttribution) {
      await trackAffiliateEvent({
        distinctId: session.user.id,
        event: "affiliate_checkout_started",
        insertId: `affiliate-checkout:${checkout.id}`,
        properties: {
          affiliate_id: activeAttribution.affiliateId,
          affiliate_code: activeAttribution.affiliate.code,
          affiliate_click_id: affiliateClickIdFromRequest(req) || undefined,
          checkout_session_id: checkout.id,
          trial_included: customerState.trialEligible,
        },
      });
    }
    console.log(JSON.stringify({
      level: "info",
      message: "checkout_session_created",
      route: "/api/stripe/create-checkout-session",
      requestId,
      source,
      reason,
      funnelId,
      duration_ms: Date.now() - startedAt,
    }));
    return res.status(200).json({
      url: checkout.url,
      checkoutAttemptId: requestId,
      funnelId,
      trialIncluded: customerState.trialEligible,
      offerVariant,
    });
  } catch (error) {
    await trackCheckoutEvent(session.user.id, "checkout_failed", {
      plan: "premium_monthly",
      source,
      reason,
      funnel_id: funnelId,
      offer_variant: offerVariant,
      model,
      device_type: deviceType,
      request_id: requestId,
      failure_stage: "stripe_session_creation",
    });
    console.error(JSON.stringify({
      level: "error",
      message: "checkout_session_failed",
      route: "/api/stripe/create-checkout-session",
      requestId,
      source,
      reason,
      funnelId,
      error_type: error instanceof Error ? error.name : "UnknownError",
      duration_ms: Date.now() - startedAt,
    }));
    return res.status(500).json({ error: "Could not create checkout session." });
  }
}
