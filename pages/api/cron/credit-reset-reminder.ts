import type { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedSchedulerRequest } from "../../../lib/cloudSchedulerAuth";
import {
  creditResetEmailsEnabled,
  collectFreeCreditResets,
  creditResetCandidates,
  claimCreditReset,
  finishCreditReset,
} from "../../../lib/creditResetNotices";
import { buildCreditResetEmail } from "../../../lib/creditResetEmail";
import { accountEmailLocale } from "../../../lib/i18n/accountLanguage";
import {
  isEmailDeliveryConfigured,
  sendTransactionalEmail,
} from "../../../lib/email";
import { createPostHogServerClient } from "../../../lib/posthogServer";
import {
  captureReminderDeliveryFailure,
  captureReminderFailure,
  captureReminderRun,
} from "../../../lib/reminderMonitoring";
export const config = { maxDuration: 60 };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!["GET", "POST"].includes(req.method || "")) return res.status(405).end();
  if (!(await isAuthorizedSchedulerRequest(req.headers.authorization)))
    return res.status(401).end();
  const dryRun = req.query.dryRun === "1";
  if (!creditResetEmailsEnabled())
    return res.status(200).json({ mode: "disabled", sent: 0 });
  const ph = createPostHogServerClient(),
    startedAt = Date.now(),
    now = new Date();
  let sent = 0,
    failed = 0;
  try {
    if (!dryRun && !isEmailDeliveryConfigured())
      throw new Error("Email delivery unavailable");
    if (!dryRun) await collectFreeCreditResets(now);
    const rows = await creditResetCandidates(now);
    for (const row of rows) {
      if (dryRun) continue;
      const locale = await accountEmailLocale(row.accountId);
      const email = buildCreditResetEmail(row.accountId, locale); // validate config before claim
      if (
        !(await creditResetCandidates(new Date(), row.id)).length ||
        !(await claimCreditReset(row.id))
      )
        continue;
      try {
        if (!(await creditResetCandidates(new Date(), row.id, true)).length) {
          await finishCreditReset(row.id, "cancelled", new Date());
          continue;
        }
        const accepted = await sendTransactionalEmail({
          to: row.email,
          ...email,
          language: {
            kind: "customer",
            template: "credit_reset",
            locale,
            accountId: row.accountId,
          },
          analyticsCategory: "credit_reset",
        });
        if (!accepted) throw new Error("Email provider did not accept send");
        await finishCreditReset(row.id, "accepted", new Date());
        sent++;
        ph?.capture({
          distinctId: row.accountId,
          event: "credit_reset_email_sent",
          properties: {
            $insert_id: `credit-reset:${row.id}`,
            source: row.source,
            content_locale: locale,
            email_category: "credit_reset",
          },
        });
      } catch (error) {
        failed++;
        await finishCreditReset(row.id, "ambiguous", new Date());
        captureReminderDeliveryFailure(
          ph,
          "credit_reset",
          row.accountId,
          error,
        );
      }
    }
    captureReminderRun(ph, {
      scheduler: "credit_reset",
      startedAt,
      scanned: rows.length,
      batchSize: 50,
      eligible: rows.length,
      sent,
      failed,
      dryRun,
    });
    return res
      .status(200)
      .json({
        mode: dryRun ? "dry_run" : "enabled",
        eligible: rows.length,
        sent,
        failed,
      });
  } catch (error) {
    captureReminderFailure(ph, "credit_reset", startedAt, error);
    return res.status(503).json({ error: "Credit reset reminder unavailable" });
  } finally {
    if (ph)
      await ph
        .flush()
        .catch(() => console.warn("credit_reset_analytics_pending"));
  }
}
