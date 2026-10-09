import {afterEach,describe,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
import {ALL_LOCALES,localeSwitchHref} from "../../lib/i18n/locale";
import {deviceLocale,detectedLocaleDestination} from "../../lib/i18n/detection";
import {quickLanguageOptions,settingsLanguageOptions,savedLanguageChoice,saveLanguageChoice,restoreLanguageChoice,browserLanguageChoice,LANGUAGE_STORAGE_KEY} from "../../lib/i18n/preference";
import {editorRequestLocale} from "../../lib/i18n/editor/detection";
vi.mock("next-auth/jwt",()=>({getToken:vi.fn().mockResolvedValue(null)}));
import proxy from "../../proxy";
const available=()=>true;
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function browser(cookie="",stored:string|null=null){
 const jar=new Map(cookie.split(";").filter(Boolean).map(part=>{const [key,value]=part.trim().split("=");return [key,value];}));
 const storage=new Map(stored===null ? [] : [[LANGUAGE_STORAGE_KEY,stored]]);
 const writes:string[]=[];const dispatchEvent=vi.fn();
 vi.stubGlobal("document",{get cookie(){return [...jar].map(([key,value])=>`${key}=${value}`).join("; ");},set cookie(value:string){writes.push(value);const [key,val]=value.split(";")[0].split("=");jar.set(key,val);}});
 vi.stubGlobal("window",{localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},dispatchEvent});
 return {jar,storage,writes,dispatchEvent};
}
describe("one-time device language preference",()=>{
 it.each(ALL_LOCALES)("offers only English and device language %s",locale=>{
  expect(quickLanguageOptions(locale,available)).toEqual(locale==="en" ? ["en"] : ["en",locale]);
  expect(settingsLanguageOptions(locale,locale,available)).toEqual(quickLanguageOptions(locale,available));
 });
 it("keeps a previously selected language available without showing the full roster",()=>{
  expect(settingsLanguageOptions("es","ja",available)).toEqual(["en","es","ja"]);
  expect(quickLanguageOptions("ar",locale=>locale==="en")).toEqual(["en"]);
 });
 it("ignores an automatic route cookie when detecting an explicit choice",()=>{
  browser("n2t_locale=es");
  expect(browserLanguageChoice()).toBeNull();expect(restoreLanguageChoice()).toBeNull();
  expect(savedLanguageChoice("n2t_locale=es; n2t_locale_choice=0")).toBeNull();
  expect(savedLanguageChoice("n2t_locale=invalid; n2t_locale_choice=1")).toBeNull();
 });
 it.each(ALL_LOCALES)("persists explicit %s until changed through Settings",locale=>{
  const {storage,writes,dispatchEvent}=browser();saveLanguageChoice(locale);
  expect(browserLanguageChoice()).toBe(locale);
  expect(storage.get(LANGUAGE_STORAGE_KEY)).toBe(locale);
  expect(writes).toEqual([`n2t_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`,`n2t_locale_choice=1; Path=/; Max-Age=31536000; SameSite=Lax`]);
  expect(dispatchEvent).toHaveBeenCalledOnce();
 });
 it("restores expired cookies and migrates older explicit selections",()=>{
  const {jar}=browser("n2t_locale=ja","es");
  expect(restoreLanguageChoice()).toBe("es");expect(jar.get("n2t_locale")).toBe("es");expect(jar.get("n2t_locale_choice")).toBe("1");
 });
 it("uses the newest cookie choice over stale storage",()=>{
  const {storage}=browser("n2t_locale=en; n2t_locale_choice=1","es");
  expect(restoreLanguageChoice()).toBe("en");expect(storage.get(LANGUAGE_STORAGE_KEY)).toBe("en");
 });
 it("keeps cookie-only choices when browser storage is blocked",()=>{
  browser("n2t_locale=ar; n2t_locale_choice=1");
  vi.stubGlobal("window",{get localStorage(){throw new Error("blocked");},dispatchEvent:vi.fn()});
  expect(restoreLanguageChoice()).toBe("ar");saveLanguageChoice("en");expect(browserLanguageChoice()).toBe("en");
 });
 it.each(ALL_LOCALES)("keeps explicit %s across public, settings and login URLs",locale=>{
  for(const path of ["/es/pricing?utm_source=music","/ja/settings#language","/auth/login?next=%2Fgte%2Fsecret__ed__track"]){
   const destination=localeSwitchHref(path,locale);
   expect(detectedLocaleDestination(path,"ko-KR",locale,"Browser",available,true)).toBe(destination===path?null:destination);
  }
  expect(detectedLocaleDestination("/gte/secret__ed__track","ko-KR",locale,"Browser",available,true)).toBeNull();
 });
 it("keeps every translated page crawlable even with a preference",()=>{
  for(const locale of ALL_LOCALES)expect(detectedLocaleDestination(localeSwitchHref("/pricing",locale),"es","en","Googlebot",available,true)).toBeNull();
 });
 it("does not misidentify Traditional Chinese as Simplified",()=>{
  expect(deviceLocale("zh-Hant-TW,en;q=0.7",available)).toBe("en");
  expect(deviceLocale("zh-CN,en;q=0.7",available)).toBe("zh-Hans");
 });
 it("makes the editor follow device language until an explicit choice",()=>{
  vi.stubEnv("VERCEL_ENV","preview");
  expect(editorRequestLocale({cookies:{n2t_locale:"ja"},headers:{"accept-language":"es"}})).toBe("es");
  expect(editorRequestLocale({cookies:{n2t_locale:"en",n2t_locale_choice:"1"},headers:{"accept-language":"es"}})).toBe("en");
 });
 it("ignores automatic cookies and preserves country currency independently",async()=>{
  vi.stubEnv("VERCEL_ENV","preview");
  const response=await proxy(new NextRequest("https://www.note2tabs.com/pricing",{headers:{cookie:"n2t_locale=ja","accept-language":"es","x-vercel-ip-country":"BR"}}));
  expect(response.headers.get("location")).toBe("https://www.note2tabs.com/es/pricing");
  expect(response.cookies.get("n2t_currency")?.value).toBe("BRL");
  const locked=await proxy(new NextRequest("https://www.note2tabs.com/es/pricing",{headers:{cookie:"n2t_locale=en; n2t_locale_choice=1","accept-language":"es"}}));
  expect(locked.headers.get("location")).toBe("https://www.note2tabs.com/pricing");
  expect(locked.headers.get("cache-control")).toBe("private, no-store");
 });
});
