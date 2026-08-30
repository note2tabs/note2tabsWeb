import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { DEFAULT_AFFILIATE_TERMS, normalizeAffiliateCode } from "../../../../lib/affiliate";
import { prisma } from "../../../../lib/prisma";
import { stripeClient } from "../../../../lib/stripe";
import { getStripePremiumConfig } from "../../../../lib/stripePremium";
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
  const premiumConfig = getStripePremiumConfig();
  if (!premiumConfig) return res.status(503).json({ error: "Premium billing is not configured" });
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const code = normalizeAffiliateCode(req.body?.code);
  if (!email || !code) return res.status(400).json({ error: "Email and valid code required" });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return res.status(404).json({ error: "Affiliate must have a Note2Tabs account" });
  const affiliate = await prisma.affiliate.create({
    data: { userId: user.id, code, ...DEFAULT_AFFILIATE_TERMS, status: "PENDING" },
  });
  try {
    const account = await stripeClient.accounts.create({
      type: "express",
      email: user.email,
      capabilities: { transfers: { requested: true } },
      metadata: { note2tabsAffiliateId: affiliate.id, note2tabsAffiliateCode: code },
    });
    const premiumPrice = await stripeClient.prices.retrieve(premiumConfig.priceId);
    const premiumProductId =
      premiumConfig.productId ||
      (typeof premiumPrice.product === "string" ? premiumPrice.product : premiumPrice.product?.id);
    if (!premiumProductId) throw new Error("Premium Stripe product could not be resolved");
    const coupon = await stripeClient.coupons.create({
      percent_off: affiliate.discountPercent,
      duration: "repeating",
      duration_in_months: affiliate.discountMonths,
      applies_to: { products: [premiumProductId] },
      name: `Note2Tabs affiliate ${code}`,
      metadata: { note2tabsAffiliateId: affiliate.id },
    });
    const promotionCode = await stripeClient.promotionCodes.create({
      coupon: coupon.id,
      code,
      active: true,
      metadata: { note2tabsAffiliateId: affiliate.id },
    });
    const active = await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: {
        status: "ACTIVE",
        stripeAccountId: account.id,
        stripeCouponId: coupon.id,
        stripePromotionCodeId: promotionCode.id,
      },
      select: { id: true, code: true, status: true },
    });
    return res.status(201).json({ affiliate: active });
  } catch (error) {
    await prisma.affiliate.update({ where: { id: affiliate.id }, data: { status: "ERROR" } });
    console.error("affiliate invite failed", error);
    return res.status(500).json({ error: "Could not create Stripe affiliate" });
  }
}
