import portuguese from "./revisions.json";
import japanese from "./ja-revisions.json";
import spanish from "./es-revisions.json";
import korean from "./ko-revisions.json";
import polish from "./pl-revisions.json";
import arabic from "./ar-revisions.json";
import chinese from "./zh-Hans-revisions.json";
import { TRANSLATED_LOCALES, type AppLocale } from "../locale";
const revisions: Partial<Record<AppLocale, Record<string, string>>> = {
 "pt-BR": portuguese, es: spanish, ja: japanese,
 ko: korean, pl: polish, ar: arabic, "zh-Hans": chinese,
};
export function articleLocales(slug: string, updatedAt: string): AppLocale[] {
 return TRANSLATED_LOCALES.filter(locale => revisions[locale]?.[slug] === updatedAt);
}
