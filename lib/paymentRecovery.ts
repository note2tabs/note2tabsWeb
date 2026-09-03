import { getConfiguredSiteUrl } from "./siteUrl";

export const PREMIUM_PAYMENT_GRACE_DAYS = 14;
export const PREMIUM_PAYMENT_GRACE_MS = PREMIUM_PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character] || character);

export function paymentRecoveryExpired(failedAt: Date, now = new Date()) {
  return now.getTime() - failedAt.getTime() >= PREMIUM_PAYMENT_GRACE_MS;
}

export function buildPaymentFailedEmail(input: { name?: string | null; planName?: "Premium" | "Pro" }) {
  const planName = input.planName || "Premium";
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const settingsUrl = `${getConfiguredSiteUrl()}/settings?billing=payment_failed`;
  const subject = "Please update your Note2Tabs payment method";
  const text = `${greeting}\n\nWe couldn't process your latest Note2Tabs ${planName} payment. Your ${planName} access remains available during a ${PREMIUM_PAYMENT_GRACE_DAYS}-day recovery period.\n\nUpdate your payment method: ${settingsUrl}\n\nIf the payment is not resolved during that period, ${planName} will end automatically. You can still use Note2Tabs on the Free plan.`;
  const html = `
    <div style="background:#f7f4ec;padding:32px 16px;font-family:Arial,sans-serif;color:#07110e">
      <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #dedbd2;border-radius:20px;padding:32px">
        <p style="margin:0 0 24px">${escapeHtml(greeting)}</p>
        <h1 style="font-size:28px;line-height:1.15;margin:0 0 16px">Your ${planName} payment needs attention</h1>
        <p style="font-size:16px;line-height:1.6;color:#59615d;margin:0 0 24px">We couldn't process your latest payment. Your ${planName} access remains available during a ${PREMIUM_PAYMENT_GRACE_DAYS}-day recovery period.</p>
        <a href="${settingsUrl}" style="display:inline-block;background:#07110e;color:#fff;text-decoration:none;border-radius:12px;padding:14px 20px;font-weight:700">Update payment method</a>
        <p style="font-size:14px;line-height:1.5;color:#747b77;margin:24px 0 0">If it isn't resolved during that period, ${planName} will end automatically. Your account and tabs will remain available on the Free plan.</p>
      </div>
    </div>`;
  return { subject, html, text };
}
