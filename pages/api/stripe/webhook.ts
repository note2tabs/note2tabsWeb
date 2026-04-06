import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";
import { stripeClient } from "../../../lib/stripe";
import { prisma } from "../../../lib/prisma";
import { STARTING_CREDITS } from "../../../lib/credits";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readBuffer(req: NextApiRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

type UserIdentifier = { id: string } | { email: string };

const normalizeEmail = (email?: string | null) => {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
};

async function resolveUserIdentifierFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<UserIdentifier | null> {
  const userIdRaw = session?.metadata?.userId;
  if (typeof userIdRaw === "string" && userIdRaw.trim()) {
    return { id: userIdRaw.trim() };
  }

  const detailsEmail = normalizeEmail(session?.customer_details?.email || null);
  if (detailsEmail) return { email: detailsEmail };

  const customerEmail = normalizeEmail(
    typeof session?.customer_email === "string" ? session.customer_email : null
  );
  if (customerEmail) return { email: customerEmail };

  if (!stripeClient || typeof session?.customer !== "string" || !session.customer) {
    return null;
  }
  try {
    const customer = await stripeClient.customers.retrieve(session.customer);
    if (customer && !("deleted" in customer)) {
      const email = normalizeEmail(customer.email);
      if (email) return { email };
    }
  } catch (error) {
    console.error("Webhook customer lookup failed.", error);
  }
  return null;
}

async function resolveEmailFromCustomerRef(
  customerRef: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!customerRef) return null;
  if (typeof customerRef === "object") {
    if ("deleted" in customerRef) return null;
    return normalizeEmail(customerRef.email);
  }
  if (!stripeClient || typeof customerRef !== "string" || !customerRef.trim()) {
    return null;
  }
  try {
    const customer = await stripeClient.customers.retrieve(customerRef);
    if (customer && !("deleted" in customer)) {
      return normalizeEmail(customer.email);
    }
  } catch (error) {
    console.error("Webhook customer retrieval failed.", error);
  }
  return null;
}

async function setPremiumForIdentifier(identifier: UserIdentifier) {
  const user = await prisma.user.findFirst({
    where: identifier,
    select: { id: true, role: true },
  });
  if (!user) return;
  if (user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD") {
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "PREMIUM", tokensRemaining: 99999 },
  });
}

async function downgradePremiumByEmail(email: string) {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase() },
    select: { id: true, role: true },
  });
  if (!user || user.role !== "PREMIUM") return;
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "FREE", tokensRemaining: STARTING_CREDITS },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!stripeClient || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Stripe not configured yet." });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    return res.status(400).json({ error: "Missing signature" });
  }

  let event: Stripe.Event;
  try {
    const buf = await readBuffer(req);
    event = stripeClient.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed.", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      const identifier = await resolveUserIdentifierFromCheckoutSession(checkoutSession);
      if (identifier) {
        await setPremiumForIdentifier(identifier);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const email = await resolveEmailFromCustomerRef(subscription.customer);
      if (email) {
        await downgradePremiumByEmail(email);
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.status === "canceled") {
        const email = await resolveEmailFromCustomerRef(subscription.customer);
        if (email) {
          await downgradePremiumByEmail(email);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error", error);
    return res.status(500).json({ error: "Webhook handler failed." });
  }
}
