import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";
import { STARTING_CREDITS } from "../../../lib/credits";
import { paymentRecoveryExpired } from "../../../lib/paymentRecovery";
import { prisma } from "../../../lib/prisma";
import { stripeClient } from "../../../lib/stripe";
import {
  getStripePaidPlanConfigs,
  stripeSubscriptionPlan,
} from "../../../lib/stripePremium";

function isAuthorized(req: NextApiRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.authorization === `Bearer ${secret}`;
}

async function customerEmail(customer: Stripe.Subscription["customer"]) {
  if (typeof customer !== "string") {
    return "deleted" in customer ? null : customer.email?.trim().toLowerCase() || null;
  }
  const result = await stripeClient!.customers.retrieve(customer);
  return result && !("deleted" in result) ? result.email?.trim().toLowerCase() || null : null;
}

async function failedAt(subscription: Stripe.Subscription) {
  const openInvoices = await stripeClient!.invoices.list({
    subscription: subscription.id,
    status: "open",
    limit: 100,
  });
  const oldestOpenInvoice = openInvoices.data
    .filter((invoice) => invoice.attempt_count > 0)
    .sort((left, right) => left.created - right.created)[0];
  if (oldestOpenInvoice?.created) {
    return new Date(oldestOpenInvoice.created * 1000);
  }
  const reference = subscription.latest_invoice;
  if (!reference) return null;
  const invoice = typeof reference === "string"
    ? await stripeClient!.invoices.retrieve(reference)
    : reference;
  return invoice.created ? new Date(invoice.created * 1000) : null;
}

async function hasAnotherEntitledPremium(
  subscription: Stripe.Subscription
) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const subscriptions = await stripeClient!.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  return subscriptions.data.some((candidate) =>
    candidate.id !== subscription.id &&
    Boolean(stripeSubscriptionPlan(candidate)) &&
    ["active", "trialing", "past_due"].includes(candidate.status)
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  if (!stripeClient || !Object.values(getStripePaidPlanConfigs()).some(Boolean)) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  const now = new Date();
  const subscriptions: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripeClient.subscriptions.list({
      status: "past_due",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    subscriptions.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  let checked = 0;
  let ended = 0;
  let retained = 0;

  for (const subscription of subscriptions) {
    if (!stripeSubscriptionPlan(subscription)) continue;
    checked += 1;
    const firstFailure = await failedAt(subscription);
    if (!firstFailure || !paymentRecoveryExpired(firstFailure, now)) continue;

    const email = await customerEmail(subscription.customer);
    const keepPremium = await hasAnotherEntitledPremium(subscription);
    await stripeClient.subscriptions.cancel(subscription.id);

    if (email && !keepPremium) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      });
      if (user?.role === "PREMIUM") {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "FREE", subscriptionPlan: "FREE", tokensRemaining: STARTING_CREDITS },
        });
      }
    } else if (keepPremium) {
      retained += 1;
    }
    ended += 1;
  }

  return res.status(200).json({ ok: true, checked, ended, retained });
}
