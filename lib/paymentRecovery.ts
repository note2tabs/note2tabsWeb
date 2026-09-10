import { getConfiguredSiteUrl } from "./siteUrl";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

export const PREMIUM_PAYMENT_GRACE_DAYS = 14;
export const PREMIUM_PAYMENT_GRACE_MS = PREMIUM_PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000;

export function paymentRecoveryExpired(failedAt: Date, now = new Date()) {
  return now.getTime() - failedAt.getTime() >= PREMIUM_PAYMENT_GRACE_MS;
}

export function buildPaymentFailedEmail(input: { name?: string | null; planName?: "Premium" | "Pro" }) {
  const planName = input.planName || "Premium";
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const settingsUrl = `${getConfiguredSiteUrl()}/settings?billing=payment_failed`;
  const subject = "Please update your Note2Tabs payment method";
  const text = `${greeting}\n\nWe couldn't process your latest Note2Tabs ${planName} payment. Your ${planName} access remains available during a ${PREMIUM_PAYMENT_GRACE_DAYS}-day recovery period.\n\nUpdate your payment method: ${settingsUrl}\n\nIf the payment is not resolved during that period, ${planName} will end automatically. You can still use Note2Tabs on the Free plan.`;
  const html = renderProductEmail({
    title: `Your ${planName} payment needs attention`,
    preview: `Please update your payment method to keep Note2Tabs ${planName}.`,
    greeting: escapeEmailHtml(greeting),
    bodyHtml: `<p style="margin:0;">We could not process your latest payment. Your ${planName} access will remain available for ${PREMIUM_PAYMENT_GRACE_DAYS} days while you update your payment method.</p>`,
    action: { label: "Update payment method", url: settingsUrl },
    secondaryHtml: `If payment is not resolved, ${planName} will end automatically. Your account and tabs will remain available on the Free plan.`,
  });
  return { subject, html, text };
}
