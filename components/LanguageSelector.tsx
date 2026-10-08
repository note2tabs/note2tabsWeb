import Link from "next/link";
import { useRouter } from "next/router";
import { sendEvent } from "../lib/analytics";
import { LOCALE_VERSION, localeSwitchHref, supportsLocalizedPath, type AppLocale } from "../lib/i18n/locale";
import { useLocale } from "../lib/i18n/react";
export default function LanguageSelector() {
  const router = useRouter();
  const { locale } = useLocale();
  if (process.env.NEXT_PUBLIC_PT_BR_AVAILABLE !== "true" || !supportsLocalizedPath(router.asPath)) return null;
  const select = (target: AppLocale) => {
    document.cookie = `n2t_locale=${target}; Path=/; Max-Age=2592000; SameSite=Lax`;
    try { window.localStorage.setItem("n2t:preferred-locale", target); } catch { /* choice still works without storage */ }
    sendEvent("language_selected", { previous_locale: locale, selected_locale: target, locale_source: "selector", locale_version: LOCALE_VERSION });
  };
  return <nav className="language-selector" aria-label={locale === "pt-BR" ? "Idioma" : "Language"}>
    {([['en', 'English'], ['pt-BR', 'Português (Brasil)']] as const).map(([target, label]) =>
      <Link key={target} href={localeSwitchHref(router.asPath, target)} hrefLang={target} lang={target}
        aria-current={locale === target ? "true" : undefined} onClick={() => select(target)}>{label}</Link>)}
  </nav>;
}
