import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { stripeClient } from "../../../lib/stripe";
import { loadPayoutRates } from "../../../lib/affiliatePayoutPolicy";
import { prepareAffiliatePayout, sendAffiliatePayout } from "../../../lib/affiliatePayouts";

function authorized(req: NextApiRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!stripeClient) return res.status(503).json({ error: "Stripe not configured" });

  const affiliates = await prisma.affiliate.findMany({
    where: {
      status: { in: ["ACTIVE", "DEACTIVATED"] }, stripeAccountId: { not: null },
      OR: [
        { commissions: { some: { status: "PENDING", availableAt: { lte: new Date() }, stripeChargeId: { not: null } } } },
        { payouts: { some: { status: "PENDING" } } },
      ],
    }, select: { id: true, stripeAccountId: true },
  });
  let paid = 0, failed = 0;
  if (!affiliates.length) return res.status(200).json({ ok: true, scanned: 0, paid, failed });
  try {
    const now = new Date();
    const rates = await loadPayoutRates(now);
    for (const affiliate of affiliates) {
      try {
        const payout = await prepareAffiliatePayout(affiliate.id, stripeClient, rates, now);
        if (payout && await sendAffiliatePayout(payout.id, affiliate.id, affiliate.stripeAccountId!, stripeClient)) paid += 1;
      } catch (error) {
        failed += 1;
        console.error("affiliate monthly payout failed", { affiliateId: affiliate.id, error });
      }
    }
  } catch (error) {
    console.error("affiliate payout rates unavailable", error);
    return res.status(503).json({ error: "Payout rates unavailable; commissions remain pending" });
  }
  return res.status(failed ? 502 : 200).json({ ok: failed === 0, scanned: affiliates.length, paid, failed });
}
