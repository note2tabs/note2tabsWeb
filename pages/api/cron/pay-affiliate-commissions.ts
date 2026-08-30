import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { stripeClient } from "../../../lib/stripe";

function authorized(req: NextApiRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!stripeClient) return res.status(503).json({ error: "Stripe not configured" });

  const commissions = await prisma.affiliateCommission.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: new Date() },
      stripeChargeId: { not: null },
      // Deactivation prevents future sales, but does not forfeit commissions
      // that were already earned and entered the payout queue.
      affiliate: { status: { in: ["ACTIVE", "DEACTIVATED"] }, stripeAccountId: { not: null } },
    },
    include: { affiliate: true },
    orderBy: { availableAt: "asc" },
    take: 100,
  });
  let paid = 0;
  let waitingForOnboarding = 0;
  let failed = 0;

  for (const commission of commissions) {
    const accountId = commission.affiliate.stripeAccountId;
    const chargeId = commission.stripeChargeId;
    if (!accountId || !chargeId) continue;
    try {
      const account = await stripeClient.accounts.retrieve(accountId);
      if ("deleted" in account || !account.payouts_enabled || !account.details_submitted) {
        waitingForOnboarding += 1;
        continue;
      }
      const transfer = await stripeClient.transfers.create({
        amount: commission.commissionAmount,
        currency: commission.currency,
        destination: accountId,
        source_transaction: chargeId,
        transfer_group: `affiliate_invoice_${commission.stripeInvoiceId}`,
        metadata: {
          note2tabsCommissionId: commission.id,
          note2tabsAffiliateId: commission.affiliateId,
        },
      }, { idempotencyKey: `affiliate-commission-${commission.id}` });
      await prisma.affiliateCommission.update({
        where: { id: commission.id },
        data: { status: "PAID", stripeTransferId: transfer.id, paidAt: new Date() },
      });
      paid += 1;
    } catch (error) {
      failed += 1;
      console.error("affiliate commission payout failed", { commissionId: commission.id, error });
    }
  }
  return res.status(200).json({ ok: true, scanned: commissions.length, paid, waitingForOnboarding, failed });
}
