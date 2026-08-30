import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../lib/prisma";
import { stripeClient } from "../../../lib/stripe";
import { getAppBaseUrl } from "../../../lib/urls";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: "Not authenticated" });
  if (!stripeClient) return res.status(503).json({ error: "Stripe not configured" });
  const affiliate = await prisma.affiliate.findUnique({ where: { userId: session.user.id } });
  if (!affiliate?.stripeAccountId || affiliate.status !== "ACTIVE") {
    return res.status(404).json({ error: "No active affiliate account" });
  }
  try {
    const baseUrl = getAppBaseUrl(req);
    const link = await stripeClient.accountLinks.create({
      account: affiliate.stripeAccountId,
      refresh_url: `${baseUrl}/affiliate?onboarding=refresh`,
      return_url: `${baseUrl}/affiliate?onboarding=complete`,
      type: "account_onboarding",
    });
    return res.status(200).json({ url: link.url });
  } catch (error) {
    console.error("Affiliate Stripe onboarding link failed", error);
    return res.status(502).json({ error: "Stripe payout setup is temporarily unavailable. Please try again." });
  }
}
