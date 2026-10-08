import { localeHref, type AppLocale } from "./locale";
export function localizeCheckoutReturnPaths(paths: {success: string; cancel: string; manage: string}, locale: AppLocale) {
  if (locale === "en") return paths;
  return {
    success: localeHref(paths.success.replace(/next=([^&]+)/, (_, next: string) =>
      `next=${encodeURIComponent(localeHref(decodeURIComponent(next), locale))}`), locale),
    cancel: localeHref(paths.cancel, locale),
    manage: localeHref(paths.manage, locale),
  };
}
