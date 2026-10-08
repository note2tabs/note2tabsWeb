import portuguese from "./revisions.json";
import spanish from "./es-revisions.json";
import { TRANSLATED_LOCALES, type AppLocale } from "../locale";
export function articleLocales(slug: string, updatedAt: string): AppLocale[] {
 return TRANSLATED_LOCALES.filter(locale => ((locale === "es" ? spanish : portuguese) as Record<string,string>)[slug] === updatedAt);
}
