import crypto from "crypto";
import { reminderUnsubscribeUrl } from "./reminderUnsubscribe";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

export const INACTIVE_SIGNUP_REMINDER_IDENTIFIER_PREFIX = "reminder:inactive-transcriber:";
export const INACTIVE_SIGNUP_REMINDER_HOLDOUT_PREFIX = "experiment:inactive-transcriber-holdout:";
export const INACTIVE_SIGNUP_REMINDER_MAX_AGE_DAYS = 4;
export const INACTIVE_SIGNUP_REMINDER_MAX_LATENESS_HOURS = 6;
export const INACTIVE_SIGNUP_REMINDER_EXPERIMENT_VERSION = "inactive_signup_6h_50_50_v1";

export type InactiveSignupReminderVariant = "holdout" | "6h" | "24h" | "72h";

export const INACTIVE_SIGNUP_REMINDER_DELAYS: Record<InactiveSignupReminderVariant, number | null> = {
  holdout: null,
  "6h": 6,
  "24h": 24,
  "72h": 72,
};

type BuildReminderEmailInput = {
  name?: string | null;
  variant?: Exclude<InactiveSignupReminderVariant, "holdout">;
  userId?: string;
};

function baseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInactiveSignupReminderIdentifier(userId: string) {
  return `${INACTIVE_SIGNUP_REMINDER_IDENTIFIER_PREFIX}${userId}`;
}

export function buildInactiveSignupHoldoutIdentifier(userId: string) {
  return `${INACTIVE_SIGNUP_REMINDER_HOLDOUT_PREFIX}${userId}`;
}

export function buildInactiveSignupExperimentToken(userId: string, variant: InactiveSignupReminderVariant) {
  return crypto.createHash("sha256").update(`inactive-signup-email:${variant}:${userId}`).digest("hex");
}

export function assignInactiveSignupReminderVariant(userId: string): InactiveSignupReminderVariant {
  const bucket = crypto.createHash("sha256").update(`inactive-signup-reminder:${userId}`).digest().readUInt32BE(0) % 100;
  return bucket < 50 ? "holdout" : "6h";
}

export function buildInactiveSignupReminderEmail(input: BuildReminderEmailInput = {}) {
  const firstName = (input.name || "").trim() || "there";
  const safeName = escapeEmailHtml(firstName);
  const variant = input.variant || "6h";
  const transcriberUrl = `${baseUrl()}/transcribe?source=inactive_signup_reminder&timing=${variant}`;
  const subject = "Still interested in transcribing a song?";
  const unsubscribeUrl = input.userId ? reminderUnsubscribeUrl(input.userId) : null;
  const text = `Hi ${firstName},

You created a Note2Tabs account a little while ago, and we noticed you have not started your first transcription yet.

If you are still interested, this might be a great moment to pick up the song you had in mind and turn it into tabs.

Start here: ${transcriberUrl}

- Paste a YouTube link or upload audio
- Generate guitar tabs from audio
- Edit and save the result in your account

If now is not the right time, no worries. This is just a quick check-in.

Note2Tabs${unsubscribeUrl ? `\n\nStop reminder emails: ${unsubscribeUrl}` : ""}`;

  const html = renderProductEmail({
    title: "Have a song in mind?",
    preview: "Turn the song you had in mind into an editable tab.",
    greeting: `Hi ${safeName},`,
    bodyHtml: '<p style="margin:0;">You created a Note2Tabs account but have not tried a transcription yet. If there is still a song you want to learn, upload the recording or paste its YouTube link and we will help you get started.</p>',
    action: { label: "Transcribe a song", url: transcriberUrl },
    footerHtml: unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#747d79;text-decoration:underline;">Stop reminder emails</a>` : "Note2Tabs",
  });

  return { subject, text, html, transcriberUrl, unsubscribeUrl };
}
