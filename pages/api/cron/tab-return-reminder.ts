import type { NextApiRequest, NextApiResponse } from "next";
import { sendTransactionalEmail } from "../../../lib/email";
import { prisma } from "../../../lib/prisma";
import { isAuthorizedSchedulerRequest } from "../../../lib/cloudSchedulerAuth";
import { createPostHogServerClient, flushPostHogServerClientInBackground } from "../../../lib/posthogServer";
import { captureReminderDeliveryFailure, captureReminderFailure, captureReminderRun } from "../../../lib/reminderMonitoring";
import {
  TAB_RETURN_REMINDER_COOLDOWN_DAYS,
  TAB_RETURN_REMINDER_DELAY_HOURS,
  TAB_RETURN_REMINDER_MAX_AGE_DAYS,
  buildTabReturnCooldownIdentifier,
  buildTabReturnMarkerToken,
  buildTabReturnReminderEmail,
  buildTabReturnReminderIdentifier,
  isInTabReturnReminderRollout,
} from "../../../lib/tabReturnReminder";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 250;
const PER_TAB_MARKER_DAYS = 3650;

type CandidateCanvas = {
  user_id: string;
  canvas_id: string;
  name: string | null;
  updated_at: Date;
  email: string;
  user_name: string | null;
};

function batchSize() {
  const parsed = Number(process.env.TAB_RETURN_REMINDER_BATCH_SIZE || DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.round(parsed)));
}

function sendingEnabled() {
  return process.env.TAB_RETURN_REMINDER_ENABLED === "true";
}

function rolloutPercent() {
  const parsed = Number(process.env.TAB_RETURN_REMINDER_ROLLOUT_PERCENT || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function isUniqueConstraintFailure(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

async function runHandler(req: NextApiRequest, res: NextApiResponse, startedAt: number) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authorized =
    process.env.NODE_ENV !== "production" && !process.env.CRON_SECRET
      ? true
      : await isAuthorizedSchedulerRequest(req.headers.authorization);
  if (!authorized) return res.status(401).json({ error: "Unauthorized" });

  const now = new Date();
  const inactiveBefore = new Date(now.getTime() - TAB_RETURN_REMINDER_DELAY_HOURS * 60 * 60 * 1000);
  const oldestEligible = new Date(now.getTime() - TAB_RETURN_REMINDER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const dryRun = req.query.dryRun === "1" || !sendingEnabled();
  const rollout = rolloutPercent();
  const posthog = dryRun ? null : createPostHogServerClient();

  // A meaningful candidate has musical content and more than an initial save.
  // DISTINCT ON keeps this to at most one (the most recent) tab per user.
  const canvases = await prisma.$queryRaw<CandidateCanvas[]>`
    SELECT DISTINCT ON (c.user_id)
      c.user_id,
      c.canvas_id,
      c.name,
      c.updated_at,
      u.email,
      u.name AS user_name
    FROM canvases c
    INNER JOIN "User" u ON u.id = c.user_id
    WHERE c.updated_at <= ${inactiveBefore}
      AND c.updated_at >= ${oldestEligible}
      AND (u."lastActiveAt" IS NULL OR u."lastActiveAt" <= ${inactiveBefore})
      AND (u."emailVerifiedBool" = TRUE OR u."emailVerified" IS NOT NULL)
      AND c.draft_revision >= 2
      AND NOT EXISTS (
        SELECT 1 FROM "VerificationToken" v
        WHERE v.expires > ${now}
          AND v.identifier IN (
            'reminder:return-to-tab:' || c.user_id || ':' || c.canvas_id,
            'reminder:return-to-tab-cooldown:' || c.user_id,
            'email:reminders-unsubscribed:' || c.user_id
          )
      )
      AND EXISTS (
        SELECT 1 FROM lane_notes n
        WHERE n.user_id = c.user_id AND n.canvas_id = c.canvas_id
      )
    ORDER BY c.user_id, c.updated_at DESC
    LIMIT ${batchSize()}
  `;

  let eligible = 0;
  let sent = 0;
  let heldOut = 0;
  let skippedAlreadySent = 0;
  let skippedCooldown = 0;
  let skippedDeliveryDisabled = 0;
  let failed = 0;

  for (const canvas of canvases) {
    const reminderIdentifier = buildTabReturnReminderIdentifier(canvas.user_id, canvas.canvas_id);
    const cooldownIdentifier = buildTabReturnCooldownIdentifier(canvas.user_id);
    const existingMarkers = await prisma.verificationToken.findMany({
      where: { identifier: { in: [reminderIdentifier, cooldownIdentifier] }, expires: { gt: now } },
      select: { identifier: true },
    });
    const identifiers = new Set(existingMarkers.map((marker) => marker.identifier));
    if (identifiers.has(reminderIdentifier)) {
      skippedAlreadySent += 1;
      continue;
    }
    if (identifiers.has(cooldownIdentifier)) {
      skippedCooldown += 1;
      continue;
    }

    const latestUser = await prisma.user.findUnique({
      where: { id: canvas.user_id },
      select: { lastActiveAt: true },
    });
    if (latestUser?.lastActiveAt && latestUser.lastActiveAt > inactiveBefore) {
      continue;
    }

    eligible += 1;
    if (dryRun) continue;
    const included = isInTabReturnReminderRollout(canvas.user_id, canvas.canvas_id, rollout);
    posthog?.capture({
      distinctId: canvas.user_id,
      event: "tab_return_reminder_assigned",
      properties: {
        experiment_group: included ? "treatment" : "holdout",
        rollout_percent: rollout,
        $insert_id: `tab-return-reminder-assigned:${canvas.user_id}:${canvas.canvas_id}`,
      },
    });
    if (!included) {
      heldOut += 1;
      await prisma.verificationToken.createMany({
        data: [{
          identifier: reminderIdentifier,
          token: `${buildTabReturnMarkerToken(canvas.user_id, canvas.canvas_id)}:holdout`,
          expires: new Date(now.getTime() + PER_TAB_MARKER_DAYS * 24 * 60 * 60 * 1000),
        }],
        skipDuplicates: true,
      });
      continue;
    }

    const token = buildTabReturnMarkerToken(canvas.user_id, canvas.canvas_id);
    try {
      await prisma.verificationToken.createMany({
        data: [
          {
            identifier: reminderIdentifier,
            token,
            expires: new Date(now.getTime() + PER_TAB_MARKER_DAYS * 24 * 60 * 60 * 1000),
          },
          {
            identifier: cooldownIdentifier,
            token: `${token}:cooldown`,
            expires: new Date(now.getTime() + TAB_RETURN_REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000),
          },
        ],
      });
    } catch (error) {
      if (isUniqueConstraintFailure(error)) {
        skippedAlreadySent += 1;
        continue;
      }
      throw error;
    }

    const email = buildTabReturnReminderEmail({
      name: canvas.user_name,
      editorId: canvas.canvas_id,
      editorName: canvas.name,
      userId: canvas.user_id,
    });
    try {
      const delivered = await sendTransactionalEmail({
        to: canvas.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        analyticsCategory: "tab_return_reminder",
      });
      if (!delivered) {
        skippedDeliveryDisabled += 1;
        captureReminderDeliveryFailure(posthog, "tab_return", canvas.user_id, null);
        await prisma.verificationToken.deleteMany({
          where: { identifier: { in: [reminderIdentifier, cooldownIdentifier] }, token: { startsWith: token } },
        });
        continue;
      }
      sent += 1;
      posthog?.capture({
        distinctId: canvas.user_id,
        event: "tab_return_reminder_sent",
        properties: {
          rollout_percent: rollout,
          delay_hours: TAB_RETURN_REMINDER_DELAY_HOURS,
          $insert_id: `tab-return-reminder-sent:${canvas.user_id}:${canvas.canvas_id}`,
        },
      });
    } catch (error) {
      failed += 1;
      captureReminderDeliveryFailure(posthog, "tab_return", canvas.user_id, error);
      await prisma.verificationToken.deleteMany({
        where: { identifier: { in: [reminderIdentifier, cooldownIdentifier] }, token: { startsWith: token } },
      });
      console.error("tab return reminder send failed", { userId: canvas.user_id, canvasId: canvas.canvas_id, error });
    }
  }

  captureReminderRun(posthog, {
    scheduler: "tab_return", startedAt, scanned: canvases.length, batchSize: batchSize(),
    eligible, sent, failed, dryRun,
  });
  if (posthog) flushPostHogServerClientInBackground(posthog);

  return res.status(200).json({
    ok: true,
    dryRun,
    rolloutPercent: rollout,
    scanned: canvases.length,
    eligible,
    sent,
    heldOut,
    skippedAlreadySent,
    skippedCooldown,
    skippedDeliveryDisabled,
    failed,
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startedAt = Date.now();
  try {
    return await runHandler(req, res, startedAt);
  } catch (error) {
    const posthog = createPostHogServerClient();
    captureReminderFailure(posthog, "tab_return", startedAt, error);
    if (posthog) flushPostHogServerClientInBackground(posthog);
    console.error("tab return reminder scheduler failed", { error });
    if (!res.headersSent) return res.status(500).json({ ok: false, error: "Reminder scheduler failed" });
  }
}
