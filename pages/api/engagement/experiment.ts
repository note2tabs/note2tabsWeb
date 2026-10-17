import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { getConsentFromCookies, parseRequestCookies } from "../../../lib/analyticsV2/cookies";
import { decideForAccount } from "../../../lib/engagement/server";
import { experimentEnabled, engagementQaConfigured, engagementQaAccount, getEngagementEnrollment, reserveEngagementContact, finishEngagementContact, recordExperimentDecision } from "../../../lib/engagement/experiment";
import { contextualPremiumAllowed, contextualValueScore } from "../../../lib/engagement/experimentConfig";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!experimentEnabled() && !engagementQaConfigured()) return res.status(200).json({ mode: "disabled" });
  const session = await getServerSession(req, res, authOptions);
  if (!experimentEnabled() && (!session?.user?.id || !engagementQaAccount(session.user.id))) return res.status(200).json({ mode: "disabled" });
  if (!session?.user?.id) return res.status(401).end();
  if (getConsentFromCookies(parseRequestCookies(req)) !== "granted") return res.status(200).json({ mode: "excluded" });
  const id = session.user.id;
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { role: true, subscriptionPlan: true } });
    const paid = !user || user.subscriptionPlan !== "FREE" || user.role !== "FREE";
    if (paid) return res.status(200).json({ mode: "excluded" });
    const enrollment = await getEngagementEnrollment(id);
    const operation = req.body?.operation;
    if (operation === "visible" || operation === "cancelled") {
      if (typeof req.body.contactId !== "string" || req.body.contactId.length > 100) return res.status(400).end();
      await finishEngagementContact(id, req.body.contactId, operation);
      return res.status(200).json({ mode: "active", arm: enrollment.arm });
    }
    if (operation !== "claim") return res.status(200).json({ mode: "active", arm: enrollment.arm });
    if (enrollment.arm === "control") return res.status(200).json({ mode: "active", arm: enrollment.arm, show: false });
    const { snapshot } = await decideForAccount(id, { channel: "premium", paid, safeMoment: req.body.safeMoment === true,
      suppressed: false, marketingPermission: false, emailVerified: false, accessibleSavedWork: false });
    const commonSafety = snapshot.complete && !snapshot.checkoutActive && !snapshot.unresolvedFailure;
    const allowed = commonSafety && (enrollment.arm === "existing" ? req.body.checkpoint === "legacy" && req.body.safeMoment === true
      : req.body.checkpoint === "playback_pause" && contextualPremiumAllowed(snapshot, paid, req.body.safeMoment === true));
    await recordExperimentDecision(enrollment, "premium", enrollment.arm === "existing" ? "legacy" : "playback_pause", allowed, { score: contextualValueScore(snapshot), snapshot });
    if (!allowed) return res.status(200).json({ mode: "active", arm: enrollment.arm, show: false });
    const contactId = await reserveEngagementContact(enrollment, "premium", enrollment.arm === "existing" ? "legacy_prompt" : "contextual_value");
    return res.status(200).json({ mode: "active", arm: enrollment.arm, show: Boolean(contactId), contactId, score: contextualValueScore(snapshot) });
  } catch {
    console.error("engagement_experiment_unavailable");
    // Fail closed for optional promotion. Never fall back into another arm.
    return res.status(503).json({ mode: "unavailable", show: false });
  }
}
