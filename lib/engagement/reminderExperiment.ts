import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../prisma";
import { sendTransactionalEmail } from "../email";
import { buildTabReturnReminderEmail } from "../tabReturnReminder";
import { buildInactiveSignupReminderEmail } from "../inactiveSignupReminder";
import { decideForAccount } from "./server";
import { getEngagementEnrollment, reserveEngagementContact, finishEngagementContact, experimentProperties } from "./experiment";
import { createPostHogServerClient } from "../posthogServer";
import { buildContextualReminder } from "./reminderCopy";

type Candidate = { id: string; email: string; name: string | null; editorId: string | null; editorName: string | null };
export async function runEngagementReminders(req: NextApiRequest, res: NextApiResponse, campaign: "signup" | "tab") {
  // Called only AFTER the existing scheduler's authentication check.
  if (process.env.ENGAGEMENT_REMINDERS_ENABLED !== "true") return res.status(200).json({ mode: "reminders_disabled", sent: 0 });
  const now = new Date();
  const since = new Date(now.getTime() - 14 * 86400000), inactive = new Date(now.getTime() - 48 * 3600000);
  const candidates = campaign === "signup"
    ? await prisma.$queryRaw<Candidate[]>`SELECT u.id, u.email, u.name, NULL::text AS "editorId", NULL::text AS "editorName" FROM "User" u
      INNER JOIN "EngagementEmailPermission" p ON p."accountId" = u.id AND p.allowed = TRUE
      WHERE u."createdAt" <= ${new Date(now.getTime() - 6 * 3600000)} AND u."createdAt" >= ${new Date(now.getTime() - 12 * 3600000)}
        AND (u."emailVerified" IS NOT NULL OR u."emailVerifiedBool" = TRUE)
        AND u."subscriptionPlan" = 'FREE' AND u.role = 'FREE'
        AND NOT EXISTS (SELECT 1 FROM "TabJob" t WHERE t."userId" = u.id)
        AND NOT EXISTS (SELECT 1 FROM canvases c WHERE c.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM "VerificationToken" v WHERE v.identifier = 'reminder:inactive-transcriber:' || u.id)
      ORDER BY u."createdAt", u.id LIMIT 100`
    : await prisma.$queryRaw<Candidate[]>`SELECT DISTINCT ON (u.id) u.id, u.email, u.name, c.canvas_id AS "editorId", c.name AS "editorName" FROM "User" u
      INNER JOIN "EngagementEmailPermission" p ON p."accountId" = u.id AND p.allowed = TRUE
      INNER JOIN canvases c ON c.user_id = u.id
      WHERE c.updated_at <= ${inactive} AND c.updated_at >= ${since} AND c.draft_revision >= 2
        AND u."lastActiveAt" <= ${inactive} AND (u."emailVerified" IS NOT NULL OR u."emailVerifiedBool" = TRUE)
        AND u."subscriptionPlan" = 'FREE' AND u.role = 'FREE'
        AND EXISTS (SELECT 1 FROM lane_notes n INNER JOIN canvas_lanes l ON l.lane_key = n.lane_key WHERE l.canvas_id = c.canvas_id)
        AND NOT EXISTS (SELECT 1 FROM "VerificationToken" v WHERE v.expires > ${now} AND v.identifier IN ('reminder:return-to-tab:' || u.id || ':' || c.canvas_id, 'reminder:return-to-tab-cooldown:' || u.id))
      ORDER BY u.id, c.updated_at DESC LIMIT 100`;
  const counts = { scanned: candidates.length, assigned: 0, control: 0, notSelected: 0, sent: 0, failed: 0 };
  for (const user of candidates) {
    // Recheck suppression, permission, verification, activity, billing and editor
    // ownership just before reserving a contact, identically in every arm.
    const readEligibility = () => prisma.$queryRaw<Array<{ locale: string | null }>>`SELECT (
        SELECT s.payload->>'contentLocale' FROM "EngagementSignal" s WHERE s."accountId" = u.id ORDER BY s."at" DESC LIMIT 1) AS locale
      FROM "User" u INNER JOIN "EngagementEmailPermission" p ON p."accountId" = u.id AND p.allowed = TRUE
      WHERE u.id = ${user.id} AND u."subscriptionPlan" = 'FREE' AND u.role = 'FREE'
        AND (u."emailVerified" IS NOT NULL OR u."emailVerifiedBool" = TRUE)
        AND NOT EXISTS (SELECT 1 FROM "VerificationToken" v WHERE v.expires > ${now} AND v.identifier IN ('email:reminders-unsubscribed:' || u.id, 'email:reminders-delivery-suppressed:' || u.id, 'reminder:return-to-tab-cooldown:' || u.id))
        AND (${campaign} <> 'tab' OR (u."lastActiveAt" <= ${inactive} AND EXISTS (SELECT 1 FROM canvases c WHERE c.user_id = u.id AND c.canvas_id = ${user.editorId} AND c.updated_at <= ${inactive})))
        AND (${campaign} <> 'signup' OR (NOT EXISTS (SELECT 1 FROM "TabJob" t WHERE t."userId" = u.id) AND NOT EXISTS (SELECT 1 FROM canvases c WHERE c.user_id = u.id)))`;
    const valid = await readEligibility();
    if (!valid.length) continue;
    if (req.query.dryRun === "1") continue; // No assignments, claims, or deliveries in dry-run.
    const enrollment = await getEngagementEnrollment(user.id);
    counts.assigned++;
    if (enrollment.arm === "control") { counts.control++; continue; }
    let action = `existing_${campaign}`;
    let email;
    if (enrollment.arm === "existing") email = campaign === "signup"
      ? buildInactiveSignupReminderEmail({ name: user.name, userId: user.id, variant: "6h" })
      : buildTabReturnReminderEmail({ name: user.name, userId: user.id, editorId: user.editorId!, editorName: user.editorName });
    else {
      const { decision } = await decideForAccount(user.id, { channel: "email", paid: false, safeMoment: true,
        suppressed: false, marketingPermission: true, emailVerified: true, accessibleSavedWork: Boolean(user.editorId) });
      if (!decision.eligible) { counts.notSelected++; continue; }
      action = decision.action;
      email = buildContextualReminder({ accountId: user.id, action, editorId: user.editorId, locale: valid[0].locale });
    }
    const contactId = await reserveEngagementContact(enrollment, "email", action);
    if (!contactId) continue;
    try {
      if (!(await readEligibility()).length) { await finishEngagementContact(user.id, contactId, "cancelled"); continue; }
      const accepted = await sendTransactionalEmail({ to: user.email, ...email, analyticsCategory: "engagement_reminder_experiment" });
      await finishEngagementContact(user.id, contactId, accepted ? "accepted" : "failed");
      if (accepted) {
        counts.sent++;
        const ph = createPostHogServerClient();
        ph?.capture({ distinctId: user.id, event: "engagement_reminder_sent", properties: { ...experimentProperties(enrollment.arm), contact_id: contactId, action, campaign } });
        if (ph) await ph.flush().catch(() => { console.warn("engagement_reminder_analytics_failed"); });
      } else counts.failed++;
    } catch {
      // A transport timeout may have delivered mail. Keep reservation and avoid
      // automatic duplicate retries; provider evidence can reconcile it later.
      counts.failed++;
      await finishEngagementContact(user.id, contactId, "uncertain");
    }
  }
  return res.status(200).json({ mode: req.query.dryRun === "1" ? "dry_run" : "experiment", ...counts });
}
