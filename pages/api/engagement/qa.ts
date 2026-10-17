import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { engagementQaAccount, getEngagementEnrollment, reserveEngagementContact, finishEngagementContact } from "../../../lib/engagement/experiment";
import { accountEmailLocale } from "../../../lib/i18n/accountLanguage";
import { buildContextualReminder } from "../../../lib/engagement/reminderCopy";
import { reminderUnsubscribeUrl } from "../../../lib/reminderUnsubscribe";
import { sendTransactionalEmail } from "../../../lib/email";

/** Explicit account-only production smoke test. Never used by campaign schedulers. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  const id = session?.user?.id;
  if (!id || !engagementQaAccount(id)) return res.status(404).end();
  if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return res.status(403).end();
  if (req.body?.operation === "unsubscribe_link") return res.status(200).json({ url: reminderUnsubscribeUrl(id) });
  if (req.body?.operation !== "send_test") return res.status(400).end();
  const users = await prisma.$queryRaw<Array<{email:string}>>`SELECT u.email FROM "User" u
    JOIN "EngagementEmailPermission" p ON p."accountId"=u.id AND p.allowed=TRUE
    WHERE u.id=${id} AND u.role='FREE' AND u."subscriptionPlan"='FREE'
    AND (u."emailVerified" IS NOT NULL OR u."emailVerifiedBool"=TRUE)
    AND NOT EXISTS(SELECT 1 FROM "VerificationToken" v WHERE v.expires>NOW()
      AND v.identifier IN (${`email:reminders-unsubscribed:${id}`},${`email:reminders-delivery-suppressed:${id}`}))`;
  if (!users[0]) return res.status(409).json({error:"permission_required"});
  const enrollment = await getEngagementEnrollment(id);
  const contactId = await reserveEngagementContact(enrollment,"email","qa_production_delivery");
  if (!contactId) return res.status(409).json({error:"contact_cap"});
  try {
    const locale = await accountEmailLocale(id);
    const email = buildContextualReminder({accountId:id,action:"email_try_another_transcription",editorId:null,locale});
    const accepted = await sendTransactionalEmail({...email,subject:`[TEST] ${email.subject}`,to:users[0].email,
      language:{kind:"customer",template:"contextual_reminder",locale,accountId:id,test:true},analyticsCategory:"engagement_qa"});
    await finishEngagementContact(id,contactId,accepted ? "accepted" : "failed");
    return res.status(accepted ? 200 : 503).json({accepted,locale,contactId});
  } catch {
    await finishEngagementContact(id,contactId,"uncertain");
    return res.status(503).json({error:"delivery_uncertain"});
  }
}
