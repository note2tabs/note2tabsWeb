export const INACTIVE_SIGNUP_REMINDER_DELAY_HOURS = 5;
export const INACTIVE_SIGNUP_REMINDER_IDENTIFIER_PREFIX = "reminder:inactive-transcriber:";

type BuildReminderEmailInput = {
  name?: string | null;
};

function baseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  return "http://localhost:3000";
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

export function buildInactiveSignupReminderEmail(input: BuildReminderEmailInput = {}) {
  const firstName = (input.name || "").trim() || "there";
  const safeName = escapeHtml(firstName);
  const transcriberUrl = `${baseUrl()}/transcriber`;
  const subject = "Still interested in transcribing a song?";
  const text = `Hi ${firstName},

You created a Note2Tabs account a little while ago, and we noticed you have not started your first transcription yet.

If you are still interested, this might be a great moment to pick up the song you had in mind and turn it into tabs.

Start here: ${transcriberUrl}

- Paste a YouTube link or upload audio
- Generate draft tabs quickly
- Edit and save the result in your account

If now is not the right time, no worries. This is just a quick check-in.

Note2Tabs`;

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
          <li>Generate draft tabs quickly</li>
          <li>Edit and save the result in your account</li>
        </ul>
        <p style="margin:0;color:#64748b;font-size:13px;">
          If now is not the right time, no worries. This is just a quick check-in.
        </p>
      </div>
    </div>
  `;

  return { subject, text, html, transcriberUrl };
}
