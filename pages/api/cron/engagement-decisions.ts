import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { isAuthorizedSchedulerRequest } from "../../../lib/cloudSchedulerAuth";
import { decideForAccount, engagementCollectionEnabled } from "../../../lib/engagement/server";
import { DAY } from "../../../lib/engagement/policy";

/** Scheduled shadow recommendations only. Marketing permission is not assumed. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(req.method || "")) { res.setHeader("Allow", "GET, POST"); return res.status(405).end(); }
  if (!await isAuthorizedSchedulerRequest(req.headers.authorization)) return res.status(401).end();
  if (!engagementCollectionEnabled()) return res.status(200).json({ mode: "disabled" });
  const now = Date.now();
  try {
    // Bound storage; deletion cascades on account deletion as well.
    await prisma.$executeRaw`DELETE FROM "EngagementSignal" WHERE "at" < ${new Date(now - 31 * DAY)}`;
    await prisma.$executeRaw`DELETE FROM "EngagementDecision" WHERE "at" < ${new Date(now - 90 * DAY)}`;
    const cursor = typeof req.query.after === "string" ? req.query.after : "";
    const candidates = await prisma.$queryRaw<Array<{ accountId: string }>>`
      SELECT DISTINCT "accountId" FROM "EngagementSignal"
      WHERE "at" >= ${new Date(now - 14 * DAY)} AND "accountId" > ${cursor}
      ORDER BY "accountId" LIMIT 100`;
    const counts: Record<string, number> = {};
    for (const row of candidates) {
      const user = await prisma.user.findUnique({ where: { id: row.accountId }, select: { role: true, subscriptionPlan: true, emailVerified: true, emailVerifiedBool: true } });
      if (!user) continue;
      const work = await prisma.$queryRaw<Array<{ present: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM canvases WHERE user_id = ${row.accountId}) AS present`;
      const { decision, behavioralRecommendation } = await decideForAccount(row.accountId, {
        channel: "email", paid: user.subscriptionPlan !== "FREE" || ["PREMIUM", "PRO", "ADMIN", "MOD", "MODERATOR"].includes(user.role),
        marketingPermission: false, emailVerified: Boolean(user.emailVerified || user.emailVerifiedBool),
        suppressed: false, safeMoment: true, accessibleSavedWork: Boolean(work[0]?.present),
      }, now);
      const reason = decision.action === "none" ? decision.reasons[0] : decision.action;
      counts[reason] = (counts[reason] || 0) + 1;
      if (behavioralRecommendation.eligible) {
        const key = `behavioral_only:${behavioralRecommendation.action}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return res.status(200).json({ mode: "shadow", evaluated: candidates.length, counts,
      nextCursor: candidates.length === 100 ? candidates.at(-1)?.accountId : null });
  } catch {
    console.error("engagement_shadow_run_failed");
    return res.status(500).json({ error: "Engagement shadow evaluation failed" });
  }
}
