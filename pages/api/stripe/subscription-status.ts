import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import type Stripe from "stripe";
import { stripeClient } from "../../../lib/stripe";
import {
  getStripePremiumConfig,
  stripeSubscriptionMatchesPremium,
} from "../../../lib/stripePremium";
import { authOptions } from "../auth/[...nextauth]";

const VISIBLE_STATUSES = new Set(["active", "past_due", "trialing"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
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

  res.setHeader("Cache-Control", "private, no-store");

  try {
    const customers = await stripeClient.customers.list({
      email: session.user.email,
      limit: 10,
    });
    const subscriptions: Stripe.Subscription[] = [];
    for (const customer of customers.data) {
      if (!customer || "deleted" in customer) continue;
      const result = await stripeClient.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 100,
      });
      subscriptions.push(
        ...result.data.filter((subscription) =>
          stripeSubscriptionMatchesPremium(subscription, premiumConfig)
        )
      );
    }

    const subscription = subscriptions
      .filter((candidate) => VISIBLE_STATUSES.has(candidate.status))
      .sort((left, right) => right.created - left.created)[0];

    if (!subscription) {
      return res.status(200).json({ subscription: null });
    }

    return res.status(200).json({
      subscription: {
        status: subscription.status,
        isTrial: subscription.status === "trialing",
        trialEndsAt: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        accessEndsAt: subscription.cancel_at
          ? new Date(subscription.cancel_at * 1000).toISOString()
          : subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
      },
    });
  } catch (error) {
    console.error("stripe subscription status error", error);
    return res.status(500).json({ error: "Could not load subscription status." });
  }
}
