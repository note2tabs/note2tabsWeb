import crypto from "crypto";
import { prisma } from "./prisma";
import { sendTransactionalEmail } from "./email";
import { normalizeSafeReturnPath } from "./safeReturnPath";

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
  returnTo?: string
) {
  const url = new URL("/auth/verify-email", baseUrl());
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
  options?: { name?: string | null; returnTo?: string }
) {
  const url = buildVerificationUrl(token, email, options?.returnTo);
  const firstName = options?.name?.trim() || "there";
  const subject = "Verify your Note2Tabs account";
  const text = `Hi ${firstName},\n\nPlease verify your email to use the transcriber:\n${url}\n\nIf you didn't create this account, you can ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.45; color:#0f172a;">
      <p>Hi ${firstName},</p>
      <p>Please verify your email to use the Note2Tabs transcriber.</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 14px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">Verify email</a></p>
      <p style="font-size:13px;color:#475569;">Or copy this link: ${url}</p>
      <p style="font-size:13px;color:#475569;">If you did not create this account, you can ignore this email.</p>
    </div>
  `;
  return sendTransactionalEmail({ to: email, subject, html, text });
}

export async function issueAndSendVerificationEmail(user: {
  id: string;
  email: string;
  name?: string | null;
}, options?: { returnTo?: string }) {
  const token = await createEmailVerificationToken(user.id);
  const sent = await sendVerificationEmail(user.email, token, {
    name: user.name,
    returnTo: options?.returnTo,
  });
  return { token, sent };
}
