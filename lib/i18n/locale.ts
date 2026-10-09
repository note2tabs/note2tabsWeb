/** User-facing routes. The interactive /gte editor remains in English. */
export type AppLocale = "en" | "pt-BR" | "es" | "ja" | "ko" | "pl" | "ar" | "zh-Hans";
export const LOCALE_VERSION = "multilingual-site-8";
export const LOCALIZED_PUBLIC_PATHS = ["/","/transcribe","/pricing","/editor","/about","/contact","/terms","/privacy","/affiliate-program","/internship-application","/features","/audio-to-guitar-tab-converter","/mp3-to-guitar-tabs","/youtube-to-guitar-tabs","/ai-guitar-tab-generator","/free-guitar-tab-maker","/online-guitar-tab-editor","/blog"] as const;
export const LOCALIZED_FLOW_PATHS = [
  ...LOCALIZED_PUBLIC_PATHS, "/auth/login", "/auth/signup", "/auth/verify-email",
  "/reset-password", "/premium/welcome", "/settings", "/home", "/shared", "/tabs", "/account", "/history", "/affiliate", "/email/unsubscribe", "/email/share-preferences",
];
export function normalizeLocale(value: unknown): AppLocale {
  if (typeof value !== "string") return "en";
  const code = value.toLowerCase();
  return ALL_LOCALES.find(locale => locale.toLowerCase() === code) || "en";
}
export function localeFromPath(path = "/"): AppLocale {
  return normalizeLocale(path.match(/^\/([^/?#]+)(?:[/?#]|$)/)?.[1]);
}
export function stripLocale(path: string) {
  const result = path.replace(/^\/(?:pt-br|es|ja|ko|pl|ar|zh-hans)(?=\/|[?#]|$)/i, "") || "/";
  return /^[?#]/.test(result) ? `/${result}` : result;
}
export function supportsLocalizedPath(path: string) {
  const pathname = stripLocale(path).split(/[?#]/)[0].replace(/\/$/, "") || "/";
  return LOCALIZED_FLOW_PATHS.includes(pathname as typeof LOCALIZED_FLOW_PATHS[number]) ||
    /^\/reset-password\/[^/]+$/.test(pathname) || /^\/job\/[^/]+$/.test(pathname) || /^\/features\/[^/]+$/.test(pathname) ||
    /^\/blog\/(?:[^/]+|(?:category|tag|cluster)\/[^/]+)$/.test(pathname) || /^\/tabs\/[^/]+(?:\/edit)?$/.test(pathname);
}
/** English-only destinations must not erase the language chosen for navigation. */
export function navigationLocaleForPath(path: string, preferredLocale: AppLocale): AppLocale {
  return supportsLocalizedPath(path) ? localeFromPath(path) : preferredLocale;
}
export function preferredLocaleFromCookie(cookie: string): AppLocale {
  const value = cookie.split(";").map(part => part.trim()).find(part => part.startsWith("n2t_locale="))?.slice("n2t_locale=".length);
  return normalizeLocale(value);
}
export function localeHref(path: string, locale: AppLocale): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const english = stripLocale(path).replace(/^\/transcriber(?=[?#]|$)/, "/transcribe");
  if (locale === "en" || !supportsLocalizedPath(english)) return english;
  // A single canonical root for each language, without a trailing-slash variant.
  return `${localePrefix(locale)}${english.replace(/^\/(?=[?#]|$)/, "")}`;
}
export function localeAnalytics(path: string, source = "url") {
  return { content_locale: localeFromPath(path), locale_source: source, locale_version: LOCALE_VERSION };
}

/** A language switch also switches a supported authentication return destination. */
export function localeSwitchHref(path: string, locale: AppLocale) {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const url = new URL(path, "https://note2tabs.invalid");
  for (const key of ["next", "callbackUrl"]) {
    const next = url.searchParams.get(key);
    if (next?.startsWith("/") && !next.startsWith("//") && supportsLocalizedPath(next))
      url.searchParams.set(key, localeHref(next, locale));
  }
  return localeHref(`${url.pathname}${url.search}${url.hash}`, locale);
}

export function isLocalizedPublicPath(path: string) {
  const pathname = stripLocale(path).split(/[?#]/)[0].replace(/\/$/, "") || "/";
  return LOCALIZED_PUBLIC_PATHS.includes(pathname as typeof LOCALIZED_PUBLIC_PATHS[number]) || /^\/features\/[^/]+$/.test(pathname) || /^\/blog\/(?:[^/]+|(?:category|tag|cluster)\/[^/]+)$/.test(pathname);
}

export const TRANSLATED_LOCALES = ["pt-BR", "es", "ja", "ko", "pl", "ar", "zh-Hans"] as const;
export const ALL_LOCALES = ["en", ...TRANSLATED_LOCALES] as const;
export const LOCALE_NAMES: Record<AppLocale, string> = {en: "English", "pt-BR": "Português (Brasil)", es: "Español", ja: "日本語", ko: "한국어", pl: "Polski", ar: "العربية", "zh-Hans": "简体中文"};
export const LOCALE_LANGUAGE_LABELS: Record<AppLocale, string> = {en: "Language", "pt-BR": "Idioma", es: "Idioma", ja: "言語", ko: "언어", pl: "Język", ar: "اللغة", "zh-Hans": "语言"};
export const LOCALE_OPEN_GRAPH: Record<AppLocale, string> = {en: "en_US", "pt-BR": "pt_BR", es: "es_ES", ja: "ja_JP", ko: "ko_KR", pl: "pl_PL", ar: "ar_AR", "zh-Hans": "zh_CN"};
export function localeDirection(locale: AppLocale) { return locale === "ar" ? "rtl" : "ltr"; }
export function localeReleaseSwitch(locale: AppLocale) {
  return {en: undefined, "pt-BR": process.env.NEXT_PUBLIC_PT_BR_REVIEWED, es: process.env.NEXT_PUBLIC_ES_REVIEWED, ja: process.env.NEXT_PUBLIC_JA_REVIEWED, ko: process.env.NEXT_PUBLIC_KO_REVIEWED, pl: process.env.NEXT_PUBLIC_PL_REVIEWED, ar: process.env.NEXT_PUBLIC_AR_REVIEWED, "zh-Hans": process.env.NEXT_PUBLIC_ZH_HANS_REVIEWED}[locale];
}
export function localePrefix(locale: AppLocale) { return locale === "en" ? "" : `/${locale.toLowerCase()}`; }
export function localeEnabled(locale: AppLocale) { return locale === "en" || ({"pt-BR": process.env.NEXT_PUBLIC_PT_BR_AVAILABLE, es: process.env.NEXT_PUBLIC_ES_AVAILABLE, ja: process.env.NEXT_PUBLIC_JA_AVAILABLE, ko: process.env.NEXT_PUBLIC_KO_AVAILABLE, pl: process.env.NEXT_PUBLIC_PL_AVAILABLE, ar: process.env.NEXT_PUBLIC_AR_AVAILABLE, "zh-Hans": process.env.NEXT_PUBLIC_ZH_HANS_AVAILABLE}[locale]) === "true"; }
export function localeMarket(country: unknown) {
  const code = typeof country === "string" && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : "unknown";
  return code === "BR" ? "brazil" : code === "ES" ? "spain" : code === "JP" ? "japan" : code === "KR" ? "south_korea" : code === "PL" ? "poland" : code === "CN" ? "china" : ["AE","BH","DZ","EG","IQ","JO","KW","LB","LY","MA","MR","OM","PS","QA","SA","SD","SY","TN","YE"].includes(code) ? "arabic_speaking_markets" : ["AR","BO","CL","CO","CR","CU","DO","EC","GT","HN","MX","NI","PA","PE","PR","PY","SV","UY","VE"].includes(code) ? "spanish_latin_america" : code === "unknown" ? "unknown" : "other";
}
export function localeCohort(locale: AppLocale, country: unknown) {
 const visitor_country = typeof country === "string" && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : "unknown";
 return {content_locale: locale, visitor_country, visitor_market: localeMarket(visitor_country), localization_cohort: `${locale}:${visitor_country}`};
}
