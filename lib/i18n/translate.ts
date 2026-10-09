import english from "./en.json";
import portuguese from "./pt-BR.json";
import spanish from "./es.json";
import japanese from "./ja.json";
import korean from "./ko.json";
import polish from "./pl.json";
import arabic from "./ar.json";
import chinese from "./zh-Hans.json";
import type { AppLocale } from "./locale";
export const catalogs: Record<AppLocale, Record<string, string>> = {en: english, "pt-BR": portuguese, es: spanish, ja: japanese, ko: korean, pl: polish, ar: arabic, "zh-Hans": chinese};
export function translate(source: string, locale: AppLocale, values: Record<string, string | number> = {}) {
  const key = source.trim();
  const catalog: Record<string, string> = catalogs[locale];
  const message = Object.prototype.hasOwnProperty.call(catalog, key) ? catalog[key] : key;
  // Preserve intentional boundary whitespace around inline elements.
  const rendered = message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
  return `${source.match(/^\s*/)?.[0] || ""}${rendered}${source.match(/\s*$/)?.[0] || ""}`;
}
const renderedMessages = Object.fromEntries(Object.entries(catalogs).map(([locale, catalog]) => [locale, Object.values(catalog).map(message => new RegExp(
  "^" + message.split(/\{[a-zA-Z][a-zA-Z0-9_]*\}/)
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$"
))]));
export function translatedError(source: string | null | undefined, locale: AppLocale) {
  if (!source) return source;
  if (locale !== "en" && renderedMessages[locale]?.some(pattern => pattern.test(source.trim()))) return source;
  if (locale === "en" || Object.prototype.hasOwnProperty.call(english, source.trim())) return translate(source, locale);
  return locale === "ko" ? "작업을 완료하지 못했습니다. 다시 시도하거나 support@note2tabs.com으로 문의하세요." : locale === "pl" ? "Nie udało się wykonać tej czynności. Spróbuj ponownie lub napisz na support@note2tabs.com." : locale === "ar" ? "تعذّر إكمال العملية. حاول مجددًا أو تواصل مع support@note2tabs.com." : locale === "zh-Hans" ? "无法完成此操作。请重试或联系 support@note2tabs.com。" : locale === "ja" ? "処理を完了できませんでした。もう一度お試しいただくか、support@note2tabs.com までお問い合わせください。" : locale === "es" ? "No se pudo completar esta acción. Inténtalo de nuevo o contacta con support@note2tabs.com." : "Não foi possível concluir esta ação. Tente novamente ou entre em contato com support@note2tabs.com.";
}
