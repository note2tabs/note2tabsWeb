import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripeClient = secretKey ? new Stripe(secretKey) : null;
