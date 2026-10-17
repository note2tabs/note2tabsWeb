import { accountEmailLocale } from "./i18n/accountLanguage";
import { localizedEmailCopy } from "./i18n/emails";
import { localeHref, type AppLocale } from "./i18n/locale";
import crypto from "crypto";
import { prisma } from "./prisma";
import { sendTransactionalEmail } from "./email";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

const RESET_TOKEN_PREFIX = "reset:";
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1h
const RESET_CODE_LENGTH = 6;

function baseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  return "http://localhost:3000";
}

function randomResetCode() {
  return crypto.randomInt(0, 10 ** RESET_CODE_LENGTH).toString().padStart(RESET_CODE_LENGTH, "0");
}

export function buildResetIdentifier(userId: string, code: string) {
  return `${RESET_TOKEN_PREFIX}${userId}:${code}`;
}

export function buildResetIdentifierPrefix(userId: string) {
  return `${RESET_TOKEN_PREFIX}${userId}:`;
}

export function parseResetIdentifier(identifier: string) {
  if (!identifier.startsWith(RESET_TOKEN_PREFIX)) return null;
  const payload = identifier.slice(RESET_TOKEN_PREFIX.length).trim();
  const separator = payload.lastIndexOf(":");
  if (separator <= 0) return null;
  const userId = payload.slice(0, separator).trim();
  const code = payload.slice(separator + 1).trim();
  if (!userId || !code) return null;
  return { userId, code };
}

export function normalizeResetCode(value: string) {
  return value.replace(/\s+/g, "").trim();
}

export function buildPasswordResetUrl(token: string, locale: AppLocale = "en") {
  return `${baseUrl()}${localeHref(`/reset-password/${encodeURIComponent(token)}`, locale)}`;
}

export async function createPasswordResetToken(userId: string) {
  const code = randomResetCode();
  await prisma.verificationToken.deleteMany({
    where: {
      identifier: {
        startsWith: buildResetIdentifierPrefix(userId),
      },
    },
  });
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await prisma.verificationToken.create({
    data: {
      identifier: buildResetIdentifier(userId, code),
      token,
      expires,
    },
  });
  return { token, code, expires };
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  code: string,
  options?: { name?: string | null; locale?: AppLocale; accountId?:string }
) {
  const locale = options?.locale || "en";
  const url = buildPasswordResetUrl(token, locale);
  const copy = localizedEmailCopy(locale);
  if (copy) {
    const message = copy.reset;
    const name = options?.name?.trim();
    const greeting = `${copy.greeting}${name ? ` ${name}` : ""}`;
    const details = `${message.code}: ${code}\n\n`;
    return sendTransactionalEmail({language:{kind:"customer",template:"password_reset",locale,accountId:options?.accountId},to: email, subject: message.subject,
      text: `${greeting}\n\n${message.body}\n${url}\n\n${details}${message.expiry}`,
      html: renderProductEmail({locale, title: message.title, preview: message.body, greeting: escapeEmailHtml(greeting),
        bodyHtml: `<p>${escapeEmailHtml(message.body)}</p><p>${escapeEmailHtml(message.code)}: <strong dir="ltr">${escapeEmailHtml(code)}</strong></p>`, action: {label: message.title, url}, secondaryHtml: escapeEmailHtml(message.expiry)})});
  }
  const firstName = options?.name?.trim() || "there";
  const subject = "Reset your Note2Tabs password";
  const text = `Hi ${firstName},

We received a request to reset your Note2Tabs password.

Open this link to continue:
${url}

Your reset code: ${code}

This link and code expire in 1 hour. If you didn't request this, you can ignore this email.`;
  const html = renderProductEmail({
    title: "Reset your password",
    preview: "Use this link or six-digit code to reset your Note2Tabs password.",
    greeting: `Hi ${escapeEmailHtml(firstName)},`,
    bodyHtml: `<p style="margin:0 0 20px;">We received a request to reset your password.</p><p style="margin:0 0 7px;color:#747d79;font-size:13px;">Your reset code</p><p style="margin:0;color:#17201d;font-family:Menlo,Consolas,monospace;font-size:26px;font-weight:700;letter-spacing:5px;">${escapeEmailHtml(code)}</p>`,
    action: { label: "Reset password", url },
    secondaryHtml: "The link and code expire in one hour. If you did not request this, you can ignore this email.",
  });
  return sendTransactionalEmail({ language:{kind:"customer",template:"password_reset",locale,accountId:options?.accountId}, to: email, subject, html, text });
}

export async function issueAndSendPasswordResetEmail(user: {
  id: string;
  email: string;
  name?: string | null;
  locale?: AppLocale;
}) {
  const locale = await accountEmailLocale(user.id, user.locale);
  const { token, code, expires } = await createPasswordResetToken(user.id);
  const sent = await sendPasswordResetEmail(user.email, token, code, { name: user.name, locale, accountId:user.id });
  return { token, code, expires, sent };
}
