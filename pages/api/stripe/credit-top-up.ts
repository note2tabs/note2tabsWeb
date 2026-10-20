import type Stripe from "stripe";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { stripeClient } from "../../../lib/stripe";
import { prisma } from "../../../lib/prisma";
import {
  creditTopUpQuote,
  creditTopUpsEnabled,
} from "../../../lib/creditTopUpPricing";
import { normalizeLocale, localeHref } from "../../../lib/i18n/locale";
import { getAppBaseUrl } from "../../../lib/urls";
import { stripeLocale } from "../../../lib/i18n/checkout";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!creditTopUpsEnabled() || !stripeClient)
    return res.status(404).json({ error: "Credit purchases are unavailable." });
  const origin = req.headers.origin;
  try {
    if (
      !origin ||
      new URL(origin).origin !== new URL(getAppBaseUrl(req)).origin
    )
      throw new Error();
  } catch {
    return res.status(403).json({ error: "Invalid request origin." });
  }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id)
    return res.status(401).json({ error: "Sign in to buy credits." });
  let quote;
  try {
    quote = creditTopUpQuote(req.body?.credits);
  } catch {
    return res
      .status(400)
      .json({ error: "Choose at least 15 credits, in increments of 15." });
  }
  const locale = normalizeLocale(req.body?.locale);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });
  if (!user) return res.status(401).end();
  if (!process.env.STRIPE_CREDIT_TOPUP_PRODUCT_ID)
    return res
      .status(503)
      .json({ error: "Credit purchases are not configured yet." });
  const order = await prisma.creditTopUpOrder.create({
    data: {
      userId: user.id,
      ...{
        credits: quote.credits,
        amountCents: quote.amountCents,
        currency: quote.currency,
      },
    },
  });
  try {
    const base = getAppBaseUrl(req),
      path = localeHref("/credits", locale);
    const params = {
      mode: "payment",
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { creditTopUpOrderId: order.id, note2tabsLocale: locale },
      payment_intent_data: { metadata: { creditTopUpOrderId: order.id } },
      locale: stripeLocale(locale),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: quote.amountCents,
            tax_behavior: "inclusive",
            product: process.env.STRIPE_CREDIT_TOPUP_PRODUCT_ID,
          },
        },
      ],
      success_url: `${base}${path}?credits=${quote.credits}&payment=processing&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${path}?credits=${quote.credits}&payment=cancelled`,
      adaptive_pricing: { enabled: false },
    } as Stripe.Checkout.SessionCreateParams & {
      adaptive_pricing: { enabled: boolean };
    };
    const checkout = await stripeClient.checkout.sessions.create(params, {
      idempotencyKey: `credit-top-up:${order.id}`,
    });
    await prisma.creditTopUpOrder.update({
      where: { id: order.id },
      data: { checkoutSessionId: checkout.id },
    });
    return res.status(200).json({ url: checkout.url, orderId: order.id });
  } catch {
    return res
      .status(503)
      .json({ error: "Could not open checkout. Please try again." });
  }
}
