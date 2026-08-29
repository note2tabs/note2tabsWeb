import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { stripeClient } from "../../../lib/stripe";
import { getStripePremiumConfig } from "../../../lib/stripePremium";
import { inspectPremiumCustomerState } from "../../../lib/stripePremiumOffer";
import { getFreshUserRole } from "../../../lib/serverAuth";

const PREMIUM_ACCESS_ROLES = new Set(["PREMIUM", "ADMIN", "MODERATOR", "MOD"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id || !session.user.email) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
  const role = await getFreshUserRole(session);
  if (!role) return res.status(401).json({ error: "Account not found" });

  if (PREMIUM_ACCESS_ROLES.has(role)) {
    return res.status(200).json({ trialEligible: false, hasPremiumAccess: true });
  }

  const premiumConfig = getStripePremiumConfig();
  if (!stripeClient || !premiumConfig) {
    return res.status(503).json({
      error: "Premium details are temporarily unavailable. Please try again shortly.",
    });
  }

  try {
    const state = await inspectPremiumCustomerState({
      stripe: stripeClient,
      email: session.user.email,
      config: premiumConfig,
    });
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json({
      trialEligible: state.trialEligible,
      hasPremiumAccess: false,
    });
  } catch (error) {
    console.error("premium offer eligibility error", error);
    return res.status(500).json({ error: "Could not check Premium eligibility." });
  }
}
