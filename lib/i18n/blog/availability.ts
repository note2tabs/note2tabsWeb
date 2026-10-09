import portuguese from "./revisions.json";
import japanese from "./ja-revisions.json";
import spanish from "./es-revisions.json";
import { TRANSLATED_LOCALES, type AppLocale } from "../locale";
export function articleLocales(slug: string, updatedAt: string): AppLocale[] {
 return TRANSLATED_LOCALES.filter(locale => ((locale === "ja" ? japanese : locale === "es" ? spanish : locale === "pt-BR" ? portuguese : {}) as Record<string,string>)[slug] === updatedAt);
}
