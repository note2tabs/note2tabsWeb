import {quickLanguageOptions,saveLanguageChoice} from "../lib/i18n/preference";
import {loadPublicCatalog} from "../lib/i18n/publicCatalogs";
import {getEditorCatalog} from "../lib/i18n/editor/catalogs";
import {registerEditorCatalog} from "../lib/i18n/translate";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";
import { sendEvent } from "../lib/analytics";
import { LOCALE_VERSION, localeSwitchHref, supportsLocalizedPath, localeEnabled, LOCALE_FLAGS, LOCALE_NAMES, LOCALE_LANGUAGE_LABELS, isEditorPath, type AppLocale } from "../lib/i18n/locale";
import { useLocale } from "../lib/i18n/react";

export default function LanguageSelector() {
  const router = useRouter();
  const { locale,deviceLanguage,languageChosen,languageReady } = useLocale();
  const options=quickLanguageOptions(deviceLanguage,localeEnabled);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const selectionSequence=useRef(0);
  const label = LOCALE_NAMES[locale];

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

  if(!languageReady || languageChosen || !supportsLocalizedPath(router.asPath) || options.every(target=>target===locale))return null;
  const select = async (target: AppLocale) => {
    const sequence=++selectionSequence.current;
    if (menuRef.current) menuRef.current.open = false;
    try {
      const [, editorCopy] = await Promise.all([
        loadPublicCatalog(target),
        isEditorPath(router.asPath) ? getEditorCatalog(target) : Promise.resolve(null),
      ]);
      if(sequence!==selectionSequence.current)return;
      if(editorCopy)registerEditorCatalog(target,editorCopy);
    } catch {
      if(sequence===selectionSequence.current && menuRef.current)menuRef.current.open=true;
      return;
    }
    saveLanguageChoice(target);
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
    <summary title={label} aria-label={`${LOCALE_LANGUAGE_LABELS[locale]}: ${label}`}>
      <span className="language-flag" aria-hidden="true">{LOCALE_FLAGS[locale]}</span>
      <span>{locale === "zh-Hans" ? "ZH" : locale.toUpperCase()}</span>
      <svg className="language-selector__chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
    </summary>
    <nav className="language-selector__options" aria-label={LOCALE_LANGUAGE_LABELS[locale]}>
      {options.map(target =>
        <Link key={target} href={localeSwitchHref(router.asPath, target)} prefetch={isEditorPath(router.asPath) ? false : undefined} hrefLang={target} lang={target}
          aria-current={locale === target ? "true" : undefined} onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            // LocaleProvider navigates after saving. Let modified clicks use the link normally.
            event.preventDefault();
            void select(target);
          }} dir={target === "ar" ? "rtl" : "ltr"}><span className="language-flag" aria-hidden="true">{LOCALE_FLAGS[target]}</span><span>{LOCALE_NAMES[target]}</span></Link>)}
    </nav>
  </details>;
}
