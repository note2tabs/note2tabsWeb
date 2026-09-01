import crypto from "crypto";
import { reminderUnsubscribeUrl } from "./reminderUnsubscribe";

export const INACTIVE_SIGNUP_REMINDER_IDENTIFIER_PREFIX = "reminder:inactive-transcriber:";
export const INACTIVE_SIGNUP_REMINDER_HOLDOUT_PREFIX = "experiment:inactive-transcriber-holdout:";
export const INACTIVE_SIGNUP_REMINDER_MAX_AGE_DAYS = 4;
export const INACTIVE_SIGNUP_REMINDER_MAX_LATENESS_HOURS = 6;

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
  if (bucket < 20) return "holdout";
  if (bucket < 47) return "6h";
  if (bucket < 74) return "24h";
  return "72h";
}

export function buildInactiveSignupReminderEmail(input: BuildReminderEmailInput = {}) {
  const firstName = (input.name || "").trim() || "there";
  const safeName = escapeHtml(firstName);
  const variant = input.variant || "24h";
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

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;background:#f8fafc;padding:24px;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;">
        <p style="margin:0 0 12px;">Hi ${safeName},</p>
        <p style="margin:0 0 12px;">
          You created a Note2Tabs account a little while ago, and we noticed you have not started your first
          transcription yet.
        </p>
        <p style="margin:0 0 16px;">
          If you are still interested, this might be a great moment to pick up the song you had in mind and turn it
          into tabs.
        </p>
        <p style="margin:0 0 18px;">
          <a href="${transcriberUrl}" style="display:inline-block;padding:11px 16px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:9px;font-weight:600;">
            Start transcribing
          </a>
        </p>
        <ul style="margin:0 0 16px 20px;padding:0;color:#334155;">
          <li>Paste a YouTube link or upload audio</li>
          <li>Generate guitar tabs from audio</li>
          <li>Edit and save the result in your account</li>
        </ul>
        <p style="margin:0;color:#64748b;font-size:13px;">
          If now is not the right time, no worries. This is just a quick check-in.
        </p>
        ${unsubscribeUrl ? `<p style="margin:16px 0 0;color:#64748b;font-size:12px;"><a href="${unsubscribeUrl}" style="color:#64748b;">Stop reminder emails</a></p>` : ""}
      </div>
    </div>
  `;

  return { subject, text, html, transcriberUrl, unsubscribeUrl };
}
