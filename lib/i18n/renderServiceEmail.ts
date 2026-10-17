import { escapeEmailHtml, renderProductEmail } from "../emailTemplate";
import { localeHref, type AppLocale } from "./locale";
import { serviceEmails } from "./serviceEmails";
export function renderServiceEmail(input: { locale: AppLocale; name?: string | null; subject: string; body: string; action: string; url: string; secondary?: string; footer?: { label: string; url: string } }) {
 const c = serviceEmails[input.locale];
 const greeting = `${c.greeting}${input.name?.trim() ? ` ${input.name.trim()}` : ""}`;
 const paragraphs = input.body.split("\n\n").map(p => `<p>${escapeEmailHtml(p)}</p>`).join("");
 return { subject: input.subject.replace(/[\r\n]+/g," "),
  text: `${greeting}\n\n${input.body}\n\n${input.action}: ${input.url}${input.secondary ? `\n\n${input.secondary}` : ""}${input.footer ? `\n\n${input.footer.label}: ${input.footer.url}` : ""}`,
  html: renderProductEmail({ locale: input.locale, title: input.subject, preview: input.body, greeting: escapeEmailHtml(greeting), bodyHtml: paragraphs,
   action:{label:input.action,url:input.url}, secondaryHtml:input.secondary ? escapeEmailHtml(input.secondary) : undefined,
   footerHtml:input.footer ? `<a href="${escapeEmailHtml(input.footer.url)}">${escapeEmailHtml(input.footer.label)}</a>` : undefined }),
 };
}
export const defaultTabLabel: Record<AppLocale,string> = {en:"your tab",es:"tu tablatura","pt-BR":"sua tablatura",fr:"votre tablature",it:"la tua tablatura",pl:"Twoja tabulatura",ja:"保存したTAB譜",ko:"저장한 타브 악보","zh-Hans":"您的六线谱",ar:"التاب الخاص بك"};
export const anonymousInviter: Record<AppLocale,string> = {en:"Someone",es:"Alguien","pt-BR":"Alguém",fr:"Une personne",it:"Una persona",pl:"Inny użytkownik",ja:"ユーザー",ko:"다른 사용자","zh-Hans":"一位用户",ar:"أحد المستخدمين"};

export function localizedEmailUrl(url: string | null, locale: AppLocale): string | null {
 if (!url) return null;
 const parsed = new URL(url);
 parsed.pathname = localeHref(parsed.pathname,locale);
 return parsed.toString();
}
