import crypto from "crypto";

export const REMINDER_UNSUBSCRIBE_PREFIX = "email:reminders-unsubscribed:";

function secret() {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || "";
}

export function reminderUnsubscribeIdentifier(userId: string) {
  return `${REMINDER_UNSUBSCRIBE_PREFIX}${userId}`;
}

export function createReminderUnsubscribeToken(userId: string) {
  if (!secret()) return null;
  const encoded = Buffer.from(userId, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function readReminderUnsubscribeToken(token: string) {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied || !secret()) return null;
  const expected = crypto.createHmac("sha256", secret()).update(encoded).digest();
  let actual: Buffer;
  try { actual = Buffer.from(supplied, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try { return Buffer.from(encoded, "base64url").toString("utf8") || null; } catch { return null; }
}

export function reminderUnsubscribeUrl(userId: string) {
  const token = createReminderUnsubscribeToken(userId);
  if (!token) return null;
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
