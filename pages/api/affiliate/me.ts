import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../lib/prisma";
import { stripeClient } from "../../../lib/stripe";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: "Not authenticated" });
  const affiliate = await prisma.affiliate.findUnique({
    where: { userId: session.user.id },
    include: {
      commissions: { orderBy: { createdAt: "desc" }, take: 50 },
      _count: { select: { attributions: true } },
    },
  });
  if (!affiliate) return res.status(404).json({ error: "No affiliate account" });
  const account = affiliate.stripeAccountId && stripeClient
    ? await stripeClient.accounts.retrieve(affiliate.stripeAccountId)
    : null;
  const totals = affiliate.commissions.reduce(
    (sum, item) => ({
      pending: sum.pending + (item.status === "PENDING" ? item.commissionAmount : 0),
      paid: sum.paid + (item.status === "PAID" ? item.commissionAmount : 0),
    }),
    { pending: 0, paid: 0 }
  );
  return res.status(200).json({
    affiliate: {
      code: affiliate.code,
      status: affiliate.status,
      commissionPercent: affiliate.commissionPercent,
      commissionMonths: affiliate.commissionMonths,
      discountPercent: affiliate.discountPercent,
      discountMonths: affiliate.discountMonths,
      payoutsEnabled: Boolean(account && !("deleted" in account) && account.payouts_enabled),
      detailsSubmitted: Boolean(account && !("deleted" in account) && account.details_submitted),
      referralCount: affiliate._count.attributions,
      totals,
      commissions: affiliate.commissions.map((item) => ({
        id: item.id,
        amount: item.commissionAmount,
        currency: item.currency,
        status: item.status,
        availableAt: item.availableAt,
        createdAt: item.createdAt,
      })),
    },
  });
}
