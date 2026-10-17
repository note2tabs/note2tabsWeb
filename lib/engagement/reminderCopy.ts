import { localizedEmailUrl } from "../i18n/renderServiceEmail";
import { localeHref, normalizeLocale } from "../i18n/locale";
import { reminderUnsubscribeUrl } from "../reminderUnsubscribe";
import { renderProductEmail, escapeEmailHtml } from "../emailTemplate";
import {contextualReminderCopy} from "../i18n/contextualReminderCopy";
export function buildContextualReminder(input: { accountId: string; action: string; editorId: string | null; locale: string | null }) {
  const locale = input.locale && contextualReminderCopy[input.locale] ? input.locale : "en";
  const c = contextualReminderCopy[locale];
  const index = input.action === "email_resume_practice" ? 1 : input.action === "email_resume_export_work" ? 2
    : input.action === "email_resume_import" ? 3 : input.action === "email_try_another_transcription" ? 4 : 5;
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const path = input.action === "email_try_another_transcription" ? localeHref("/transcribe", normalizeLocale(locale))
    : `/gte/${encodeURIComponent(input.editorId || "")}`;
  const url = `${base}${path}?source=engagement_reminder`;
  const unsubscribe = localizedEmailUrl(reminderUnsubscribeUrl(input.accountId),normalizeLocale(locale));
  if (!unsubscribe) throw new Error("Unsubscribe signing is not configured");
  return { subject: c[0], text: `${c[index]}\n\n${url}\n\n${c[6]}: ${unsubscribe}`,
    html: renderProductEmail({ locale: normalizeLocale(locale), title: c[0], preview: c[index], bodyHtml: `<p${locale === "ar" ? ' dir="rtl"' : ""}>${escapeEmailHtml(c[index])}</p>`,
      action: { label: c[0], url }, footerHtml: `<a href="${escapeEmailHtml(unsubscribe)}">${escapeEmailHtml(c[6])}</a>` }) };
}
