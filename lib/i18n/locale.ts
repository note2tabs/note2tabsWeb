/** Phase-one routes only. Never manufacture translated editor/blog/legal URLs. */
export type AppLocale = "en" | "pt-BR";
export const LOCALE_VERSION = "pt-br-pilot-1";
export const LOCALIZED_PUBLIC_PATHS = ["/", "/transcribe", "/pricing"] as const;
export const LOCALIZED_FLOW_PATHS = [
  ...LOCALIZED_PUBLIC_PATHS, "/auth/login", "/auth/signup", "/auth/verify-email",
  "/reset-password", "/premium/welcome",
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
    /^\/reset-password\/[^/]+$/.test(pathname) || /^\/job\/[^/]+$/.test(pathname);
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
  const url = new URL(path, "https://note2tabs.invalid");
  for (const key of ["next", "callbackUrl"]) {
    const next = url.searchParams.get(key);
    if (next?.startsWith("/") && !next.startsWith("//") && supportsLocalizedPath(next))
      url.searchParams.set(key, localeHref(next, locale));
  }
  return localeHref(`${url.pathname}${url.search}${url.hash}`, locale);
}
