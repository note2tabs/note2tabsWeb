import {useEffect,useState} from "react";
import {useRouter} from "next/router";
import {useLocale} from "../lib/i18n/react";
import {localeEnabled,localeSwitchHref,LOCALE_NAMES,LOCALE_LANGUAGE_LABELS,type AppLocale} from "../lib/i18n/locale";
import {browserLanguageChoice,saveLanguageChoice,settingsLanguageOptions} from "../lib/i18n/preference";
import {sendEvent} from "../lib/analytics";

export default function LanguagePreference() {
 const {locale,deviceLanguage,languageReady,t}=useLocale();
 const router=useRouter();
 const [selected,setSelected]=useState<AppLocale>(locale);
 const [saved,setSaved]=useState(false);
 useEffect(()=>{
  const choice=browserLanguageChoice() || locale;
  setSelected(localeEnabled(choice) ? choice : "en");
 },[locale]);
 const options=settingsLanguageOptions(deviceLanguage,locale,localeEnabled);
 const save=async()=>{
  saveLanguageChoice(selected);
  setSaved(true);
  sendEvent("language_selected",{previous_locale:locale,selected_locale:selected,locale_source:"settings"});
  const target=localeSwitchHref(router.asPath,selected);
  if(target!==router.asPath)await router.replace(target);
 };
 return <section className="settingsSection" id="language" aria-labelledby="settings-language-title">
  <h2 className="settingsSectionTitle" id="settings-language-title">{t("Language")}</h2>
  <p className="settingsSectionIntro">{t("Use your device language or English. Your choice is saved in this browser.")}</p>
  <div className="settingsRows"><div className="settingsRow"><div className="settingsRowMain">
   <label className="settingsRowLabel" htmlFor="site-language">{t("Language")}</label>
  </div><div className="settingsRowValue settingsLanguageActions">
   <select id="site-language" value={selected} onChange={event=>{setSelected(event.target.value as AppLocale);setSaved(false);}} disabled={!languageReady} aria-label={LOCALE_LANGUAGE_LABELS[locale]}>
    {options.map(option=><option key={option} value={option} lang={option} dir={option==="ar"?"rtl":"ltr"}>{option==="en" ? LOCALE_NAMES.en : option===deviceLanguage ? t("Device language: {language}",{language:LOCALE_NAMES[option]}) : t("Saved language: {language}",{language:LOCALE_NAMES[option]})}</option>)}
   </select>
   <button className="settingsButton settingsButtonPrimary" type="button" onClick={()=>void save()} disabled={!languageReady}>{t("Save language")}</button>
  </div></div></div>
  {saved && <p className="settingsSectionIntro" role="status">{t("Language saved.")}</p>}
 </section>;
}
