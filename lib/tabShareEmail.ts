import { sendTransactionalEmail } from "./email";

export type TabShareEmailInput = {
  to: string;
  inviterName?: string | null;
  tabName?: string | null;
  editorId: string;
  role: "viewer" | "editor";
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

export function buildTabShareEmail(input: TabShareEmailInput) {
  const inviter = input.inviterName?.trim() || "Someone";
  const tabName = input.tabName?.trim() || "a tab";
  const permission = input.role === "editor" ? "view and edit" : "view";
  const sharedUrl = `${appBaseUrl()}/shared?source=tab_share_email&editor=${encodeURIComponent(input.editorId)}`;
  const subject = `${inviter} shared a Note2Tabs tab with you`;
  const text = `${inviter} invited you to ${permission} “${tabName}” on Note2Tabs.

Review invitation: ${sharedUrl}

Sign in or create an account using this email address to access the tab.

Note2Tabs`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#07110e;background:#f6f3ea;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dedbd2;border-radius:16px;padding:26px;">
        <p style="margin:0 0 12px;color:#4f5a56;">A tab was shared with you</p>
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;">${escapeHtml(tabName)}</h1>
        <p style="margin:0 0 18px;color:#4f5a56;">
          ${escapeHtml(inviter)} invited you to ${permission} this tab on Note2Tabs.
        </p>
        <p style="margin:0 0 18px;">
          <a href="${sharedUrl}" style="display:inline-block;padding:11px 16px;background:#07110e;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:650;">
            Review invitation
          </a>
        </p>
        <p style="margin:0;color:#737d79;font-size:13px;">
          Sign in or create an account using this email address to access the tab.
        </p>
      </div>
    </div>
  `;

  return { subject, text, html, sharedUrl };
}

export async function sendTabShareEmail(input: TabShareEmailInput) {
  const email = buildTabShareEmail(input);
  return sendTransactionalEmail({
    to: input.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    analyticsCategory: "tab_share",
  });
}
