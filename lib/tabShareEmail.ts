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
  const permissionLabel = input.role === "editor" ? "Can edit" : "Can view";
  const sharedUrl = `${appBaseUrl()}/shared?source=tab_share_email&editor=${encodeURIComponent(input.editorId)}`;
  const subject = `${inviter} shared a Note2Tabs tab with you`;
  const text = `${inviter} invited you to ${permission} “${tabName}” on Note2Tabs.

Review invitation: ${sharedUrl}

Sign in or create an account using this email address to access the tab.

Note2Tabs`;
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f2ea;color:#0a1210;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(inviter)} invited you to ${permission} ${escapeHtml(tabName)} on Note2Tabs.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f5f2ea;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
            <tr>
              <td style="padding:0 4px 22px;font-size:20px;font-weight:700;letter-spacing:-0.4px;color:#08110e;">
                <span style="display:inline-block;width:27px;height:27px;line-height:27px;margin-right:9px;border-radius:50%;background:#08110e;color:#ffffff;text-align:center;font-size:13px;vertical-align:middle;">N</span>
                <span style="vertical-align:middle;">Note2Tabs</span>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #dedbd2;border-radius:20px;padding:42px 42px 38px;box-shadow:0 10px 32px rgba(25,35,31,0.06);">
                <p style="margin:0 0 14px;color:#318267;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">Tab invitation</p>
                <h1 style="margin:0 0 14px;color:#08110e;font-size:30px;line-height:1.18;letter-spacing:-0.8px;font-weight:700;">A tab is waiting for you</h1>
                <p style="margin:0 0 28px;color:#59635f;font-size:16px;line-height:1.6;">
                  <strong style="color:#17201d;">${escapeHtml(inviter)}</strong> invited you to ${permission} a tab on Note2Tabs.
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 28px;background:#f8f7f2;border:1px solid #e8e5dc;border-radius:14px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <p style="margin:0 0 7px;color:#7b847f;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Shared tab</p>
                      <p style="margin:0;color:#0a1210;font-size:17px;line-height:1.4;font-weight:700;word-break:break-word;">${escapeHtml(tabName)}</p>
                    </td>
                    <td align="right" style="padding:20px 22px 20px 10px;white-space:nowrap;">
                      <span style="display:inline-block;padding:7px 10px;border:1px solid #cfe2da;border-radius:999px;background:#edf7f3;color:#276d57;font-size:12px;font-weight:700;">${permissionLabel}</span>
                    </td>
                  </tr>
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td bgcolor="#08110e" style="border-radius:11px;">
                      <a href="${sharedUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;">Open shared tab&nbsp;&nbsp;→</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:24px 0 0;color:#7b847f;font-size:13px;line-height:1.55;">
                  Use this email address when you sign in or create your account. You can review the invitation before accepting it.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;color:#8a928e;font-size:12px;line-height:1.5;">
                Note2Tabs · Turn recordings into tabs you can edit, practice, and export.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

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
