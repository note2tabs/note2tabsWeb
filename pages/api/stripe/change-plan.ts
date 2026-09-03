import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { stripeClient } from "../../../lib/stripe";
import { getStripePaidPlanConfig, stripeSubscriptionPlan } from "../../../lib/stripePremium";
import { getFreshUserAccess } from "../../../lib/serverAuth";
import { PLAN_CATALOG, proPlanCheckoutEnabled, type PaidSubscriptionPlan } from "../../../lib/subscriptionPlans";
import { createPostHogServerClient } from "../../../lib/posthogServer";

const ENTITLED = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id || !session.user.email) return res.status(401).json({ error: "Sign in again." });
  const access = await getFreshUserAccess(session);
  if (!access || access.role !== "PREMIUM") return res.status(403).json({ error: "No paid plan was found." });

  const rawPlan = typeof req.body?.plan === "string" ? req.body.plan.toLowerCase() : "";
  if (rawPlan !== "premium" && rawPlan !== "pro") {
    return res.status(400).json({ error: "Choose either Premium or Pro." });
  }
  const requestedPlan: PaidSubscriptionPlan = rawPlan === "pro" ? "PRO" : "PREMIUM";
  if (requestedPlan === "PRO" && !proPlanCheckoutEnabled()) {
    return res.status(503).json({ error: "Pro is not available yet." });
  }
  const targetConfig = getStripePaidPlanConfig(requestedPlan);
  if (!stripeClient || !targetConfig) return res.status(503).json({ error: "That plan is not available yet." });

  try {
    const customers = await stripeClient.customers.list({ email: session.user.email, limit: 10 });
    let current: Stripe.Subscription | null = null;
    for (const customer of customers.data) {
      if ("deleted" in customer) continue;
      const page = await stripeClient.subscriptions.list({ customer: customer.id, status: "all", limit: 100 });
      current = page.data.find((item) => ENTITLED.has(item.status) && Boolean(stripeSubscriptionPlan(item))) || current;
      if (current) break;
    }
    if (!current) return res.status(404).json({ error: "No active subscription was found." });
    const currentPlan = stripeSubscriptionPlan(current);
    if (!currentPlan) return res.status(409).json({ error: "This subscription cannot be changed here." });
    if (currentPlan === requestedPlan) return res.status(200).json({ changed: false, plan: rawPlan });
    const item = current.items.data[0];
    if (!item) return res.status(409).json({ error: "The subscription has no plan item." });

    if (currentPlan === "PREMIUM" && requestedPlan === "PRO") {
      await stripeClient.subscriptions.update(current.id, {
        items: [{ id: item.id, price: targetConfig.priceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
        metadata: { ...current.metadata, note2tabsPlan: "pro", note2tabsPriceId: targetConfig.priceId },
      });
    } else {
      let scheduleId = typeof current.schedule === "string" ? current.schedule : current.schedule?.id;
      if (!scheduleId) {
        const schedule = await stripeClient.subscriptionSchedules.create({ from_subscription: current.id });
        scheduleId = schedule.id;
      }
      await stripeClient.subscriptionSchedules.update(scheduleId, {
        end_behavior: "release",
        phases: [
          {
            start_date: current.current_period_start,
            end_date: current.current_period_end,
            items: [{ price: item.price.id, quantity: item.quantity || 1 }],
          },
          {
            start_date: current.current_period_end,
            items: [{ price: targetConfig.priceId, quantity: item.quantity || 1 }],
            metadata: { note2tabsPlan: "premium", note2tabsPriceId: targetConfig.priceId },
          },
        ],
      });
    }

    const posthog = createPostHogServerClient();
    posthog?.capture({
      distinctId: session.user.id,
      event: currentPlan === "PREMIUM" ? "subscription_upgraded" : "subscription_downgrade_scheduled",
      properties: {
        from_plan: PLAN_CATALOG[currentPlan].analyticsId,
        to_plan: PLAN_CATALOG[requestedPlan].analyticsId,
        effective: currentPlan === "PREMIUM" ? "immediate" : "renewal",
      },
    });
    try { await posthog?.flush(); } catch { /* Billing must not depend on analytics. */ }
    return res.status(200).json({
      changed: true,
      plan: rawPlan,
      effective: currentPlan === "PREMIUM" ? "immediate" : "renewal",
    });
  } catch (error) {
    console.error("stripe plan change error", error);
    return res.status(500).json({ error: "Could not change the subscription. Please try again." });
  }
}
