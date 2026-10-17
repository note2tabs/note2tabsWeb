import { accountEmailLocale } from "../i18n/accountLanguage";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../prisma";
import { sendTransactionalEmail } from "../email";
import { buildTabReturnReminderEmail } from "../tabReturnReminder";
import { buildInactiveSignupReminderEmail } from "../inactiveSignupReminder";
import { decideForAccount } from "./server";
import { ENGAGEMENT_EXPERIMENT, getEngagementEnrollment, reserveEngagementContact, finishEngagementContact, experimentProperties, recordExperimentDecision } from "./experiment";
import { createPostHogServerClient } from "../posthogServer";
import {captureReminderDeliveryFailure,captureReminderFailure,captureReminderRun} from "../reminderMonitoring";
import { buildContextualReminder } from "./reminderCopy";

type Candidate = { id: string; email: string; name: string | null; editorId: string | null; editorName: string | null };
export async function runEngagementReminders(req: NextApiRequest, res: NextApiResponse, campaign: "signup" | "tab") {
  const startedAt=Date.now();
  const ph=createPostHogServerClient();
  try {return await dispatchEngagementReminders(req,res,campaign,startedAt);} catch(error) {
    captureReminderFailure(ph,campaign === "signup" ? "inactive_signup" : "tab_return",startedAt,error);
    return res.status(503).json({mode:"unavailable",error:"Reminder dispatch unavailable"});
  } finally {if(ph)await ph.flush().catch(()=>{console.warn("engagement_scheduler_analytics_failed");});}
}
async function dispatchEngagementReminders(req: NextApiRequest, res: NextApiResponse, campaign: "signup" | "tab", startedAt:number) {
  // Called only AFTER the existing scheduler's authentication check.
  if (process.env.ENGAGEMENT_REMINDERS_ENABLED !== "true") return res.status(200).json({ mode: "reminders_disabled", sent: 0 });
  const now = new Date();
  const since = new Date(now.getTime() - 14 * 86400000), inactive = new Date(now.getTime() - 48 * 3600000);
  const recentContact=new Date(now.getTime()-7*86400000), recentDecision=new Date(now.getTime()-12*3600000);
  const candidates = campaign === "signup"
    ? await prisma.$queryRaw<Candidate[]>`SELECT u.id, u.email, u.name, NULL::text AS "editorId", NULL::text AS "editorName" FROM "User" u
      INNER JOIN "EngagementEmailPermission" p ON p."accountId" = u.id AND p.allowed = TRUE
      WHERE u."createdAt" <= ${new Date(now.getTime() - 6 * 3600000)} AND u."createdAt" >= ${new Date(now.getTime() - 12 * 3600000)}
        AND (u."emailVerified" IS NOT NULL OR u."emailVerifiedBool" = TRUE)
        AND u."subscriptionPlan" = 'FREE' AND u.role = 'FREE'
        AND NOT EXISTS (SELECT 1 FROM "VerificationToken" v WHERE v.expires > ${now} AND v.identifier IN ('email:reminders-unsubscribed:' || u.id, 'email:reminders-delivery-suppressed:' || u.id))
        AND NOT EXISTS (SELECT 1 FROM "EngagementEnrollment" e WHERE e."accountId"=u.id AND e.version=${ENGAGEMENT_EXPERIMENT} AND e.arm='control')
        AND NOT EXISTS (SELECT 1 FROM "EngagementContact" e WHERE e."accountId"=u.id AND e.channel='email' AND e."createdAt">${recentContact})
        AND NOT EXISTS (SELECT 1 FROM "EngagementDecision" e WHERE e."accountId"=u.id AND e.channel='email' AND e.at>${recentDecision} AND e.payload->>'mode'='experiment')
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
        AND NOT EXISTS (SELECT 1 FROM "VerificationToken" v WHERE v.expires > ${now} AND v.identifier IN ('email:reminders-unsubscribed:' || u.id, 'email:reminders-delivery-suppressed:' || u.id))
        AND NOT EXISTS (SELECT 1 FROM "EngagementEnrollment" e WHERE e."accountId"=u.id AND e.version=${ENGAGEMENT_EXPERIMENT} AND e.arm='control')
        AND NOT EXISTS (SELECT 1 FROM "EngagementContact" e WHERE e."accountId"=u.id AND e.channel='email' AND e."createdAt">${recentContact})
        AND NOT EXISTS (SELECT 1 FROM "EngagementDecision" e WHERE e."accountId"=u.id AND e.channel='email' AND e.at>${recentDecision} AND e.payload->>'mode'='experiment')
        AND EXISTS (SELECT 1 FROM lane_notes n INNER JOIN canvas_lanes l ON l.lane_key = n.lane_key WHERE l.canvas_id = c.canvas_id)
        AND NOT EXISTS (SELECT 1 FROM "VerificationToken" v WHERE v.expires > ${now} AND v.identifier IN ('reminder:return-to-tab:' || u.id || ':' || c.canvas_id, 'reminder:return-to-tab-cooldown:' || u.id))
      ORDER BY u.id, c.updated_at DESC LIMIT 100`;
  const counts = { scanned: candidates.length, assigned: 0, control: 0, notSelected: 0, sent: 0, failed: 0 };
  for (const user of candidates) {
    // Recheck suppression, permission, verification, activity, billing and editor
    // ownership just before reserving a contact, identically in every arm.
    const readEligibility = () => prisma.$queryRaw<Array<{ id: string }>>`SELECT u.id
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
    const locale = await accountEmailLocale(user.id);
    let action = `existing_${campaign}`;
    let email;
    if (enrollment.arm === "existing") email = campaign === "signup"
      ? buildInactiveSignupReminderEmail({ name: user.name, userId: user.id, locale, variant: "6h" })
      : buildTabReturnReminderEmail({ name: user.name, userId: user.id, editorId: user.editorId!, editorName: user.editorName, locale });
    else {
      const { decision } = await decideForAccount(user.id, { channel: "email", paid: false, safeMoment: true,
        suppressed: false, marketingPermission: true, emailVerified: true, accessibleSavedWork: Boolean(user.editorId) });
      await recordExperimentDecision(enrollment,"email",campaign,decision.eligible,{action:decision.action,reasons:decision.reasons});
      if (!decision.eligible) { counts.notSelected++; continue; }
      action = decision.action;
      email = buildContextualReminder({ accountId: user.id, action, editorId: user.editorId, locale });
    }
    const contactId = await reserveEngagementContact(enrollment, "email", action);
    if (!contactId) {await recordExperimentDecision(enrollment,"email",campaign,false,{reason:"contact_cap"});continue;}
    try {
      if (!(await readEligibility()).length) { await finishEngagementContact(user.id, contactId, "cancelled"); continue; }
      const accepted = await sendTransactionalEmail({ language:{kind:"customer",template:enrollment.arm === "contextual" ? "contextual_reminder" : campaign === "signup" ? "inactive_signup" : "tab_return",locale,accountId:user.id}, to: user.email, ...email, analyticsCategory: "engagement_reminder_experiment" });
      await finishEngagementContact(user.id, contactId, accepted ? "accepted" : "failed");
      if (accepted) {
        counts.sent++;
        const ph = createPostHogServerClient();
        ph?.capture({ distinctId: user.id, event: "engagement_reminder_sent", properties: { ...experimentProperties(enrollment.arm), contact_id: contactId, action, campaign } });
        if (ph) await ph.flush().catch(() => { console.warn("engagement_reminder_analytics_failed"); });
      } else {
        counts.failed++;
        captureReminderDeliveryFailure(createPostHogServerClient(),campaign === "signup" ? "inactive_signup" : "tab_return",user.id,null);
      }
    } catch(error) {
      // A transport timeout may have delivered mail. Keep reservation and avoid
      // automatic duplicate retries; provider evidence can reconcile it later.
      counts.failed++;
      captureReminderDeliveryFailure(createPostHogServerClient(),campaign === "signup" ? "inactive_signup" : "tab_return",user.id,error);
      await finishEngagementContact(user.id, contactId, "uncertain");
    }
  }
  captureReminderRun(createPostHogServerClient(),{scheduler:campaign === "signup" ? "inactive_signup" : "tab_return",startedAt,scanned:counts.scanned,batchSize:100,eligible:counts.assigned,sent:counts.sent,failed:counts.failed,dryRun:req.query.dryRun === "1"});
  return res.status(200).json({ mode: req.query.dryRun === "1" ? "dry_run" : "experiment", ...counts });
}
