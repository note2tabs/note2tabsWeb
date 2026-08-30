import crypto from "crypto";
import { sendTransactionalEmail } from "./email";
import { prisma } from "./prisma";

type TranscriptionCompleteEmailInput = {
  name?: string | null;
  jobId: string;
  sourceLabel?: string | null;
  editorId?: string | null;
};

const MARKER_RETENTION_DAYS = 3650;

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

export function buildTranscriptionCompleteEmail(input: TranscriptionCompleteEmailInput) {
  const firstName = input.name?.trim().split(/\s+/)[0] || "there";
  const sourceLabel = input.sourceLabel?.trim() || "Your transcription";
  const editorUrl = input.editorId
    ? `${appBaseUrl()}/gte/${encodeURIComponent(input.editorId)}?source=transcription_complete_email`
    : `${appBaseUrl()}/job/${encodeURIComponent(input.jobId)}?source=transcription_complete_email`;
  const subject = "Your Note2Tabs transcription is ready";
  const text = `Hi ${firstName},

${sourceLabel} is ready. Open it in the Note2Tabs editor to play, edit, practice, and export your tabs.

Open in editor: ${editorUrl}

Note2Tabs`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#07110e;background:#f6f3ea;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dedbd2;border-radius:16px;padding:26px;">
        <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;">Your transcription is ready</h1>
        <p style="margin:0 0 18px;color:#4f5a56;">
          ${escapeHtml(sourceLabel)} is ready. Open it in the Note2Tabs editor to play, edit, practice, and export your tabs.
        </p>
        <p style="margin:0;">
          <a href="${editorUrl}" style="display:inline-block;padding:11px 16px;background:#07110e;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:650;">
            Open in editor
          </a>
        </p>
      </div>
    </div>
  `;

  return { subject, text, html, editorUrl };
}

function markerToken(userId: string, jobId: string) {
  return crypto.createHash("sha256").update(`transcription-complete:${userId}:${jobId}`).digest("hex");
}

function isUniqueConstraintFailure(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
  );
}

export async function sendTranscriptionCompleteEmailOnce(input: {
  userId: string;
  jobId: string;
  tabJobId: string;
}) {
  const result = await prisma.tabJob.findFirst({
    where: { id: input.tabJobId, userId: input.userId },
    select: {
      sourceLabel: true,
      gteEditorId: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!result?.user.email) return false;

  const marker = {
    identifier: `notice:transcription-complete:${input.jobId}`,
    token: markerToken(input.userId, input.jobId),
  };
  try {
    await prisma.verificationToken.create({
      data: {
        ...marker,
        expires: new Date(Date.now() + MARKER_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    if (isUniqueConstraintFailure(error)) return false;
    throw error;
  }

  const email = buildTranscriptionCompleteEmail({
    name: result.user.name,
    jobId: input.jobId,
    sourceLabel: result.sourceLabel,
    editorId: result.gteEditorId,
  });
  try {
    const delivered = await sendTransactionalEmail({
      to: result.user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (!delivered) {
      await prisma.verificationToken.deleteMany({ where: marker });
    }
    return delivered;
  } catch (error) {
    await prisma.verificationToken.deleteMany({ where: marker });
    throw error;
  }
}
