import { creditResetCopy } from "./i18n/creditResetCopy";
import { localeHref, type AppLocale } from "./i18n/locale";
import { localizedEmailUrl } from "./i18n/renderServiceEmail";
import { reminderUnsubscribeUrl } from "./reminderUnsubscribe";
import { escapeEmailHtml, renderProductEmail } from "./emailTemplate";

export function buildCreditResetEmail(accountId: string, locale: AppLocale) {
  const c = creditResetCopy[locale];
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://www.note2tabs.com"
  ).replace(/\/$/, "");
  const url = `${base}${localeHref("/transcribe", locale)}?source=credit_reset_email`;
  const unsubscribe = localizedEmailUrl(
    reminderUnsubscribeUrl(accountId),
    locale,
  );
  if (!unsubscribe) throw new Error("Unsubscribe signing is not configured");
  return {
    subject: c[0],
    text: `${c[1]}\n\n${c[2]}: ${url}\n\n${c[3]}: ${unsubscribe}`,
    html: renderProductEmail({
      locale,
      title: c[0],
      preview: c[1],
      bodyHtml: `<p>${escapeEmailHtml(c[1])}</p>`,
      action: { label: c[2], url },
      footerHtml: `<a href="${escapeEmailHtml(unsubscribe)}">${escapeEmailHtml(c[3])}</a>`,
    }),
  };
}
