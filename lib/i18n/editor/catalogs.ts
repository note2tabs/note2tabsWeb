import type { AppLocale } from "../locale";
/** Load only the chosen editor language; public pages do not download editor dictionaries. */
export async function getEditorCatalog(locale:AppLocale):Promise<Record<string,string>> {
 const loaders={
  en:()=>import("./en.json"), "pt-BR":()=>import("./pt-BR.json"), es:()=>import("./es.json"),
  ja:()=>import("./ja.json"), ko:()=>import("./ko.json"), pl:()=>import("./pl.json"),
  ar:()=>import("./ar.json"), "zh-Hans":()=>import("./zh-Hans.json"),
 };
 return (await loaders[locale]()).default;
}
