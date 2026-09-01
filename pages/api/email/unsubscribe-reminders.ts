import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { createPostHogServerClient, flushPostHogServerClientInBackground } from "../../../lib/posthogServer";
import { readReminderUnsubscribeToken, reminderUnsubscribeIdentifier } from "../../../lib/reminderUnsubscribe";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const userId = readReminderUnsubscribeToken(token);
  if (!userId) return res.status(400).json({ error: "This unsubscribe link is invalid or expired." });
  await prisma.verificationToken.upsert({
    where: { identifier_token: { identifier: reminderUnsubscribeIdentifier(userId), token: "unsubscribed" } },
    create: { identifier: reminderUnsubscribeIdentifier(userId), token: "unsubscribed", expires: new Date("9999-12-31T00:00:00.000Z") },
    update: { expires: new Date("9999-12-31T00:00:00.000Z") },
  });
  const posthog = createPostHogServerClient();
  posthog?.capture({ distinctId: userId, event: "reminder_email_unsubscribed", properties: { email_category: "retention_reminders" } });
  if (posthog) flushPostHogServerClientInBackground(posthog);
  return res.status(200).json({ ok: true });
}
