import crypto from "crypto";
import { prisma } from "./prisma";
import { sendTransactionalEmail } from "./email";

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

export function buildPasswordResetUrl(token: string) {
  return `${baseUrl()}/reset-password/${encodeURIComponent(token)}`;
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
  options?: { name?: string | null }
) {
  const url = buildPasswordResetUrl(token);
  const firstName = options?.name?.trim() || "there";
  const subject = "Reset your Note2Tabs password";
  const text = `Hi ${firstName},

We received a request to reset your Note2Tabs password.

Open this link to continue:
${url}

Your reset code: ${code}

This link and code expire in 1 hour. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.45; color:#0f172a;">
      <p>Hi ${firstName},</p>
      <p>We received a request to reset your Note2Tabs password.</p>
      <p>
        <a href="${url}" style="display:inline-block;padding:10px 14px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">
          Reset password
        </a>
      </p>
      <p>Enter this reset code on the website:</p>
      <p style="font-size:24px;letter-spacing:4px;font-weight:700;">${code}</p>
      <p style="font-size:13px;color:#475569;">This link and code expire in 1 hour.</p>
      <p style="font-size:13px;color:#475569;">If you did not request this, you can ignore this email.</p>
    </div>
  `;
  return sendTransactionalEmail({ to: email, subject, html, text });
}

export async function issueAndSendPasswordResetEmail(user: {
  id: string;
  email: string;
  name?: string | null;
}) {
  const { token, code, expires } = await createPasswordResetToken(user.id);
  const sent = await sendPasswordResetEmail(user.email, token, code, { name: user.name });
  return { token, code, expires, sent };
}
