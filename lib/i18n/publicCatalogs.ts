import type {AppLocale} from "./locale";
import {hasPublicCatalog, registerPublicCatalog} from "./translate";
const pending: Partial<Record<AppLocale, Promise<void>>> = {};
const loaders = {
 "en":()=>import("./en.json"),
 "pt-BR":()=>import("./pt-BR.json"),
 "es":()=>import("./es.json"),
 "ja":()=>import("./ja.json"),
 "ko":()=>import("./ko.json"),
 "pl":()=>import("./pl.json"),
 "ar":()=>import("./ar.json"),
 "zh-Hans":()=>import("./zh-Hans.json"),
 "fr":()=>import("./fr.json"),
 "it":()=>import("./it.json")
};
/** Language switches reuse cached messages; a failed download can be retried. */
export function loadPublicCatalog(locale: AppLocale): Promise<void> {
 if(hasPublicCatalog(locale)) return Promise.resolve();
 return pending[locale] ||= loaders[locale]().then(module => {registerPublicCatalog(locale,module.default);}).catch(error => {delete pending[locale];throw error;});
}
