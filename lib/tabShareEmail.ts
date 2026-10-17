import { accountEmailLocale } from "./i18n/accountLanguage";
import { prisma } from "./prisma";
import { localeHref, type AppLocale } from "./i18n/locale";
import { serviceEmails, emailPhrase, sharePermissions } from "./i18n/serviceEmails";
import { renderServiceEmail, localizedEmailUrl, defaultTabLabel, anonymousInviter } from "./i18n/renderServiceEmail";
import { sendTransactionalEmail } from "./email";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";
import { tabShareBlockUrl } from "./tabShareEmailPreferences";
import { TAB_SHARE_EMAIL_SOURCE } from "./tabShareAnalytics";

export type TabShareEmailInput = {
  locale?: AppLocale;
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
  if (input.locale && input.locale !== "en") {
    const locale = input.locale, c = serviceEmails[locale];
    const values = {inviter:input.inviterName?.trim() || anonymousInviter[locale],label:input.tabName?.trim() || defaultTabLabel[locale],permission:sharePermissions[locale][input.role === "editor" ? 1 : 0]};
    const sharedPath = `/shared?source=${TAB_SHARE_EMAIL_SOURCE}&utm_source=note2tabs&utm_medium=email&utm_campaign=tab_sharing&editor=${encodeURIComponent(input.editorId)}`;
    const sharedUrl = `${appBaseUrl()}${localeHref(sharedPath,locale)}`;
    const signupUrl = `${appBaseUrl()}${localeHref(`/auth/signup?next=${encodeURIComponent(sharedPath)}&utm_source=note2tabs&utm_medium=email&utm_campaign=tab_sharing`,locale)}`;
    const blockUrl = localizedEmailUrl(tabShareBlockUrl(input.to),locale);
    const privacyUrl = `${appBaseUrl()}${localeHref("/privacy",locale)}`;
    return {...renderServiceEmail({locale,subject:emailPhrase(c.share[0],values),body:emailPhrase(c.share[1],values)+(input.recipientHasAccount ? "" : `\n\n${c.shareNew}`),
      action:input.recipientHasAccount ? c.continue : c.createAccount,url:input.recipientHasAccount ? sharedUrl : signupUrl,
      secondary:`${input.recipientHasAccount ? c.signIn : c.shareNotice}\n${c.privacy}: ${privacyUrl}`,
      footer:!input.recipientHasAccount && blockUrl ? {label:c.block,url:blockUrl} : undefined}),sharedUrl,signupUrl};
  }
  const inviter = input.inviterName?.trim() || "Someone";
  const tabName = input.tabName?.trim() || "a tab";
  const permission = input.role === "editor" ? "view and edit" : "view";
  const campaign = `source=${TAB_SHARE_EMAIL_SOURCE}&utm_source=note2tabs&utm_medium=email&utm_campaign=tab_sharing`;
  const sharedPath = `/shared?${campaign}&editor=${encodeURIComponent(input.editorId)}`;
  const sharedUrl = `${appBaseUrl()}${sharedPath}`;
  const signupUrl = `${appBaseUrl()}/auth/signup?next=${encodeURIComponent(sharedPath)}&utm_source=note2tabs&utm_medium=email&utm_campaign=tab_sharing`;
  const privacyUrl = `${appBaseUrl()}/privacy`;
  const blockUrl = tabShareBlockUrl(input.to);
  const subject = `${inviter} shared a Note2Tabs tab with you`;
  const newRecipientExplanation = `Note2Tabs is an online guitar-tab editor. ${inviter} shared “${tabName}” with you so you can ${input.role === "editor" ? "view, play, and edit the tablature" : "view the tablature, hear it played back, and follow along"}.

Create a free account using this email address to open the tab. The account makes sure the invitation is connected to the right person.`;
  const text = `${input.recipientHasAccount
    ? `${inviter} invited you to ${permission} “${tabName}” on Note2Tabs.`
    : newRecipientExplanation}

${input.recipientHasAccount ? `Open the tab: ${sharedUrl}` : `Create your account and open the tab: ${signupUrl}`}

${input.recipientHasAccount ? "Sign in using this email address to access it." : `You received this service email because ${inviter} shared a tab with this address. You have not been added to a marketing list.`}
${!input.recipientHasAccount && blockUrl ? `\nStop future tab-sharing emails: ${blockUrl}` : ""}
Privacy: ${privacyUrl}

Note2Tabs`;
  const html = renderProductEmail({
    title: `${inviter} shared a ${input.recipientHasAccount ? "tab" : "guitar tab"} with you`,
    preview: `${inviter} invited you to ${permission} ${tabName}.`,
    bodyHtml: input.recipientHasAccount
      ? `<p style="margin:0;">You can ${permission} <strong style="color:#17201d;">${escapeEmailHtml(tabName)}</strong> on Note2Tabs.</p>`
      : `<p style="margin:0 0 14px;"><strong style="color:#17201d;">Note2Tabs is an online guitar-tab editor.</strong> ${escapeEmailHtml(inviter)} shared <strong style="color:#17201d;">${escapeEmailHtml(tabName)}</strong> with you so you can ${input.role === "editor" ? "view, play, and edit the tablature" : "view the tablature, hear it played back, and follow along"}.</p><p style="margin:0;">Create a free account using this email address to open the tab. The account makes sure the invitation is connected to the right person.</p>`,
    action: {
      label: input.recipientHasAccount ? "Open shared tab" : "Create account and open tab",
      url: input.recipientHasAccount ? sharedUrl : signupUrl,
    },
    secondaryHtml: input.recipientHasAccount
      ? "Sign in with this email address to access it."
      : `You received this service email because ${escapeEmailHtml(inviter)} shared a tab with this email address. You have not been added to a marketing list. <a href="${privacyUrl}" style="color:#47665b;">Privacy policy</a>${blockUrl ? ` · <a href="${blockUrl}" style="color:#47665b;">Block future sharing emails</a>` : ""}`,
  });

  return { subject, text, html, sharedUrl, signupUrl };
}

export async function sendTabShareEmail(input: TabShareEmailInput) {
  const recipient = await prisma.user.findUnique({where:{email:input.to.toLowerCase().trim()},select:{id:true}});
  const locale = recipient ? await accountEmailLocale(recipient.id, input.locale) : "en";
  const email = buildTabShareEmail({...input,locale});
  return sendTransactionalEmail({
    language:{kind:"customer",template:"tab_share",locale,accountId:recipient?.id},
    to: input.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    analyticsCategory: "tab_share",
  });
}
