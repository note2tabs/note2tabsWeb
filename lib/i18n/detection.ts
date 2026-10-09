import { isLocalizedPublicPath, localeFromPath, localeSwitchHref, normalizeLocale, type AppLocale } from "./locale";

/** Browsers send device language preferences in Accept-Language, in priority order. */
export function deviceLocale(acceptLanguage: string, enabled: (locale: AppLocale) => boolean): AppLocale {
  const preferences = acceptLanguage.split(",").slice(0, 30).map((part, index) => {
    const [tag, ...parameters] = part.trim().split(";");
    const quality = parameters.find(value => value.trim().startsWith("q="));
    const weight = quality ? Number(quality.trim().slice(2)) : 1;
    return { tag: tag.toLowerCase(), weight, index };
  }).filter(item => Number.isFinite(item.weight) && item.weight > 0 && item.weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of preferences) {
    const language = tag.split("-")[0];
    const locale = language === "pt" ? "pt-BR" : language === "es" ? "es" : language === "en" ? "en" : null;
    if (locale && enabled(locale)) return locale;
  }
  return "en";
}

/** Explicit translated URLs and saved choices win; only public English routes auto-detect. */
export function detectedLocaleDestination(
  path: string, acceptLanguage: string, savedLocale: string | undefined, userAgent: string,
  enabled: (locale: AppLocale) => boolean,
) {
  if (localeFromPath(path) !== "en" || !isLocalizedPublicPath(path) || /bot|crawler|spider|slurp/i.test(userAgent)) return null;
  const saved = typeof savedLocale === "string" && ["en", "pt-br", "es"].includes(savedLocale.toLowerCase())
    ? normalizeLocale(savedLocale) : null;
  const locale = saved !== null ? (enabled(saved) ? saved : "en") : deviceLocale(acceptLanguage, enabled);
  return locale === "en" ? null : localeSwitchHref(path, locale);
}
