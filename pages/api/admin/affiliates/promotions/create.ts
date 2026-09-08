import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { STANDALONE_PROMOTION_METADATA_KEY, parseStandalonePromotionInput } from "../../../../../lib/standalonePromotion";
import { stripeClient } from "../../../../../lib/stripe";
import { getStripePaidPlanConfigs } from "../../../../../lib/stripePremium";
import { hasFreshUserRole } from "../../../../../lib/serverAuth";
import { authOptions } from "../../../auth/[...nextauth]";

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

  const input = parseStandalonePromotionInput(req.body);
  if (!input) return res.status(400).json({ error: "Enter a valid code, discount, duration, and future end date." });

  try {
    const existing = await stripeClient.promotionCodes.list({ code: input.code, active: true, limit: 1 });
    if (existing.data.length) return res.status(409).json({ error: "That code is already active." });

    const configs = Object.values(getStripePaidPlanConfigs()).filter((config): config is NonNullable<typeof config> => Boolean(config));
    const productIds = new Set<string>();
    for (const config of configs) {
      if (config.productId) productIds.add(config.productId);
      else {
        const price = await stripeClient.prices.retrieve(config.priceId);
        const productId = typeof price.product === "string" ? price.product : price.product?.id;
        if (productId) productIds.add(productId);
      }
    }
    if (!productIds.size) return res.status(503).json({ error: "Paid plan billing is not configured." });

    const metadata = {
      [STANDALONE_PROMOTION_METADATA_KEY]: "true",
      note2tabsPromotionCode: input.code,
    };
    const coupon = await stripeClient.coupons.create({
      percent_off: input.percentOff,
      duration: "repeating",
      duration_in_months: input.durationMonths,
      applies_to: { products: [...productIds] },
      name: `Note2Tabs promotion ${input.code}`,
      metadata,
      ...(input.expiresAt ? { redeem_by: input.expiresAt } : {}),
    });
    try {
      const promotion = await stripeClient.promotionCodes.create({
        coupon: coupon.id,
        code: input.code,
        active: true,
        metadata,
        ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
      });
      return res.status(201).json({
        promotion: {
          id: promotion.id,
          code: promotion.code,
          active: promotion.active,
          percentOff: input.percentOff,
          durationMonths: input.durationMonths,
          expiresAt: promotion.expires_at || input.expiresAt,
        },
      });
    } catch (error) {
      await stripeClient.coupons.del(coupon.id).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("standalone promotion creation failed", error);
    return res.status(500).json({ error: "Could not create the discount code. Please try again." });
  }
}
