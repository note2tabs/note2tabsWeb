import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { STANDALONE_PROMOTION_METADATA_KEY } from "../../../../../lib/standalonePromotion";
import { stripeClient } from "../../../../../lib/stripe";
import { hasFreshUserRole } from "../../../../../lib/serverAuth";
import { authOptions } from "../../../auth/[...nextauth]";

const ADMIN_ROLES = new Set(["ADMIN"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id || !(await hasFreshUserRole(session, ADMIN_ROLES))) return res.status(403).json({ error: "Forbidden" });
  if (!stripeClient) return res.status(503).json({ error: "Stripe not configured" });
  const promotionId = typeof req.body?.promotionId === "string" ? req.body.promotionId : "";
  if (!/^promo_[A-Za-z0-9]+$/.test(promotionId)) return res.status(400).json({ error: "Invalid promotion code." });
  try {
    const promotion = await stripeClient.promotionCodes.retrieve(promotionId);
    if (promotion.metadata?.[STANDALONE_PROMOTION_METADATA_KEY] !== "true") return res.status(404).json({ error: "Promotion code not found." });
    if (promotion.active) await stripeClient.promotionCodes.update(promotionId, { active: false });
    return res.status(200).json({ promotion: { id: promotionId, active: false } });
  } catch (error) {
    console.error("standalone promotion deactivation failed", error);
    return res.status(500).json({ error: "Could not deactivate the discount code." });
  }
}
