import { createContext, useContext, useMemo, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import type { UrlObject } from "url";
import { localeFromPath, localeHref, navigationLocaleForPath, preferredLocaleFromCookie, type AppLocale } from "./locale";
import { translate } from "./translate";
const LocaleContext = createContext<{ locale: AppLocale; navigationLocale: AppLocale }>({ locale: "en", navigationLocale: "en" });
export function LocaleProvider({ children, path }: { children: ReactNode; path: string }) {
  const locale = localeFromPath(path);
  const [preferredLocale, setPreferredLocale] = useState<AppLocale>(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    if (locale === "pt-BR") document.cookie = "n2t_locale=pt-BR; Path=/; Max-Age=2592000; SameSite=Lax";
    setPreferredLocale(preferredLocaleFromCookie(document.cookie));
  }, [path, locale]);
  useEffect(() => {
    const update = () => setPreferredLocale(preferredLocaleFromCookie(document.cookie));
    window.addEventListener("note2tabs:locale-changed", update);
    return () => window.removeEventListener("note2tabs:locale-changed", update);
  }, []);
  const navigationLocale = process.env.NEXT_PUBLIC_PT_BR_AVAILABLE === "true"
    ? navigationLocaleForPath(path, preferredLocale) : "en";
  const value = useMemo(() => ({ locale, navigationLocale }), [locale, navigationLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale() {
  const { locale, navigationLocale } = useContext(LocaleContext);
  return useMemo(() => ({ locale, navigationLocale, t: (source: string, values?: Record<string, string | number>) => translate(source, locale, values), href: (path: string) => localeHref(path, navigationLocale) }), [locale, navigationLocale]);
}
/** Keep imperative navigation on translated flow routes; unsupported destinations stay English. */
export function useLocaleRouter() {
  const router = useRouter();
  const { navigationLocale } = useLocale();
  return useMemo(() => {
    const localize = (url: string | UrlObject) => typeof url === "string"
      ? localeHref(url, navigationLocale)
      : { ...url, pathname: url.pathname ? localeHref(url.pathname, navigationLocale) : url.pathname };
    return { ...router,
      push: (url: string | UrlObject, as?: string | UrlObject, options?: Parameters<typeof router.push>[2]) => router.push(localize(url), as ? localize(as) : as, options),
      replace: (url: string | UrlObject, as?: string | UrlObject, options?: Parameters<typeof router.replace>[2]) => router.replace(localize(url), as ? localize(as) : as, options),
    };
  }, [router, navigationLocale]);
}
