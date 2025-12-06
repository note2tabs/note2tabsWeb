import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripeClient = secretKey
  ? new Stripe(secretKey, {
      apiVersion: "2023-10-16",
    })
  : null;
