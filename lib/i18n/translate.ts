import {flowMessages} from "./flowMessages";
import {languagePreferenceMessages} from "./languagePreferenceMessages";
import { editorTemplate } from "./editor/messages";
import { ALL_LOCALES, type AppLocale } from "./locale";
export const catalogs = Object.fromEntries(ALL_LOCALES.map(locale => [locale, {...languagePreferenceMessages[locale], ...flowMessages[locale]}])) as Record<AppLocale, Record<string,string>>;
const publicCatalogsLoaded = new Set<AppLocale>();
const renderedMessages: Partial<Record<AppLocale, RegExp[]>> = {};
export function registerPublicCatalog(locale: AppLocale, messages: Record<string,string>) {
  catalogs[locale] = {...messages, ...languagePreferenceMessages[locale], ...flowMessages[locale], ...editorDictionaries[locale]};
  publicCatalogsLoaded.add(locale);
  delete renderedMessages[locale];
}
export function hasPublicCatalog(locale: AppLocale) { return publicCatalogsLoaded.has(locale); }
const editorDictionaries: Partial<Record<AppLocale, Record<string,string>>> = {};
export function registerEditorCatalog(locale:AppLocale, messages:Record<string,string>) {
 if(editorDictionaries[locale] === messages)return;
 editorDictionaries[locale]=messages;
 catalogs[locale]={...catalogs[locale],...messages};
 delete renderedMessages[locale];
}
export function translate(source: string, locale: AppLocale, values: Record<string, string | number> = {}) {
  const key = source.trim();
  const catalog: Record<string, string> = catalogs[locale];
  const dynamic = !Object.prototype.hasOwnProperty.call(catalog, key) ? editorTemplate(key) : null;
  const messageKey = dynamic?.source || key;
  const message = Object.prototype.hasOwnProperty.call(catalog, messageKey) ? catalog[messageKey] : messageKey;
  values = {...dynamic?.values, ...values};
  // Preserve intentional boundary whitespace around inline elements.
  const rendered = message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
  return `${source.match(/^\s*/)?.[0] || ""}${rendered}${source.match(/\s*$/)?.[0] || ""}`;
}
function messagePatterns(locale: AppLocale) {
  return renderedMessages[locale] ||= Object.values(catalogs[locale]).map(message => new RegExp(
    "^" + message.split(/\{[a-zA-Z][a-zA-Z0-9_]*\}/)
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$"
  ));
}
export function translatedError(source: string | null | undefined, locale: AppLocale) {
  if (!source) return source;
  if (locale !== "en" && messagePatterns(locale).some(pattern => pattern.test(source.trim()))) return source;
  if (locale === "en" || Object.prototype.hasOwnProperty.call(catalogs[locale], source.trim()) || Object.prototype.hasOwnProperty.call(catalogs.en, source.trim()) || editorTemplate(source.trim())) return translate(source, locale);
  return locale === "fr" ? "Impossible de terminer cette opération. Réessayez ou contactez support@note2tabs.com." : locale === "it" ? "Impossibile completare questa operazione. Riprova o contatta support@note2tabs.com." : locale === "ko" ? "작업을 완료하지 못했습니다. 다시 시도하거나 support@note2tabs.com으로 문의하세요." : locale === "pl" ? "Nie udało się wykonać tej czynności. Spróbuj ponownie lub napisz na support@note2tabs.com." : locale === "ar" ? "تعذّر إكمال العملية. حاول مجددًا أو تواصل مع support@note2tabs.com." : locale === "zh-Hans" ? "无法完成此操作。请重试或联系 support@note2tabs.com。" : locale === "ja" ? "処理を完了できませんでした。もう一度お試しいただくか、support@note2tabs.com までお問い合わせください。" : locale === "es" ? "No se pudo completar esta acción. Inténtalo de nuevo o contacta con support@note2tabs.com." : "Não foi possível concluir esta ação. Tente novamente ou entre em contato com support@note2tabs.com.";
}

// Next removes this server-only branch from browser bundles. Public messages
// are embedded once for the current document, never all ten dictionaries.
if (typeof window === "undefined") {
  const serverPublicCatalogs: Record<AppLocale, Record<string, string>> = {
    "en": require("./en.json"),
    "pt-BR": require("./pt-BR.json"),
    "es": require("./es.json"),
    "ja": require("./ja.json"),
    "zh-Hans": require("./zh-Hans.json"),
    "ar": require("./ar.json"),
    "pl": require("./pl.json"),
    "ko": require("./ko.json"),
    "fr": require("./fr.json"),
    "it": require("./it.json"),
  };
  for (const locale of ALL_LOCALES) registerPublicCatalog(locale, serverPublicCatalogs[locale]);
} else {
  const initial = document.getElementById("n2t-public-messages");
  if (initial?.textContent) {
    const payload = JSON.parse(initial.textContent) as {locale: AppLocale; messages: Record<string,string>};
    if (ALL_LOCALES.includes(payload.locale)) registerPublicCatalog(payload.locale, payload.messages);
  }
}
