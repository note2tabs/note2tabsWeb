import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripeClient = secretKey
  ? new Stripe(secretKey, {
      apiVersion: "2024-06-20",
    })
  : null;
