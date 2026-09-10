import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

type PremiumTrialReminderInput = {
  name?: string | null;
  trialEndsAt: Date;
  latestEditor?: { id: string; name?: string | null } | null;
};

type PremiumTrialStartedInput = PremiumTrialReminderInput & {
  trialStartsAt: Date;
};

const appBaseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );

export const customPremiumTrialReminderEnabled = () =>
  process.env.PREMIUM_TRIAL_REMINDER_MODE === "custom";

const formatBillingDate = (date: Date) =>
  new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

const destinationFor = (input: PremiumTrialReminderInput, source: string) => {
  const latestName = input.latestEditor?.name?.trim() || "your latest tab";
  return input.latestEditor
    ? {
        url: `${appBaseUrl()}/gte/${encodeURIComponent(input.latestEditor.id)}?mode=practice&source=${source}`,
        action: `Continue with ${latestName}`,
      }
    : {
        url: `${appBaseUrl()}/transcribe?source=${source}`,
        action: "Transcribe a recording",
      };
};

export function buildPremiumTrialStartedEmail(input: PremiumTrialStartedInput) {
  const firstName = input.name?.trim().split(/\s+/)[0] || "there";
  const startDate = formatBillingDate(input.trialStartsAt);
  const endDate = formatBillingDate(input.trialEndsAt);
  const destination = destinationFor(input, "trial_welcome");
  const settingsUrl = `${appBaseUrl()}/settings`;
  const subject = "Your Note2Tabs Premium trial has started";
  const terms = `Your 7-day trial started on ${startDate}. On ${endDate}, your subscription renews at $5.99 per month unless you cancel before then.`;
  const text = `Hi ${firstName},

${terms}

Premium includes 100 monthly transcription credits, rollover up to 200 credits, full-length audio-file transcription, and access to the Heavy model.

${destination.action}: ${destination.url}

Review or cancel online at any time: ${settingsUrl}

Note2Tabs`;
  const html = renderProductEmail({
    title: "Your Premium trial has started",
    preview: `Your trial runs through ${endDate}.`,
    greeting: `Hi ${escapeEmailHtml(firstName)},`,
    bodyHtml: `<p style="margin:0 0 16px;">${escapeEmailHtml(terms)}</p><p style="margin:0;">You now have 100 monthly credits, rollover up to 200 credits, full-length audio uploads, and access to the Heavy model.</p>`,
    action: { label: destination.action, url: destination.url },
    secondaryHtml: `You can <a href="${settingsUrl}" style="color:#4f5a56;text-decoration:underline;">review or cancel your subscription</a> at any time.`,
  });
  return { subject, text, html, continueUrl: destination.url, settingsUrl };
}

export function buildPremiumTrialReminderEmail(input: PremiumTrialReminderInput) {
  const firstName = input.name?.trim().split(/\s+/)[0] || "there";
  const endDate = formatBillingDate(input.trialEndsAt);
  const destination = destinationFor(input, "trial_reminder");
  const continueUrl = destination.url;
  const settingsUrl = `${appBaseUrl()}/settings`;
  const action = destination.action;
  const subject = `Your Note2Tabs trial ends ${endDate}`;

  const text = `Hi ${firstName},

Your Note2Tabs Premium trial ends on ${endDate}. After the trial, Premium renews at $5.99 per month unless you cancel before then.

${action}: ${continueUrl}

You can review or cancel your subscription at any time: ${settingsUrl}

Note2Tabs`;

  const html = renderProductEmail({
    title: `Your Premium trial ends ${endDate}`,
    preview: `Your Premium trial ends on ${endDate}.`,
    greeting: `Hi ${escapeEmailHtml(firstName)},`,
    bodyHtml: '<p style="margin:0;">After the trial, Premium renews at $5.99 per month unless you cancel before then.</p>',
    action: { label: action, url: continueUrl },
    secondaryHtml: `You can <a href="${settingsUrl}" style="color:#4f5a56;text-decoration:underline;">review or cancel your subscription</a> at any time.`,
  });

  return { subject, text, html, continueUrl, settingsUrl };
}
