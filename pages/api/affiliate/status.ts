import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../lib/prisma";
import { authOptions } from "../auth/[...nextauth]";

/** Menu visibility only; the dashboard keeps its own authentication checks.
 * Avoid loading commissions or contacting Stripe just to display a link. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: "Not authenticated" });
  const affiliate = await prisma.affiliate.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  return res.status(200).json({ isAffiliate: Boolean(affiliate) });
}
