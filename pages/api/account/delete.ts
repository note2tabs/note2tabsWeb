import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { stripeClient } from "../../../lib/stripe";
import {
  getStripePremiumConfig,
  stripeSubscriptionMatchesPremium,
} from "../../../lib/stripePremium";

const CANCELLABLE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "paused",
  "unpaid",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id || !session.user.email) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const premiumConfig = getStripePremiumConfig();
    if (session.user.role === "PREMIUM" && (!stripeClient || !premiumConfig)) {
      return res.status(503).json({
        error: "Subscription cancellation is temporarily unavailable. Your account was not deleted.",
      });
    }

    if (stripeClient && premiumConfig) {
      const customers = await stripeClient.customers.list({ email: session.user.email, limit: 100 });
      for (const customer of customers.data) {
        if ("deleted" in customer) continue;
        const subscriptions = await stripeClient.subscriptions.list({
          customer: customer.id,
          status: "all",
          limit: 100,
        });
        for (const subscription of subscriptions.data) {
          if (
            stripeSubscriptionMatchesPremium(subscription, premiumConfig) &&
            CANCELLABLE_SUBSCRIPTION_STATUSES.has(subscription.status)
          ) {
            await stripeClient.subscriptions.cancel(subscription.id);
          }
        }
      }
    }

    await prisma.tabJob.deleteMany({ where: { userId: session.user.id } });
    await prisma.account.deleteMany({ where: { userId: session.user.id } });
    await prisma.session.deleteMany({ where: { userId: session.user.id } });
    await prisma.user.delete({ where: { id: session.user.id } });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("delete account error", error);
    return res.status(500).json({ error: "Could not delete account." });
  }
}
