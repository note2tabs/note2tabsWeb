import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { PREMIUM_MONTHLY_CREDITS } from "../../../lib/credits";
import { prisma } from "../../../lib/prisma";
import { stripeClient } from "../../../lib/stripe";
import {
  getStripePremiumConfig,
  stripeCheckoutSessionMatchesPremium,
  stripeSubscriptionMatchesPremium,
} from "../../../lib/stripePremium";

const CONFIRMABLE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
]);
const CONFIRMATION_LIMIT = 10;
const CONFIRMATION_WINDOW_MS = 60_000;
const confirmationAttempts = new Map<string, { count: number; resetAt: number }>();

const consumeConfirmationAttempt = (userId: string) => {
  const now = Date.now();
  const current = confirmationAttempts.get(userId);
  if (!current || current.resetAt <= now) {
    confirmationAttempts.set(userId, { count: 1, resetAt: now + CONFIRMATION_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= CONFIRMATION_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const rateLimit = consumeConfirmationAttempt(session.user.id);
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    return res.status(429).json({ error: "Too many confirmation attempts. Please try again shortly." });
  }

  const premiumConfig = getStripePremiumConfig();
  if (!stripeClient || !premiumConfig) {
    return res.status(503).json({ error: "Stripe not configured yet." });
  }

  const checkoutSessionId =
    typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
  if (!checkoutSessionId || checkoutSessionId.length > 255) {
    return res.status(400).json({ error: "A valid checkout session is required." });
  }

  try {
    const checkoutSession = await stripeClient.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ["line_items", "subscription"],
    });
    if (
      checkoutSession.mode !== "subscription" ||
      checkoutSession.status !== "complete" ||
      checkoutSession.metadata?.userId !== session.user.id
    ) {
      return res.status(403).json({ error: "This checkout does not belong to this account." });
    }

    const subscriptionRef = checkoutSession.subscription;
    const subscription =
      typeof subscriptionRef === "string"
        ? await stripeClient.subscriptions.retrieve(subscriptionRef)
        : subscriptionRef;
    const matchesPremium =
      stripeCheckoutSessionMatchesPremium(checkoutSession, premiumConfig) &&
      stripeSubscriptionMatchesPremium(subscription, premiumConfig);
    if (
      !subscription ||
      !matchesPremium ||
      !CONFIRMABLE_SUBSCRIPTION_STATUSES.has(subscription.status)
    ) {
      return res.status(409).json({ error: "Premium checkout is not active yet." });
    }

    const user = await prisma.user.findFirst({
      where: { id: session.user.id },
      select: { id: true, role: true, tokensRemaining: true },
    });
    if (!user) {
      return res.status(404).json({ error: "Account not found." });
    }
    if (user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD") {
      return res.status(200).json({ confirmed: true, role: user.role });
    }

    // Reconcile against Stripe immediately before the local entitlement write.
    // This narrows the window in which a replay could race a cancellation.
    const liveSubscription = await stripeClient.subscriptions.retrieve(subscription.id);
    if (
      !stripeSubscriptionMatchesPremium(liveSubscription, premiumConfig) ||
      !CONFIRMABLE_SUBSCRIPTION_STATUSES.has(liveSubscription.status)
    ) {
      return res.status(409).json({ error: "Premium checkout is no longer active." });
    }

    if (user.role === "PREMIUM") {
      return res.status(200).json({ confirmed: true, role: "PREMIUM" });
    }

    const tokensRemaining = PREMIUM_MONTHLY_CREDITS;
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "PREMIUM", tokensRemaining },
    });

    return res.status(200).json({ confirmed: true, role: "PREMIUM" });
  } catch (error) {
    console.error("stripe checkout confirmation error", error);
    return res.status(500).json({ error: "Could not confirm Premium checkout." });
  }
}
