import type {AppLocale} from "./locale";
import en from "./en.json";
import ptBR from "./pt-BR.json";
import es from "./es.json";
import ja from "./ja.json";
import ko from "./ko.json";
import pl from "./pl.json";
import ar from "./ar.json";
import zhHans from "./zh-Hans.json";
import fr from "./fr.json";
import it from "./it.json";

// Imported by _document only. The browser receives one catalog in the HTML.
export const serverPublicCatalogs: Record<AppLocale, Record<string, string>> = {
  en, "pt-BR": ptBR, es, ja, ko, pl, ar, "zh-Hans": zhHans, fr, it,
};

export function publicMessagesForDocument(locale: AppLocale) {
  const catalog = serverPublicCatalogs[locale];
  // English source strings already serve as their own fallback. Keep its few overrides.
  const messages = locale === "en"
    ? Object.fromEntries(Object.entries(catalog).filter(([key, value]) => key !== value))
    : catalog;
  // A translated message must never be able to close the JSON script element.
  return JSON.stringify({locale, messages}).replace(/</g, "\\u003c");
}
