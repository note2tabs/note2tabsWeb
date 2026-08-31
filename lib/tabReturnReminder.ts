import crypto from "crypto";

export const TAB_RETURN_REMINDER_DELAY_HOURS = 48;
export const TAB_RETURN_REMINDER_MAX_AGE_DAYS = 14;
export const TAB_RETURN_REMINDER_COOLDOWN_DAYS = 14;
export const TAB_RETURN_REMINDER_PREFIX = "reminder:return-to-tab:";
export const TAB_RETURN_REMINDER_COOLDOWN_PREFIX = "reminder:return-to-tab-cooldown:";

type BuildTabReturnReminderInput = {
  name?: string | null;
  editorId: string;
  editorName?: string | null;
};

function appBaseUrl() {
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

export function buildTabReturnReminderIdentifier(userId: string, editorId: string) {
  return `${TAB_RETURN_REMINDER_PREFIX}${userId}:${editorId}`;
}

export function buildTabReturnCooldownIdentifier(userId: string) {
  return `${TAB_RETURN_REMINDER_COOLDOWN_PREFIX}${userId}`;
}

export function buildTabReturnMarkerToken(userId: string, editorId: string) {
  return crypto.createHash("sha256").update(`return-to-tab:${userId}:${editorId}`).digest("hex");
}

export function isInTabReturnReminderRollout(userId: string, editorId: string, percent: number) {
  const normalizedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  if (normalizedPercent === 0) return false;
  if (normalizedPercent === 100) return true;
  const digest = crypto.createHash("sha256").update(`return-to-tab-rollout:${userId}:${editorId}`).digest();
  return digest.readUInt32BE(0) % 100 < normalizedPercent;
}

export function buildTabReturnReminderEmail(input: BuildTabReturnReminderInput) {
  const firstName = input.name?.trim().split(/\s+/)[0] || "there";
  const editorName = input.editorName?.trim() || "your tab";
  const subjectName = editorName.replace(/[\r\n]+/g, " ").slice(0, 120);
  const editorUrl = `${appBaseUrl()}/gte/${encodeURIComponent(input.editorId)}?source=tab_return_email`;
  const subject = `Continue working on ${subjectName}`;
  const text = `Hi ${firstName},

Your work on ${editorName} is saved in Note2Tabs. When you are ready, you can return to play it, make adjustments, or continue practicing.

Continue your tab: ${editorUrl}

Note2Tabs`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#07110e;background:#f6f3ea;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dedbd2;border-radius:16px;padding:26px;">
        <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;">Your tab is ready when you are</h1>
        <p style="margin:0 0 18px;color:#4f5a56;">
          Your work on <strong>${escapeHtml(editorName)}</strong> is saved. Return to play it, make adjustments, or continue practicing.
        </p>
        <p style="margin:0;">
          <a href="${editorUrl}" style="display:inline-block;padding:11px 16px;background:#07110e;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:650;">
            Continue your tab
          </a>
        </p>
      </div>
    </div>
  `;

  return { subject, text, html, editorUrl };
}
