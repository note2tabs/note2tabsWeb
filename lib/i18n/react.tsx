import { createContext, useContext, useMemo, useEffect, type ReactNode } from "react";
import { useRouter } from "next/router";
import type { UrlObject } from "url";
import { localeFromPath, localeHref, type AppLocale } from "./locale";
import { translate } from "./translate";
const LocaleContext = createContext<AppLocale>("en");
export function LocaleProvider({ children, path }: { children: ReactNode; path: string }) {
  const locale = localeFromPath(path);
  useEffect(() => {
    if (locale === "pt-BR") document.cookie = "n2t_locale=pt-BR; Path=/; Max-Age=2592000; SameSite=Lax";
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useLocale() {
  const locale = useContext(LocaleContext);
  return useMemo(() => ({ locale, t: (source: string, values?: Record<string, string | number>) => translate(source, locale, values), href: (path: string) => localeHref(path, locale) }), [locale]);
}
/** Keep imperative navigation on translated flow routes; unsupported destinations stay English. */
export function useLocaleRouter() {
  const router = useRouter();
  const { locale } = useLocale();
  return useMemo(() => {
    const localize = (url: string | UrlObject) => typeof url === "string"
      ? localeHref(url, locale)
      : { ...url, pathname: url.pathname ? localeHref(url.pathname, locale) : url.pathname };
    return { ...router,
      push: (url: string | UrlObject, as?: string | UrlObject, options?: Parameters<typeof router.push>[2]) => router.push(localize(url), as ? localize(as) : as, options),
      replace: (url: string | UrlObject, as?: string | UrlObject, options?: Parameters<typeof router.replace>[2]) => router.replace(localize(url), as ? localize(as) : as, options),
    };
  }, [router, locale]);
}
