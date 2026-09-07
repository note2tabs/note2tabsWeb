import { sendTransactionalEmail } from "./email";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

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
  const html = renderProductEmail({
    title: `${inviter} shared a tab with you`,
    preview: `${inviter} invited you to ${permission} ${tabName}.`,
    bodyHtml: `<p style="margin:0;">You can ${permission} <strong style="color:#17201d;">${escapeEmailHtml(tabName)}</strong> on Note2Tabs.</p>`,
    action: { label: "Open shared tab", url: sharedUrl },
    secondaryHtml: "Sign in or create an account with this email address to access it.",
  });

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
