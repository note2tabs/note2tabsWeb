import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { sendTransactionalEmail } from "../../../lib/email";
import {
  INACTIVE_SIGNUP_REMINDER_DELAY_HOURS,
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - INACTIVE_SIGNUP_REMINDER_DELAY_HOURS * 60 * 60 * 1000);
  const batchSize = getBatchSize();

  const candidates = await prisma.user.findMany({
    where: {
      createdAt: { lte: cutoff },
      tabs: { none: {} },
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  if (candidates.length === 0) {
    return res.status(200).json({
      ok: true,
      scanned: 0,
      sent: 0,
      skippedAlreadySent: 0,
      skippedEditorCreated: 0,
      skippedDeliveryDisabled: 0,
      failed: 0,
    });
  }

  const candidateIds = candidates.map((user) => user.id);
  const reminderIdentifiers = candidateIds.map((userId) =>
    buildInactiveSignupReminderIdentifier(userId)
  );

  const [existingReminderMarkers, editorEventsV2, editorEventsLegacy] = await Promise.all([
    prisma.verificationToken.findMany({
      where: {
        identifier: {
          in: reminderIdentifiers,
        },
      },
      select: { identifier: true },
    }),
    prisma.analyticsEventV2.findMany({
      where: {
        name: "gte_editor_created",
        accountId: {
          in: candidateIds,
        },
      },
      select: { accountId: true },
      distinct: ["accountId"],
    }),
    prisma.analyticsEvent.findMany({
      where: {
        event: "gte_editor_created",
        userId: {
          in: candidateIds,
        },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const reminderSentSet = new Set(existingReminderMarkers.map((marker) => marker.identifier));
  const editorCreatedSet = new Set<string>();
  for (const row of editorEventsV2) {
    if (row.accountId) editorCreatedSet.add(row.accountId);
  }
  for (const row of editorEventsLegacy) {
    if (row.userId) editorCreatedSet.add(row.userId);
  }

  let sent = 0;
  let skippedAlreadySent = 0;
  let skippedEditorCreated = 0;
  let skippedDeliveryDisabled = 0;
  let failed = 0;

  for (const user of candidates) {
    const reminderIdentifier = buildInactiveSignupReminderIdentifier(user.id);

    if (reminderSentSet.has(reminderIdentifier)) {
      skippedAlreadySent += 1;
      continue;
    }

    if (editorCreatedSet.has(user.id)) {
      skippedEditorCreated += 1;
      continue;
    }

    const email = buildInactiveSignupReminderEmail({ name: user.name });

    try {
      const delivered = await sendTransactionalEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      if (!delivered) {
        skippedDeliveryDisabled += 1;
        continue;
      }

      await prisma.verificationToken.create({
        data: {
          identifier: reminderIdentifier,
          token: crypto.randomBytes(32).toString("hex"),
          expires: new Date(now.getTime() + REMINDER_MARKER_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("inactive signup reminder send failed", {
        userId: user.id,
        email: user.email,
        error,
      });
    }
  }

  return res.status(200).json({
    ok: true,
    cutoff: cutoff.toISOString(),
    scanned: candidates.length,
    sent,
    skippedAlreadySent,
    skippedEditorCreated,
    skippedDeliveryDisabled,
    failed,
  });
}
