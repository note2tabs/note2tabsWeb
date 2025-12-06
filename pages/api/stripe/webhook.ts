import type { NextApiRequest, NextApiResponse } from "next";
import { stripeClient } from "../../../lib/stripe";
import { prisma } from "../../../lib/prisma";

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

  let event;
  try {
    const buf = await readBuffer(req);
    event = stripeClient.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed.", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const email = session?.customer_details?.email as string | undefined;
      const userId = session?.metadata?.userId as string | undefined;
      const identifier = userId
        ? { id: userId }
        : email
        ? { email: email.toLowerCase() }
        : null;
      if (identifier) {
        await prisma.user.updateMany({
          where: identifier,
          data: { role: "PREMIUM", tokensRemaining: 99999 },
        });
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error", error);
    return res.status(500).json({ error: "Webhook handler failed." });
  }
}
