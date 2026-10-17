import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/router";
import {sendEvent} from "../lib/analytics";
import {sanitizeAnalyticsPathname} from "../lib/analyticsPrivacy";
import {useLocale} from "../lib/i18n/react";
import {localeDirection, localeFromPath, localeSwitchHref, supportsLocalizedPath, isEditorPath, LOCALE_FLAGS, LOCALE_NAMES, LOCALE_VERSION} from "../lib/i18n/locale";
import {languageMismatchTarget, mismatchCopy} from "../lib/i18n/languageMismatch";
import {saveLanguageChoice} from "../lib/i18n/preference";

export default function LanguageMismatchPrompt() {
  const router = useRouter();
  const {languageReady, languageChosen} = useLocale();
  const locale = localeFromPath(router.asPath);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const tracked = useRef<string | null>(null);
  const shown = useRef<string | null>(null);
  const browserLanguages = typeof navigator === "undefined" ? "" : (navigator.languages?.length ? navigator.languages : [navigator.language]).join(",");
  const target = languageReady && supportsLocalizedPath(router.asPath) && !isEditorPath(router.asPath)
    ? languageMismatchTarget(locale, browserLanguages) : null;
  const pair = `${locale}:${target}`;
  const path = sanitizeAnalyticsPathname(router.asPath.split(/[?#]/)[0]);
  const key = `${path}:${pair}`;
  const properties = {page_locale: locale, suggested_locale: target, browser_language: typeof navigator === "undefined" ? "" : navigator.language,
    language_choice_saved: languageChosen, mismatch_path: path, locale_version: LOCALE_VERSION};
  const visible = target !== null && !languageChosen && dismissed !== pair;

  useEffect(() => {
    if (!target || !router.isReady) return;
    if (tracked.current !== key) {
      tracked.current = key;
      sendEvent("language_mismatch_detected", properties);
    }
    if (visible && shown.current !== key) {
      shown.current = key;
      sendEvent("language_mismatch_prompt_shown", properties);
    }
  }, [key, target, visible, languageChosen, router.isReady]);

  if (!visible || !target) return null;
  const copy = mismatchCopy[target];
  return <aside className="language-mismatch" aria-label={copy.label} lang={target} dir={localeDirection(target)}>
    <div className="language-mismatch__language"><span aria-hidden="true">{LOCALE_FLAGS[target]}</span> {LOCALE_NAMES[target]}</div>
    <a className="language-mismatch__continue" href={localeSwitchHref(router.asPath, target)} onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      sendEvent("language_mismatch_prompt_accepted", properties);
      sendEvent("language_selected", {previous_locale: locale, selected_locale: target, locale_source: "mismatch_prompt", locale_version: LOCALE_VERSION});
      saveLanguageChoice(target);
      // Follow the ordinary anchor: a fresh document cannot reuse a stale locale redirect.
    }}>{copy.continue}<span aria-hidden="true"> →</span></a>
    <button className="language-mismatch__stay" type="button" onClick={() => {
      sendEvent("language_mismatch_prompt_dismissed", properties);
      setDismissed(pair);
      saveLanguageChoice(locale);
    }}>{copy.stay}</button>
  </aside>;
}
