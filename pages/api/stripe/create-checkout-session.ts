import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { stripeClient } from "../../../lib/stripe";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email || !session.user.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!stripeClient || !process.env.STRIPE_PRICE_PREMIUM_MONTHLY) {
    return res.status(503).json({ error: "Stripe not configured yet." });
  }

  try {
    const checkout = await stripeClient.checkout.sessions.create({
      customer_email: session.user.email,
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_PREMIUM_MONTHLY, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/account?upgrade=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/account?upgrade=cancel`,
      metadata: { userId: session.user.id },
    });
    return res.status(200).json({ url: checkout.url });
  } catch (error) {
    console.error("stripe checkout error", error);
    return res.status(500).json({ error: "Could not create checkout session." });
  }
}
