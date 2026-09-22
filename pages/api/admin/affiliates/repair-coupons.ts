import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../../lib/prisma";
import { stripeClient } from "../../../../lib/stripe";
import { couponSupportsProducts, getPaidPlanProductIds } from "../../../../lib/stripeCouponProducts";
import { hasFreshUserRole } from "../../../../lib/serverAuth";
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
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate || affiliate.status !== "ACTIVE") {
    return res.status(404).json({ error: "Active affiliate not found" });
  }
  if (!affiliate.stripeCouponId || !affiliate.stripePromotionCodeId) {
    return res.status(409).json({ error: "Affiliate coupon is not configured" });
  }

  const stripe = stripeClient;
  let replacementCouponId: string | null = null;
  let replacementPromotionId: string | null = null;
  let oldPromotionDisabled = false;
  try {
    const productIds = await getPaidPlanProductIds(stripe);
    if (!productIds.length) return res.status(503).json({ error: "Paid plan billing is not configured" });
    const currentCoupon = await stripe.coupons.retrieve(affiliate.stripeCouponId);
    if ("deleted" in currentCoupon || !currentCoupon.valid) {
      return res.status(409).json({ error: "Affiliate coupon is no longer valid" });
    }
    if (couponSupportsProducts(currentCoupon, productIds)) {
      return res.status(200).json({ repaired: false, affiliateId: affiliate.id });
    }

    const replacementCoupon = await stripe.coupons.create({
      percent_off: affiliate.discountPercent,
      duration: "repeating",
      duration_in_months: affiliate.discountMonths,
      applies_to: { products: productIds },
      name: `N2T ${affiliate.code}`,
      metadata: {
        note2tabsAffiliateId: affiliate.id,
        discountPercent: String(affiliate.discountPercent),
        discountMonths: String(affiliate.discountMonths),
        replacesCouponId: affiliate.stripeCouponId,
      },
    });
    replacementCouponId = replacementCoupon.id;

    await stripe.promotionCodes.update(affiliate.stripePromotionCodeId, { active: false });
    oldPromotionDisabled = true;
    const replacementPromotion = await stripe.promotionCodes.create({
      coupon: replacementCoupon.id,
      code: affiliate.code,
      active: true,
      metadata: {
        note2tabsAffiliateId: affiliate.id,
        note2tabsAffiliateCode: affiliate.code,
        replacesPromotionCodeId: affiliate.stripePromotionCodeId,
      },
    });
    replacementPromotionId = replacementPromotion.id;

    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: {
        stripeCouponId: replacementCoupon.id,
        stripePromotionCodeId: replacementPromotion.id,
      },
    });
    return res.status(200).json({ repaired: true, affiliateId: affiliate.id });
  } catch (error) {
    if (replacementPromotionId) {
      await stripe.promotionCodes.update(replacementPromotionId, { active: false }).catch(() => undefined);
    }
    if (oldPromotionDisabled) {
      await stripe.promotionCodes.update(affiliate.stripePromotionCodeId, { active: true }).catch(() => undefined);
    }
    if (replacementCouponId) {
      await stripe.coupons.del(replacementCouponId).catch(() => undefined);
    }
    console.error("affiliate coupon repair failed", { affiliateId: affiliate.id, error });
    return res.status(500).json({ error: "Could not repair the affiliate coupon" });
  }
}
