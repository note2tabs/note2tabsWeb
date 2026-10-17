import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { decideForAccount, engagementCollectionEnabled } from "../../../lib/engagement/server";
import { getConsentFromCookies, parseRequestCookies } from "../../../lib/analyticsV2/cookies";

/** Shadow evaluation only: no email, UI exposure, credits, or coupons issued. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!engagementCollectionEnabled()) return res.status(200).json({ mode: "disabled" });
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).end();
  if (getConsentFromCookies(parseRequestCookies(req)) !== "granted") return res.status(200).json({ mode: "disabled" });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { subscriptionPlan: true, role: true } });
  if (!user) return res.status(401).end();
  try {
    const result = await decideForAccount(session.user.id, {
      channel: "premium", paid: user.subscriptionPlan !== "FREE" || ["PREMIUM", "PRO", "ADMIN", "MOD", "MODERATOR"].includes(user.role),
      marketingPermission: false, emailVerified: false, suppressed: false,
      safeMoment: req.body?.safeMoment === true, accessibleSavedWork: false,
    });
    return res.status(200).json({ mode: "shadow", decision: result.decision });
  } catch {
    console.warn("engagement_decision_unavailable");
    return res.status(200).json({ mode: "unavailable" });
  }
}
