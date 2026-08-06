import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { stripeClient } from "../../../lib/stripe";
import { getAppBaseUrl } from "../../../lib/urls";
import {
  getStripePremiumConfig,
  stripeSubscriptionMatchesPremium,
} from "../../../lib/stripePremium";

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

  try {
    const customers = await stripeClient.customers.list({
      email: session.user.email,
      limit: 10,
    });
    let customer = null as (typeof customers.data)[number] | null;
    for (const entry of customers.data) {
      if (!entry || "deleted" in entry) continue;
      const subscriptions = await stripeClient.subscriptions.list({
        customer: entry.id,
        status: "all",
        limit: 100,
      });
      if (subscriptions.data.some((subscription) => stripeSubscriptionMatchesPremium(subscription, premiumConfig))) {
        customer = entry;
        break;
      }
    }
    if (!customer) {
      return res.status(404).json({
        error: "No active subscription customer was found for this account.",
      });
    }

    const baseUrl = getAppBaseUrl(req);
    const portal = await stripeClient.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${baseUrl}/settings`,
    });

    return res.status(200).json({ url: portal.url });
  } catch (error) {
    console.error("stripe portal error", error);
    return res.status(500).json({ error: "Could not open subscription management." });
  }
}
