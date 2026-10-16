import {afterEach,describe,expect,it,vi} from "vitest";
import {existsSync,readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {ALL_LOCALES,localeFromPath,localeHref,localeSwitchHref,LOCALE_NAMES,localeCohort,stripLocale} from "../../lib/i18n/locale";
import {catalogs,translate,translatedError} from "../../lib/i18n/translate";
import {getEditorCatalog} from "../../lib/i18n/editor/catalogs";
import {editorCount} from "../../lib/i18n/editor/counts";
import {deviceLocale} from "../../lib/i18n/detection";
import {stripeLocale} from "../../lib/i18n/checkout";
import {localizedPilotAvailable,localizedPilotIndexable} from "../../lib/i18n/pilot";
import {localizedEmailCopy} from "../../lib/i18n/emails";
import {articleLocales} from "../../lib/i18n/blog/availability";
import {sanitizeAnalyticsPathname} from "../../lib/analyticsPrivacy";
afterEach(()=>vi.unstubAllEnvs());
describe.each(["fr","it"] as const)("%s localization",locale=>{
 it("provides complete public and editor catalogues with exact placeholders",async()=>{
  for(const [source,catalog] of [[catalogs.en,catalogs[locale]],[await getEditorCatalog("en"),await getEditorCatalog(locale)]]){
   expect(Object.keys(catalog).sort()).toEqual(Object.keys(source).sort());
   for(const [key,value] of Object.entries(catalog)){
    expect(value.trim(),key).not.toBe("");
    expect(value,key).not.toContain("▁");
    expect((value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)||[]).sort(),key).toEqual((key.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)||[]).sort());
   }
  }
 });
 it("retains language across navigation, auth returns, privacy paths and checkout",()=>{
  expect(ALL_LOCALES).toContain(locale);expect(LOCALE_NAMES[locale]).toBe(locale==="fr"?"Français":"Italiano");
  expect(deviceLocale(locale==="fr"?"fr-CA,en;q=0.8":"it-CH,en;q=0.8",()=>true)).toBe(locale);
  expect(localeFromPath(`/${locale}/pricing`)).toBe(locale);expect(stripLocale(`/${locale}/pricing`)).toBe("/pricing");
  expect(localeHref("/gte/private",locale)).toBe("/gte/private");
  const url=new URL(localeSwitchHref("/es/auth/login?next=%2Fes%2Ftranscribe%3FresumeTranscription%3D1",locale),"https://example.com");
  expect(url.searchParams.get("next")).toBe(`/${locale}/transcribe?resumeTranscription=1`);
  expect(sanitizeAnalyticsPathname(`/${locale}/reset-password/secret`)).toBe(`/${locale}/reset-password/[token]`);
  expect(stripeLocale(locale)).toBe(locale);expect(localeCohort(locale,locale==="fr"?"FR":"IT").visitor_market).toBe(locale==="fr"?"france":"italy");
 });
 it("releases reviewed editions by default and retains an explicit disable switch",()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");
  vi.stubEnv(locale==="fr"?"NEXT_PUBLIC_FR_REVIEWED":"NEXT_PUBLIC_IT_REVIEWED","");
  expect(localizedPilotAvailable(locale)).toBe(true);expect(localizedPilotIndexable(locale)).toBe(true);
  vi.stubEnv(locale==="fr"?"NEXT_PUBLIC_FR_REVIEWED":"NEXT_PUBLIC_IT_REVIEWED","false");
  expect(localizedPilotAvailable(locale)).toBe(false);expect(localizedPilotIndexable(locale)).toBe(false);
  vi.stubEnv(locale==="fr"?"NEXT_PUBLIC_FR_REVIEWED":"NEXT_PUBLIC_IT_REVIEWED","true");
  expect(localizedPilotAvailable(locale)).toBe(true);expect(localizedPilotIndexable(locale)).toBe(true);
 });
 it("exposes released languages in the production client bundle and honors a disable override",()=>{
  const name=locale==="fr"?"FR":"IT";
  for(const disabled of [false,true]){
   const sandbox={__dirname:process.cwd(),module:{exports:{} as any},process:{env:{NODE_ENV:"production",VERCEL_ENV:"production",...(disabled?{[`NEXT_PUBLIC_${name}_REVIEWED`]:"false"}:{})}}};
   runInNewContext(readFileSync("next.config.js","utf8"),sandbox);
   expect(sandbox.module.exports.env[`NEXT_PUBLIC_${name}_AVAILABLE`]).toBe(disabled?"false":"true");
  }
 });
 it("covers core routes and does not advertise untranslated articles",()=>{
  for(const route of ["index.tsx","pricing.tsx","transcribe.tsx","editor/index.tsx","auth/login.tsx","auth/signup.tsx","settings.tsx","home.tsx","features/[slug].tsx","blog/[slug].tsx"])
   expect(existsSync(`pages/${locale}/${route}`),route).toBe(true);
  expect(readFileSync(`pages/${locale}/pricing.tsx`,"utf8")).toContain(locale==="fr"?"withFrenchPilot":"withItalianPilot");
  expect(articleLocales("mp3-to-guitar-tabs","untranslated")).not.toContain(locale);
 });
 it("uses musical counts, localized errors and transactional emails",()=>{
  expect(editorCount(2,"bars",locale)).toBe(locale==="fr"?"2 mesures":"2 battute");
  expect(translate("Generate tabs",locale)).toBe(locale==="fr"?"Générer les tablatures":"Genera tablature");
  expect(translatedError("Unknown technical failure",locale)).toContain(locale==="fr"?"Réessayez":"Riprova");
  expect(localizedEmailCopy(locale)?.verification.subject).toBe(locale==="fr"?"Confirmez votre compte Note2Tabs":"Conferma il tuo account Note2Tabs");
 });
});
