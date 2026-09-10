import crypto from "crypto";
import { reminderUnsubscribeUrl } from "./reminderUnsubscribe";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

export const TAB_RETURN_REMINDER_DELAY_HOURS = 48;
export const TAB_RETURN_REMINDER_MAX_AGE_DAYS = 14;
export const TAB_RETURN_REMINDER_COOLDOWN_DAYS = 14;
export const TAB_RETURN_REMINDER_PREFIX = "reminder:return-to-tab:";
export const TAB_RETURN_REMINDER_COOLDOWN_PREFIX = "reminder:return-to-tab-cooldown:";

type BuildTabReturnReminderInput = {
  name?: string | null;
  editorId: string;
  editorName?: string | null;
  userId?: string;
};

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
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
  const unsubscribeUrl = input.userId ? reminderUnsubscribeUrl(input.userId) : null;
  const text = `Hi ${firstName},

Your work on ${editorName} is saved in Note2Tabs. When you are ready, you can return to play it, make adjustments, or continue practicing.

Continue your tab: ${editorUrl}

Note2Tabs${unsubscribeUrl ? `\n\nStop reminder emails: ${unsubscribeUrl}` : ""}`;
  const html = renderProductEmail({
    title: "Your tab is ready when you are",
    preview: `Continue working on ${editorName}.`,
    greeting: `Hi ${escapeEmailHtml(firstName)},`,
    bodyHtml: `<p style="margin:0;">Your work on <strong style="color:#17201d;">${escapeEmailHtml(editorName)}</strong> is saved. Return whenever you want to play it, make changes, or keep practicing.</p>`,
    action: { label: "Continue your tab", url: editorUrl },
    footerHtml: unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#747d79;text-decoration:underline;">Stop reminder emails</a>` : "Note2Tabs",
  });

  return { subject, text, html, editorUrl, unsubscribeUrl };
}
