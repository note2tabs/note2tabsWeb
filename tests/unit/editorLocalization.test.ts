import {editorInstrumentName} from "../../lib/i18n/editor/instruments";
import instrumentManifest from "../../public/sound_samples/manifest.json";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {describe,it,expect,vi,afterEach,beforeEach} from "vitest";
import {ALL_LOCALES,TRANSLATED_LOCALES,localeHref,localeSwitchHref} from "../../lib/i18n/locale";
import {translate,translatedError,catalogs,registerEditorCatalog} from "../../lib/i18n/translate";
import {editorRequestLocale,withEditorLocale} from "../../lib/i18n/editor/request";
import {editorCount} from "../../lib/i18n/editor/counts";
import {editorName} from "../../lib/i18n/editor/names";
import {EDITOR_TUTORIAL_CARDS} from "../../lib/editorTutorial";
import {LocaleProvider} from "../../lib/i18n/react";
import {EditorLoadingState} from "../../components/EditorLoadingState";
import {EditorTutorialTrigger} from "../../components/EditorTutorial";
vi.mock("next/router",()=>({useRouter:()=>({asPath:"/gte/local"})}));
beforeEach(()=>{
 for(const key of ["PT_BR","ES","JA","KO","PL","AR","ZH_HANS"])vi.stubEnv(`NEXT_PUBLIC_${key}_AVAILABLE`,"true");
});
afterEach(()=>vi.unstubAllEnvs());
const english=JSON.parse(readFileSync("lib/i18n/editor/en.json","utf8")) as Record<string,string>;
for(const locale of ALL_LOCALES)registerEditorCatalog(locale,JSON.parse(readFileSync(`lib/i18n/editor/${locale}.json`,"utf8")));
describe("editor localization",()=>{
 it.each(TRANSLATED_LOCALES)("keeps the complete %s editor vocabulary and tutorial tokens",locale=>{
  const copy=JSON.parse(readFileSync(`lib/i18n/editor/${locale}.json`,"utf8")) as Record<string,string>;
  expect(Object.keys(copy).sort()).toEqual(Object.keys(english).sort());
  for(const [key,message] of Object.entries(copy)){
   expect(message.trim(),key).not.toBe("");
   expect((message.match(/\{[^{}]+\}/g)||[]).sort(),key).toEqual((key.match(/\{[^{}]+\}/g)||[]).sort());
  }
  for(const instrument of instrumentManifest)expect(copy[instrument.label],instrument.label).not.toBe(instrument.label);
  expect(editorInstrumentName("Strings",source=>translate(source,locale))).toBe(copy["String ensemble"]);
  expect(copy["String ensemble"]).not.toBe(copy.Strings);
  for(const card of EDITOR_TUTORIAL_CARDS)expect(copy[card.text]).not.toBe(card.text);
  for(const key of ["Scale","Key scale","Fret","Phyrigian","Undo","Practice","Generate playing coordinates"]){
   expect(copy[key],key).not.toBe(key);
   expect(translate(key,locale)).toBe(copy[key]);
  }
  expect(translate("C",locale)).toBe("C");expect(translate("G",locale)).toBe("G");
  expect(translate("MusicXML",locale)).toBe("MusicXML");
 });
 it.each(ALL_LOCALES)("renders %s controls in the server-selected language",locale=>{
  const html=renderToStaticMarkup(React.createElement(LocaleProvider,{path:"/gte/local",initialEditorLocale:locale,children:React.createElement(React.Fragment,null,React.createElement(EditorLoadingState),React.createElement(EditorTutorialTrigger))}));
  expect(html).toContain(translate("Preparing your editor",locale));
  expect(html).toContain(translate("Open editor tutorial",locale));
 });
 it.each(TRANSLATED_LOCALES)("uses %s preferences without modifying editor IDs",async locale=>{
  const req={cookies:{n2t_locale:locale},headers:{"accept-language":"en"}};
  expect(editorRequestLocale(req)).toBe(locale);
  expect(editorRequestLocale({headers:{cookie:`n2t_locale=${locale}`,"accept-language":"en"}})).toBe(locale);
  const path="/gte/project__ed__track?mode=practice";
  expect(localeHref(path,locale)).toBe(path);
  expect(localeSwitchHref(path,locale)).toBe(path);
  const headers=vi.fn();const loader=vi.fn().mockResolvedValue({props:{editorId:"project",trackId:"track",canEdit:true}});
  const result=await withEditorLocale(loader)({req,res:{setHeader:headers},resolvedUrl:path} as any);
  expect(result).toEqual({props:{editorId:"project",trackId:"track",canEdit:true,initialEditorLocale:locale,initialEditorMessages:JSON.parse(readFileSync(`lib/i18n/editor/${locale}.json`,"utf8"))}});
  expect(headers).toHaveBeenCalledWith("X-Robots-Tag","noindex, follow");
  expect(headers).toHaveBeenCalledWith("Cache-Control","private, no-store");
  const redirect=await withEditorLocale(async()=>({redirect:{destination:"/auth/login?next=%2Fgte%2Fproject",permanent:false}}))({req,res:{setHeader:headers}} as any);
  expect((redirect as any).redirect.destination).toBe(localeHref("/auth/login?next=%2Fgte%2Fproject",locale));
 });
 it("honors device preferences, explicit English and disabled releases",()=>{
  expect(editorRequestLocale({headers:{"accept-language":"ko-KR,en;q=0.8"}})).toBe("ko");
  expect(editorRequestLocale({headers:{"accept-language":"zh-Hant,en;q=0.8"}})).toBe("en");
  expect(editorRequestLocale({cookies:{n2t_locale:"en"},headers:{"accept-language":"ar"}})).toBe("en");
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("NEXT_PUBLIC_AR_REVIEWED","false");
  expect(editorRequestLocale({cookies:{n2t_locale:"ar"},headers:{"accept-language":"en"}})).toBe("en");
 });
 it.each(TRANSLATED_LOCALES)("translates generated %s statuses and validation without changing values",locale=>{
  expect(translate("Saved 12:34",locale)).toBe(translate("Saved {value1}",locale,{value1:"12:34"}));
  expect(translatedError("Fret must be between 0 and 22.",locale)).toBe(translate("Fret must be between 0 and {value1}.",locale,{value1:22}));
  expect(translatedError("secret backend trace",locale)).not.toContain("secret");
  const t=(source:string,values?:Record<string,string|number>)=>translate(source,locale,values);
  expect(editorName("My song: Saved 12:34",t)).toBe("My song: Saved 12:34");
  expect(editorName("Tab 2",t)).toBe(translate("Tab {value1}",locale,{value1:2}));
 });
 it("does not render a disabled editor language from a saved preference",()=>{
  vi.stubEnv("NEXT_PUBLIC_AR_AVAILABLE","false");
  const html=renderToStaticMarkup(React.createElement(LocaleProvider,{path:"/gte/local",initialEditorLocale:"ar",children:React.createElement(EditorLoadingState)}));
  expect(html).toContain("Preparing your editor");
 });
 it("uses grammatical counts without English plural fragments",()=>{
  expect(editorCount(1,"bars","pl")).toBe("1 takt");
  expect(editorCount(2,"bars","pl")).toBe("2 takty");
  expect(editorCount(12,"bars","pl")).toBe("12 taktów");
  expect(editorCount(2,"bars","es")).toBe("2 compases");
  expect(editorCount(2,"bars","pt-BR")).toBe("2 compassos");
  expect(editorCount(2,"notes","zh-Hans")).toBe("2 个音符");
 });
});
