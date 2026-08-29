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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#07110e;background:#f6f3ea;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dedbd2;border-radius:16px;padding:26px;">
        <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;">Your Premium trial has started</h1>
        <p style="margin:0 0 14px;color:#4f5a56;">${escapeHtml(terms)}</p>
        <p style="margin:0 0 18px;color:#4f5a56;">Premium includes 100 monthly transcription credits, rollover up to 200 credits, full-length audio-file transcription, and access to the Heavy model.</p>
        <p style="margin:0 0 18px;"><a href="${destination.url}" style="display:inline-block;padding:11px 16px;background:#07110e;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:650;">${escapeHtml(destination.action)}</a></p>
        <p style="margin:0;color:#68726e;font-size:13px;">You can <a href="${settingsUrl}" style="color:#195e4c;">review or cancel your subscription online</a> at any time.</p>
      </div>
    </div>
  `;
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

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#07110e;background:#f6f3ea;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dedbd2;border-radius:16px;padding:26px;">
        <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;">Your Premium trial ends ${escapeHtml(endDate)}</h1>
        <p style="margin:0 0 18px;color:#4f5a56;">
          After the trial, Premium renews at $5.99 per month unless you cancel before then.
        </p>
        <p style="margin:0 0 18px;">
          <a href="${continueUrl}" style="display:inline-block;padding:11px 16px;background:#07110e;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:650;">
            ${escapeHtml(action)}
          </a>
        </p>
        <p style="margin:0;color:#68726e;font-size:13px;">
          You can <a href="${settingsUrl}" style="color:#195e4c;">review or cancel your subscription</a> at any time.
        </p>
      </div>
    </div>
  `;

  return { subject, text, html, continueUrl, settingsUrl };
}
