import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { creditTopUpsEnabled } from "../../../lib/creditTopUpPricing";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  if (!creditTopUpsEnabled()) return res.status(404).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).end();
  if (typeof req.query.session_id !== "string") return res.status(400).end();
  const order = await prisma.creditTopUpOrder.findFirst({
    where: { checkoutSessionId: req.query.session_id, userId: session.user.id },
    select: { fulfilled: true, credits: true, revokedCredits: true },
  });
  if (!order) return res.status(404).end();
  return res.json({
    fulfilled: order.fulfilled,
    credits: order.credits - order.revokedCredits,
  });
}
