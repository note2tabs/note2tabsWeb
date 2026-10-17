import { accountEmailLocale } from "./i18n/accountLanguage";
import { localizedEmailCopy } from "./i18n/emails";
import { localeHref, type AppLocale } from "./i18n/locale";
import crypto from "crypto";
import { prisma } from "./prisma";
import { sendTransactionalEmail } from "./email";
import { normalizeSafeReturnPath } from "./safeReturnPath";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

const VERIFY_TOKEN_PREFIX = "verify:";
const VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h

function baseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  return "http://localhost:3000";
}

export function buildVerifyIdentifier(userId: string) {
  return `${VERIFY_TOKEN_PREFIX}${userId}`;
}

export function parseVerifyUserId(identifier: string): string | null {
  if (!identifier.startsWith(VERIFY_TOKEN_PREFIX)) return null;
  const userId = identifier.slice(VERIFY_TOKEN_PREFIX.length).trim();
  return userId || null;
}

export async function createEmailVerificationToken(userId: string) {
  const identifier = buildVerifyIdentifier(userId);
  await prisma.verificationToken.deleteMany({
    where: { identifier },
  });
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
  await prisma.verificationToken.create({
    data: {
      identifier,
      token,
      expires,
    },
  });
  return token;
}

export function buildVerificationUrl(
  token: string,
  email?: string,
  returnTo?: string,
  locale: AppLocale = "en"
) {
  const url = new URL(localeHref("/auth/verify-email", locale), baseUrl());
  url.searchParams.set("token", token);
  if (email) url.searchParams.set("email", email);
  if (returnTo) {
    url.searchParams.set("next", normalizeSafeReturnPath(returnTo));
  }
  return url.toString();
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  options?: { name?: string | null; returnTo?: string; locale?: AppLocale; accountId?:string }
) {
  const locale = options?.locale || "en";
  const url = buildVerificationUrl(token, email, options?.returnTo, locale);
  const copy = localizedEmailCopy(locale);
  if (copy) {
    const message = copy.verification;
    const name = options?.name?.trim();
    const greeting = `${copy.greeting}${name ? ` ${name}` : ""}`;
    return sendTransactionalEmail({language:{kind:"customer",template:"verification",locale,accountId:options?.accountId},to: email, subject: message.subject,
      text: `${greeting}\n\n${message.body}\n${url}\n\n${message.expiry}`,
      html: renderProductEmail({locale, title: message.title, preview: message.body, greeting: escapeEmailHtml(greeting),
        bodyHtml: `<p>${escapeEmailHtml(message.body)}</p>`, action: {label: message.title, url}, secondaryHtml: escapeEmailHtml(message.expiry)})});
  }
  const firstName = options?.name?.trim() || "there";
  const subject = "Verify your Note2Tabs account";
  const text = `Hi ${firstName},\n\nPlease verify your email to use the transcriber:\n${url}\n\nIf you didn't create this account, you can ignore this email.`;
  const html = renderProductEmail({
    title: "Verify your email",
    preview: "Verify your email address to finish setting up Note2Tabs.",
    greeting: `Hi ${escapeEmailHtml(firstName)},`,
    bodyHtml: '<p style="margin:0;">Verify your email address to finish setting up your account and use the transcriber.</p>',
    action: { label: "Verify email", url },
    secondaryHtml: `This link expires in 24 hours. If you did not create a Note2Tabs account, you can ignore this email.<br><br><a href="${url}" style="color:#4f5a56;text-decoration:underline;word-break:break-all;">Copy verification link</a>`,
  });
  return sendTransactionalEmail({ language:{kind:"customer",template:"verification",locale,accountId:options?.accountId}, to: email, subject, html, text });
}

export async function issueAndSendVerificationEmail(user: {
  id: string;
  email: string;
  name?: string | null;
}, options?: { returnTo?: string; locale?: AppLocale; accountId?:string }) {
  const locale = await accountEmailLocale(user.id, options?.locale);
  const token = await createEmailVerificationToken(user.id);
  const sent = await sendVerificationEmail(user.email, token, {
    accountId:user.id,
    name: user.name,
    returnTo: options?.returnTo,
    locale,
  });
  return { token, sent };
}
