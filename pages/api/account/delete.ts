import { deleteAccountAndRecordCompletion } from "../../../lib/accountDeletion";
import { retryServerPostHogCaptures } from "../../../lib/posthogServer";
import { waitUntil } from "@vercel/functions";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { stripeClient } from "../../../lib/stripe";
import {
  getStripePaidPlanConfigs,
  stripeSubscriptionPlan,
} from "../../../lib/stripePremium";
import { getFreshUserRole } from "../../../lib/serverAuth";

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
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    const currentRole = await getFreshUserRole(session);
    if (!currentRole) {
      return res.status(404).json({
        error: "We could not find this account. It may already have been deleted; sign out and back in to refresh your session.",
      });
    }

    const paidConfigured = Object.values(getStripePaidPlanConfigs()).some(Boolean);
    if (currentRole === "PREMIUM" && (!stripeClient || !paidConfigured)) {
      return res.status(503).json({
        error: "Subscription cancellation is temporarily unavailable. Your account was not deleted.",
      });
    }

    if (stripeClient && paidConfigured) {
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
            stripeSubscriptionPlan(subscription) &&
            CANCELLABLE_SUBSCRIPTION_STATUSES.has(subscription.status)
          ) {
            await stripeClient.subscriptions.cancel(subscription.id);
          }
        }
      }
    }

    await deleteAccountAndRecordCompletion(session.user.id);
    // Completion is already durable. Provider failures must not fail deletion;
    // the existing scheduled outbox retry will deliver the same event UUID.
    const delivery = retryServerPostHogCaptures().catch(() => {
      console.warn("account_deletion_analytics_delivery_pending");
    });
    try { waitUntil(delivery); } catch { /* standalone/local execution */ }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("delete account error", error);
    return res.status(500).json({
      error: "We could not delete your account. Nothing was removed; please try again or contact support.",
    });
  }
}
