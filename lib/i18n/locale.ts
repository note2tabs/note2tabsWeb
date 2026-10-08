/** User-facing routes. The interactive /gte editor remains in English. */
export type AppLocale = "en" | "pt-BR";
export const LOCALE_VERSION = "pt-br-site-2";
export const LOCALIZED_PUBLIC_PATHS = ["/","/transcribe","/pricing","/editor","/about","/contact","/terms","/privacy","/affiliate-program","/internship-application","/features","/audio-to-guitar-tab-converter","/mp3-to-guitar-tabs","/youtube-to-guitar-tabs","/ai-guitar-tab-generator","/free-guitar-tab-maker","/online-guitar-tab-editor","/blog"] as const;
export const LOCALIZED_FLOW_PATHS = [
  ...LOCALIZED_PUBLIC_PATHS, "/auth/login", "/auth/signup", "/auth/verify-email",
  "/reset-password", "/premium/welcome", "/settings", "/home", "/shared", "/tabs", "/account", "/history", "/affiliate", "/email/unsubscribe", "/email/share-preferences",
];
export function normalizeLocale(value: unknown): AppLocale {
  return typeof value === "string" && value.toLowerCase() === "pt-br" ? "pt-BR" : "en";
}
export function localeFromPath(path: string): AppLocale {
  return /^\/pt-br(?:\/|[?#]|$)/i.test(path) ? "pt-BR" : "en";
}
export function stripLocale(path: string) {
  const result = path.replace(/^\/pt-br(?=\/|[?#]|$)/i, "") || "/";
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
  if (locale !== "pt-BR" || !supportsLocalizedPath(english)) return english;
  // A single canonical root, with no competing /pt-br/ variant.
  return `/pt-br${english.replace(/^\/(?=[?#]|$)/, "")}`;
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
