import crypto from "crypto";
import { sendTransactionalEmail } from "./email";
import { prisma } from "./prisma";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

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
  const html = renderProductEmail({
    title: "Your transcription is ready",
    preview: `${sourceLabel} is ready to open in the editor.`,
    greeting: `Hi ${escapeEmailHtml(firstName)},`,
    bodyHtml: `<p style="margin:0;"><strong style="color:#17201d;">${escapeEmailHtml(sourceLabel)}</strong> is ready. Open it to play, edit, practice, or export your tab.</p>`,
    action: { label: "Open in editor", url: editorUrl },
  });

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
