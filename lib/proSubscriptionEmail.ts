import { getConfiguredSiteUrl } from "./siteUrl";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

export function buildProStartedEmail(name?: string | null) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi there,";
  const transcriberUrl = `${getConfiguredSiteUrl()}/transcribe`;
  const subject = "Your Note2Tabs Pro plan is active";
  const text = `${greeting}\n\nYour Pro plan is active. You now have 250 monthly credits, rollover up to 500, uploads up to 500 MB, and priority email support.\n\nStart transcribing: ${transcriberUrl}`;
  const html = renderProductEmail({
    title: "Your Pro plan is active",
    preview: "Your Note2Tabs Pro plan is ready to use.",
    greeting: escapeEmailHtml(greeting),
    bodyHtml: '<p style="margin:0;">You now have 250 monthly credits, rollover up to 500 credits, uploads up to 500 MB, and priority email support.</p>',
    action: { label: "Start transcribing", url: transcriberUrl },
  });
  return { subject, text, html };
}
