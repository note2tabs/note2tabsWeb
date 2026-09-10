import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import type Stripe from "stripe";
import { stripeClient } from "../../../lib/stripe";
import {
  getStripePaidPlanConfigs,
  stripeSubscriptionPlan,
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

  if (!stripeClient || !Object.values(getStripePaidPlanConfigs()).some(Boolean)) {
    return res.status(503).json({ error: "Stripe not configured yet." });
  }
  const stripe = stripeClient;

  res.setHeader("Cache-Control", "private, no-store");

  try {
    const customers = await stripe.customers.list({
      email: session.user.email,
      limit: 10,
    });
    const validCustomers = customers.data.filter(
      (customer): customer is Stripe.Customer => Boolean(customer && !("deleted" in customer))
    );
    const subscriptionPages = await Promise.all(
      validCustomers.map((customer) =>
        stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })
      )
    );
    const subscriptions: Stripe.Subscription[] = subscriptionPages.flatMap((result) =>
      result.data.filter((subscription) => Boolean(stripeSubscriptionPlan(subscription)))
    );

    const subscription = subscriptions
      .filter((candidate) => VISIBLE_STATUSES.has(candidate.status))
      .sort((left, right) => right.created - left.created)[0];

    if (!subscription) {
      return res.status(200).json({ subscription: null });
    }

    return res.status(200).json({
      subscription: {
        status: subscription.status,
        plan: stripeSubscriptionPlan(subscription)?.toLowerCase(),
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
