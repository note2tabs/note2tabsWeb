import { createContext, useContext, useMemo, useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/router";
import { useRouter as useOptionalRouter } from "next/compat/router";
import { getEditorCatalog } from "./editor/catalogs";
import type { UrlObject } from "url";
import { localeFromPath, localeHref, navigationLocaleForPath, localeEnabled, localeDirection, isEditorPath, type AppLocale } from "./locale";
import {deviceLocale} from "./detection";
import {restoreLanguageChoice, browserLanguageChoice, LANGUAGE_STORAGE_KEY} from "./preference";
import {localeSwitchHref, supportsLocalizedPath} from "./locale";
import { translate, registerEditorCatalog } from "./translate";
const LocaleContext = createContext<{ locale: AppLocale; navigationLocale: AppLocale; deviceLanguage:AppLocale; languageChosen:boolean; languageReady:boolean }>({ locale: "en", navigationLocale: "en", deviceLanguage:"en", languageChosen:false, languageReady:false });
export function LocaleProvider({ children, path, initialEditorLocale = "en", initialEditorMessages }: { children: ReactNode; path: string; initialEditorLocale?: AppLocale; initialEditorMessages?: Record<string,string> }) {
  useMemo(() => {
    if(initialEditorMessages)registerEditorCatalog(initialEditorLocale,initialEditorMessages);
  }, [initialEditorLocale,initialEditorMessages]);
  const router=useOptionalRouter();
  const [deviceLanguage,setDeviceLanguage]=useState<AppLocale>("en");
  const [languageChosen,setLanguageChosen]=useState(false);
  const [languageReady,setLanguageReady]=useState(false);
  const routeLocale = localeFromPath(path);
  const editor = isEditorPath(path);
  const [preferredLocale, setPreferredLocale] = useState<AppLocale>(editor ? initialEditorLocale : routeLocale);
  const [loadedEditorLocale,setLoadedEditorLocale]=useState(initialEditorLocale);
  const editorLocale=preferredLocale===initialEditorLocale && initialEditorMessages ? initialEditorLocale : loadedEditorLocale;
  const locale = editor ? (localeEnabled(editorLocale) ? editorLocale : "en") : routeLocale;
  useEffect(()=>{
    if(!editor)return;
    const target=localeEnabled(preferredLocale) ? preferredLocale : "en";
    if(target===loadedEditorLocale)return;
    if(target===initialEditorLocale && initialEditorMessages){setLoadedEditorLocale(target);return;}
    let cancelled=false;
    void getEditorCatalog(target).then(copy=>{
      if(cancelled)return;
      registerEditorCatalog(target,copy);
      setLoadedEditorLocale(target);
    }).catch(()=>{/* Retain the loaded editor language if the download fails. */});
    return()=>{cancelled=true;};
  },[editor,preferredLocale,loadedEditorLocale,initialEditorLocale,initialEditorMessages]);
  useEffect(() => {
    const detected=deviceLocale((navigator.languages?.length ? navigator.languages : [navigator.language]).join(","),localeEnabled);
    const choice=restoreLanguageChoice();
    setDeviceLanguage(detected);
    setLanguageChosen(choice!==null);
    if(choice)setPreferredLocale(choice);
    setLanguageReady(true);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    const choice=browserLanguageChoice();
    if(!choice && locale!=="en")document.cookie=`n2t_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setPreferredLocale(choice || (editor ? initialEditorLocale : routeLocale));
    setLanguageChosen(choice!==null);
  }, [path, locale, editor, initialEditorLocale, routeLocale]);
  useEffect(() => {
    const update=()=>{
      const choice=browserLanguageChoice();
      if(choice)setPreferredLocale(choice);
      setLanguageChosen(choice!==null);
    };
    const syncStorage=(event:StorageEvent)=>{
      if(event.key!==LANGUAGE_STORAGE_KEY)return;
      const choice=restoreLanguageChoice();
      if(choice)setPreferredLocale(choice);
      setLanguageChosen(choice!==null);
    };
    window.addEventListener("note2tabs:locale-changed",update);
    window.addEventListener("storage",syncStorage);
    return()=>{
      window.removeEventListener("note2tabs:locale-changed",update);
      window.removeEventListener("storage",syncStorage);
    };
  }, []);
  useEffect(()=>{
    if(!languageReady || !languageChosen || editor || !supportsLocalizedPath(path))return;
    const target=localeSwitchHref(path,localeEnabled(preferredLocale) ? preferredLocale : "en");
    if(target!==path)void router?.replace(target);
  }, [languageReady,languageChosen,editor,path,preferredLocale,router]);
  const navigationLocale = localeEnabled(preferredLocale)
    ? languageChosen ? preferredLocale : navigationLocaleForPath(path, preferredLocale) : "en";
  const value = useMemo(() => ({ locale, navigationLocale,deviceLanguage,languageChosen,languageReady }), [locale, navigationLocale,deviceLanguage,languageChosen,languageReady]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale() {
  const { locale, navigationLocale,deviceLanguage,languageChosen,languageReady } = useContext(LocaleContext);
  const t=useCallback((source:string,values?:Record<string,string|number>)=>translate(source,locale,values),[locale]);
  const href=useCallback((path:string)=>localeHref(path,navigationLocale),[navigationLocale]);
  return useMemo(() => ({ locale, navigationLocale,deviceLanguage,languageChosen,languageReady,t,href }), [locale, navigationLocale,deviceLanguage,languageChosen,languageReady,t,href]);
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
