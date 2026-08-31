import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { sendTransactionalEmail } from "../../../lib/email";
import { createPostHogServerClient, flushPostHogServerClientInBackground } from "../../../lib/posthogServer";
import {
  INACTIVE_SIGNUP_REMINDER_DELAYS,
  INACTIVE_SIGNUP_REMINDER_MAX_AGE_DAYS,
  INACTIVE_SIGNUP_REMINDER_MAX_LATENESS_HOURS,
  assignInactiveSignupReminderVariant,
  buildInactiveSignupExperimentToken,
  buildInactiveSignupHoldoutIdentifier,
  buildInactiveSignupReminderEmail,
  buildInactiveSignupReminderIdentifier,
} from "../../../lib/inactiveSignupReminder";

const REMINDER_MARKER_RETENTION_DAYS = 3650;
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 500;

function getBatchSize() {
  const raw = Number(process.env.INACTIVE_SIGNUP_REMINDER_BATCH_SIZE || DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(raw)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.round(raw)));
}

function isAuthorized(req: NextApiRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = req.headers.authorization || "";
  return authHeader === `Bearer ${secret}`;
}

function experimentEnabled() {
  return process.env.INACTIVE_SIGNUP_REMINDER_EXPERIMENT_ENABLED === "true";
}

function isUniqueConstraintFailure(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();
  const earliestDelayHours = 24;
  const cutoff = new Date(now.getTime() - earliestDelayHours * 60 * 60 * 1000);
  const newestAllowed = new Date(now.getTime() - INACTIVE_SIGNUP_REMINDER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const batchSize = getBatchSize();
  const dryRun = req.query.dryRun === "1" || !experimentEnabled();

  // Exclude already-processed and activated accounts before LIMIT. The old
  // query limited first and then skipped, allowing old rows to starve the queue.
  const candidates = await prisma.$queryRaw<Array<{ id: string; email: string; name: string | null; createdAt: Date }>>`
    SELECT u.id, u.email, u.name, u."createdAt"
    FROM "User" u
    WHERE u."createdAt" <= ${cutoff}
      AND u."createdAt" >= ${newestAllowed}
      AND NOT EXISTS (SELECT 1 FROM "TabJob" t WHERE t."userId" = u.id)
      AND NOT EXISTS (SELECT 1 FROM canvases c WHERE c.user_id = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM "VerificationToken" v
        WHERE v.identifier IN (
          'reminder:inactive-transcriber:' || u.id,
          'experiment:inactive-transcriber-holdout:' || u.id
        )
      )
    ORDER BY u."createdAt" ASC
    LIMIT ${batchSize}
  `;

  if (candidates.length === 0) {
    return res.status(200).json({
      ok: true,
      dryRun,
      scanned: 0,
      sent: 0,
      wouldSend: 0,
      skippedDeliveryDisabled: 0,
      heldOut: 0,
      waitingForAssignedDelay: 0,
      skippedExpiredWindow: 0,
      sentByVariant: { "24h": 0, "48h": 0, "72h": 0 },
      failed: 0,
    });
  }

  let sent = 0;
  let wouldSend = 0;
  let heldOut = 0;
  let waitingForAssignedDelay = 0;
  let skippedExpiredWindow = 0;
  let skippedDeliveryDisabled = 0;
  let failed = 0;
  const sentByVariant = { "24h": 0, "48h": 0, "72h": 0 };

  for (const user of candidates) {
    const reminderIdentifier = buildInactiveSignupReminderIdentifier(user.id);
    const variant = assignInactiveSignupReminderVariant(user.id);
    if (variant === "holdout") {
      heldOut += 1;
      if (!dryRun) {
        await prisma.verificationToken.create({
          data: {
            identifier: buildInactiveSignupHoldoutIdentifier(user.id),
            token: buildInactiveSignupExperimentToken(user.id, variant),
            expires: new Date(now.getTime() + REMINDER_MARKER_RETENTION_DAYS * 24 * 60 * 60 * 1000),
          },
        }).catch((error) => {
          if (!isUniqueConstraintFailure(error)) throw error;
        });
      }
      continue;
    }
    const delayHours = INACTIVE_SIGNUP_REMINDER_DELAYS[variant] || 0;
    const ageHours = (now.getTime() - user.createdAt.getTime()) / (60 * 60 * 1000);
    if (ageHours < delayHours) {
      waitingForAssignedDelay += 1;
      continue;
    }
    if (ageHours > delayHours + INACTIVE_SIGNUP_REMINDER_MAX_LATENESS_HOURS) {
      skippedExpiredWindow += 1;
      continue;
    }

    const email = buildInactiveSignupReminderEmail({ name: user.name, variant });
    wouldSend += 1;
    if (dryRun) continue;

    try {
      await prisma.verificationToken.create({
        data: {
          identifier: reminderIdentifier,
          token: buildInactiveSignupExperimentToken(user.id, variant),
          expires: new Date(now.getTime() + REMINDER_MARKER_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      const delivered = await sendTransactionalEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      if (!delivered) {
        skippedDeliveryDisabled += 1;
        await prisma.verificationToken.deleteMany({ where: { identifier: reminderIdentifier } });
        continue;
      }

      sent += 1;
      sentByVariant[variant] += 1;
      const posthog = createPostHogServerClient();
      posthog?.capture({
        distinctId: user.id,
        event: "inactive_signup_reminder_sent",
        properties: {
          timing_variant: variant,
          delay_hours: delayHours,
          $insert_id: `inactive-signup-reminder:${user.id}`,
        },
      });
      if (posthog) flushPostHogServerClientInBackground(posthog);
    } catch (error) {
      if (isUniqueConstraintFailure(error)) continue;
      failed += 1;
      await prisma.verificationToken.deleteMany({ where: { identifier: reminderIdentifier } }).catch(() => {});
      console.error("inactive signup reminder send failed", {
        userId: user.id,
        email: user.email,
        error,
      });
    }
  }

  return res.status(200).json({
    ok: true,
    dryRun,
    cutoff: cutoff.toISOString(),
    scanned: candidates.length,
    sent,
    wouldSend,
    heldOut,
    waitingForAssignedDelay,
    skippedExpiredWindow,
    sentByVariant,
    skippedDeliveryDisabled,
    failed,
  });
}
