import crypto from "crypto";
import { prisma } from "./prisma";

const BLOCK_PREFIX = "email:tab-share-blocked:";
const SENT_PREFIX = "email:tab-share-sent:";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function secret() {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || "";
}

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeShareEmail(email: string) {
  return email.trim().toLowerCase();
}

function blockedMarker(email: string) {
  const hash = digest(normalizeShareEmail(email));
  return { identifier: `${BLOCK_PREFIX}${hash}`, token: `blocked:${hash}` };
}

function sentMarker(senderId: string, editorId: string, email: string) {
  const hash = digest(`${senderId}\0${editorId}\0${normalizeShareEmail(email)}`);
  return { identifier: `${SENT_PREFIX}${hash}`, token: `sent:${hash}` };
}

export function createTabShareBlockToken(email: string) {
  const keyMaterial = secret();
  if (!keyMaterial) return null;
  const key = crypto.createHash("sha256").update(keyMaterial).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalizeShareEmail(email), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function readTabShareBlockToken(token: string) {
  const keyMaterial = secret();
  if (!keyMaterial) return null;
  try {
    const payload = Buffer.from(token, "base64url");
    if (payload.length < 29) return null;
    const key = crypto.createHash("sha256").update(keyMaterial).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    const email = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
    return email.includes("@") ? normalizeShareEmail(email) : null;
  } catch {
    return null;
  }
}

export function tabShareBlockUrl(email: string) {
  const token = createTabShareBlockToken(email);
  if (!token) return null;
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/email/share-preferences?token=${encodeURIComponent(token)}`;
}

export async function blockTabShareEmails(email: string) {
  const marker = blockedMarker(email);
  await prisma.verificationToken.upsert({
    where: { identifier_token: marker },
    create: { ...marker, expires: new Date("9999-12-31T00:00:00.000Z") },
    update: { expires: new Date("9999-12-31T00:00:00.000Z") },
  });
}

export async function isTabShareEmailBlocked(email: string) {
  const marker = blockedMarker(email);
  return Boolean(await prisma.verificationToken.findUnique({ where: { identifier_token: marker }, select: { token: true } }));
}

/** Atomically-enough suppresses repeat notifications for the same share for 24 hours. */
export async function claimTabShareEmailDelivery(senderId: string, editorId: string, email: string) {
  const marker = sentMarker(senderId, editorId, email);
  const now = new Date();
  const existing = await prisma.verificationToken.findUnique({
    where: { identifier_token: marker },
    select: { expires: true },
  });
  if (existing && existing.expires > now) return false;
  if (existing) await prisma.verificationToken.deleteMany({ where: marker });
  try {
    await prisma.verificationToken.create({
      data: { ...marker, expires: new Date(now.getTime() + COOLDOWN_MS) },
    });
    return true;
  } catch {
    return false;
  }
}

export async function releaseTabShareEmailDelivery(senderId: string, editorId: string, email: string) {
  await prisma.verificationToken.deleteMany({ where: sentMarker(senderId, editorId, email) });
}
