import { getConfiguredSiteUrl } from "./siteUrl";

const escapeHtml = (value: string) => value.replace(/[&<>\"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
})[character] || character);

export function buildProStartedEmail(name?: string | null) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi there,";
  const transcriberUrl = `${getConfiguredSiteUrl()}/transcribe`;
  const subject = "Your Note2Tabs Pro plan is active";
  const text = `${greeting}\n\nYour Pro plan is active. You now have 250 monthly credits, rollover up to 500, uploads up to 500 MB, and priority email support.\n\nStart transcribing: ${transcriberUrl}`;
  const html = `<div style="background:#f7f4ec;padding:32px 16px;font-family:Arial,sans-serif;color:#07110e"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #dedbd2;border-radius:20px;padding:32px"><p>${escapeHtml(greeting)}</p><h1 style="font-size:28px;margin:0 0 16px">Your Pro plan is active</h1><p style="line-height:1.6;color:#59615d">You now have 250 monthly credits, rollover up to 500, uploads up to 500 MB, and priority email support.</p><a href="${transcriberUrl}" style="display:inline-block;background:#07110e;color:#fff;text-decoration:none;border-radius:12px;padding:14px 20px;font-weight:700">Start transcribing</a></div></div>`;
  return { subject, text, html };
}
