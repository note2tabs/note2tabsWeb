import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";
import { sendEvent } from "../lib/analytics";
import { LOCALE_VERSION, localeSwitchHref, supportsLocalizedPath, type AppLocale } from "../lib/i18n/locale";
import { useLocale } from "../lib/i18n/react";

export default function LanguageSelector() {
  const router = useRouter();
  const { locale } = useLocale();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const label = locale === "pt-BR" ? "Português (Brasil)" : "English";

  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [router.asPath]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) menuRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  if (process.env.NEXT_PUBLIC_PT_BR_AVAILABLE !== "true" || !supportsLocalizedPath(router.asPath)) return null;
  const select = (target: AppLocale) => {
    if (menuRef.current) menuRef.current.open = false;
    document.cookie = `n2t_locale=${target}; Path=/; Max-Age=2592000; SameSite=Lax`;
    try { window.localStorage.setItem("n2t:preferred-locale", target); } catch { /* choice still works without storage */ }
    sendEvent("language_selected", { previous_locale: locale, selected_locale: target, locale_source: "selector", locale_version: LOCALE_VERSION });
  };

  return <details ref={menuRef} className="language-selector"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}
    onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }}>
    <summary title={label} aria-label={`${locale === "pt-BR" ? "Idioma" : "Language"}: ${label}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></svg>
      <span>{locale === "pt-BR" ? "PT-BR" : "EN"}</span>
      <svg className="language-selector__chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
    </summary>
    <nav className="language-selector__options" aria-label={locale === "pt-BR" ? "Idioma" : "Language"}>
      {([['en', 'English'], ['pt-BR', 'Português (Brasil)']] as const).map(([target, name]) =>
        <Link key={target} href={localeSwitchHref(router.asPath, target)} hrefLang={target} lang={target}
          aria-current={locale === target ? "true" : undefined} onClick={() => select(target)}>{name}</Link>)}
    </nav>
  </details>;
}
