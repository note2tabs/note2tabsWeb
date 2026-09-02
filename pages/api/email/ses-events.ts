import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { prisma } from "../../../lib/prisma";
import { createPostHogServerClient, flushPostHogServerClientInBackground } from "../../../lib/posthogServer";

type SesNotification = {
  eventType?: "Delivery" | "Bounce" | "Complaint";
  notificationType?: "Delivery" | "Bounce" | "Complaint";
  mail?: { messageId?: string; destination?: string[]; tags?: Record<string, string[]> };
  bounce?: { bounceType?: string; bounceSubType?: string; bouncedRecipients?: Array<{ emailAddress?: string }> };
  complaint?: { complaintFeedbackType?: string; complainedRecipients?: Array<{ emailAddress?: string }> };
};

function safeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function recipients(notification: SesNotification) {
  const values = notification.bounce?.bouncedRecipients?.map((item) => item.emailAddress)
    || notification.complaint?.complainedRecipients?.map((item) => item.emailAddress)
    || notification.mail?.destination
    || [];
  return [...new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()))];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const expected = process.env.SES_EVENT_WEBHOOK_SECRET || "";
  const supplied = typeof req.query.secret === "string" ? req.query.secret : "";
  if (!expected || !safeEqual(supplied, expected)) return res.status(401).json({ error: "Unauthorized" });

  const envelope = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  if (envelope?.Type === "SubscriptionConfirmation") {
    const url = typeof envelope.SubscribeURL === "string" ? new URL(envelope.SubscribeURL) : null;
    if (!url || url.protocol !== "https:" || !url.hostname.endsWith(".amazonaws.com")) {
      return res.status(400).json({ error: "Invalid subscription URL" });
    }
    const response = await fetch(url.toString());
    return response.ok ? res.status(200).json({ ok: true }) : res.status(502).json({ error: "Confirmation failed" });
  }
  if (envelope?.Type !== "Notification" || typeof envelope.Message !== "string") {
    return res.status(400).json({ error: "Invalid SNS message" });
  }

  const notification = JSON.parse(envelope.Message) as SesNotification;
  const category = notification.mail?.tags?.email_category?.[0];
  if (category !== "inactive_signup_reminder" && category !== "tab_return_reminder") {
    return res.status(200).json({ ok: true, ignored: true });
  }
  const notificationType = notification.eventType || notification.notificationType;
  const event = notificationType === "Delivery"
    ? "reminder_email_delivered"
    : notificationType === "Bounce"
      ? "reminder_email_bounced"
      : notificationType === "Complaint"
        ? "reminder_email_complaint_received"
        : null;
  if (!event) return res.status(200).json({ ok: true, ignored: true });

  const posthog = createPostHogServerClient();
  for (const email of recipients(notification)) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    posthog?.capture({
      distinctId: user?.id || `unknown-email:${crypto.createHash("sha256").update(email).digest("hex").slice(0, 24)}`,
      event,
      properties: {
        email_category: category,
        bounce_type: notification.bounce?.bounceType,
        bounce_subtype: notification.bounce?.bounceSubType,
        complaint_type: notification.complaint?.complaintFeedbackType,
        $insert_id: `${event}:${notification.mail?.messageId || "unknown"}:${email}`,
      },
    });
  }
  if (posthog) flushPostHogServerClientInBackground(posthog);
  return res.status(200).json({ ok: true });
}
