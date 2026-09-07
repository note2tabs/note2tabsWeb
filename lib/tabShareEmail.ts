import { sendTransactionalEmail } from "./email";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";
import { tabShareBlockUrl } from "./tabShareEmailPreferences";

export type TabShareEmailInput = {
  to: string;
  inviterName?: string | null;
  tabName?: string | null;
  editorId: string;
  role: "viewer" | "editor";
  recipientHasAccount: boolean;
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
  const sharedPath = `/shared?source=tab_share_email&editor=${encodeURIComponent(input.editorId)}`;
  const sharedUrl = `${appBaseUrl()}${sharedPath}`;
  const signupUrl = `${appBaseUrl()}/auth/signup?next=${encodeURIComponent(sharedPath)}`;
  const privacyUrl = `${appBaseUrl()}/privacy`;
  const blockUrl = tabShareBlockUrl(input.to);
  const subject = `${inviter} shared a Note2Tabs tab with you`;
  const text = `${inviter} invited you to ${permission} “${tabName}” on Note2Tabs.

${input.recipientHasAccount ? `Open the tab: ${sharedUrl}` : `Create a free account to open the tab: ${signupUrl}`}

${input.recipientHasAccount ? "Sign in using this email address to access it." : `You received this service email because ${inviter} shared a tab with this address. You have not been added to a marketing list.`}
${!input.recipientHasAccount && blockUrl ? `\nStop future tab-sharing emails: ${blockUrl}` : ""}
Privacy: ${privacyUrl}

Note2Tabs`;
  const html = renderProductEmail({
    title: `${inviter} shared a tab with you`,
    preview: `${inviter} invited you to ${permission} ${tabName}.`,
    bodyHtml: `<p style="margin:0;">You can ${permission} <strong style="color:#17201d;">${escapeEmailHtml(tabName)}</strong> on Note2Tabs.</p>`,
    action: {
      label: input.recipientHasAccount ? "Open shared tab" : "Create account to open tab",
      url: input.recipientHasAccount ? sharedUrl : signupUrl,
    },
    secondaryHtml: input.recipientHasAccount
      ? "Sign in with this email address to access it."
      : `You received this service email because ${escapeEmailHtml(inviter)} shared a tab with this email address. You have not been added to a marketing list. <a href="${privacyUrl}" style="color:#47665b;">Privacy policy</a>${blockUrl ? ` · <a href="${blockUrl}" style="color:#47665b;">Block future sharing emails</a>` : ""}`,
  });

  return { subject, text, html, sharedUrl, signupUrl };
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
