import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../../lib/prisma";
import { hasFreshUserRole } from "../../../../lib/serverAuth";
import { stripeClient } from "../../../../lib/stripe";
import { authOptions } from "../../auth/[...nextauth]";

const ADMIN_ROLES = new Set(["ADMIN"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id || !(await hasFreshUserRole(session, ADMIN_ROLES))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!stripeClient) return res.status(503).json({ error: "Stripe not configured" });

  const affiliateId = typeof req.body?.affiliateId === "string" ? req.body.affiliateId.trim() : "";
  if (!affiliateId) return res.status(400).json({ error: "Affiliate required" });

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { id: true, code: true, status: true, stripePromotionCodeId: true },
  });
  if (!affiliate) return res.status(404).json({ error: "Affiliate not found" });
  if (affiliate.status === "DEACTIVATED") {
    return res.status(200).json({ affiliate: { ...affiliate, status: "DEACTIVATED" } });
  }

  try {
    // Keep the Connect account open so commissions earned before deactivation
    // can still be transferred. Only future referral redemption is disabled.
    if (affiliate.stripePromotionCodeId) {
      await stripeClient.promotionCodes.update(affiliate.stripePromotionCodeId, { active: false });
    }
    const deactivated = await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { status: "DEACTIVATED" },
      select: { id: true, code: true, status: true },
    });
    return res.status(200).json({ affiliate: deactivated });
  } catch (error) {
    console.error("affiliate deactivation failed", { affiliateId: affiliate.id, error });
    return res.status(500).json({ error: "Could not deactivate affiliate" });
  }
}
