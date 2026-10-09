import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, describe, expect, it, vi} from "vitest";
import english from "../../lib/i18n/en.json";
import japanese from "../../lib/i18n/ja.json";
import {LOCALIZED_FLOW_PATHS, TRANSLATED_LOCALES, localeHref, localeSwitchHref, localeCohort, navigationLocaleForPath} from "../../lib/i18n/locale";
import {deviceLocale, detectedLocaleDestination} from "../../lib/i18n/detection";
import {translate, translatedError} from "../../lib/i18n/translate";
import {localizedPilotAvailable, localizedPilotIndexable, withJapanesePilot} from "../../lib/i18n/pilot";
import {japanesePosts, localizeBlogProps, articleTranslation, localizedReadingTime} from "../../lib/i18n/blog/localize";
import {articleLocales} from "../../lib/i18n/blog/availability";
import {requestLocale} from "../../lib/i18n/request";
import {localizeCheckoutReturnPaths} from "../../lib/i18n/checkout";
import {sanitizeAnalyticsPathname} from "../../lib/analyticsPrivacy";
import {sessionReplayIsBlocked} from "../../lib/posthogClient";
import {formatLocalizedPrice} from "../../lib/localizedPricing";
import {sendVerificationEmail} from "../../lib/emailVerification";
import {sendPasswordResetEmail} from "../../lib/passwordReset";
import {sendTransactionalEmail} from "../../lib/email";
import {buildTranscriptionCompleteEmail} from "../../lib/transcriptionCompleteEmail";
import {LocaleProvider} from "../../lib/i18n/react";
import SeoHead from "../../components/SeoHead";
import {getServerSideProps as sitemap} from "../../pages/sitemap.xml";
vi.mock("next/head",()=>({default:({children}:any)=>React.createElement(React.Fragment,null,children)}));
vi.mock("../../lib/email",()=>({sendTransactionalEmail:vi.fn().mockResolvedValue(true)}));
vi.mock("../../lib/prisma",()=>({prisma:{post:{findMany:vi.fn().mockResolvedValue([])}}}));
vi.stubGlobal("React",React);
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe("Japanese localization",()=>{
 it("covers the entire catalogue with preserved interpolation parameters",()=>{
  expect(Object.keys(japanese).sort()).toEqual(Object.keys(english).sort());
  for(const [source,message] of Object.entries(japanese)){
   expect(message.trim(),source).not.toBe("");
   expect((message.match(/\{\w+\}/g)||[]).sort(),source).toEqual((source.match(/\{\w+\}/g)||[]).sort());
  }
  const rendered=translate("File is too large. Max size is {size} for your plan.","ja",{size:"50 MB"});
  expect(rendered).toContain("50 MB");expect(translatedError(rendered,"ja")).toBe(rendered);
  expect(translatedError("internal secret","ja")).toContain("処理を完了できませんでした");
 });
 it("switches all supported paths and return destinations without translating private identifiers",()=>{
  for(const path of [...LOCALIZED_FLOW_PATHS,"/features/guitar-tab-practice-trainer","/blog/mp3-to-guitar-tabs","/blog/tag/guitar","/job/private","/tabs/private/edit"]){
   const ja=localeHref(path,"ja");expect(ja).toBe(`/ja${path==="/"?"":path}`);
   for(const locale of ["en",...TRANSLATED_LOCALES]) expect(localeHref(ja,locale)).toBe(localeHref(path,locale));
  }
  expect(localeHref("/gte/local","ja")).toBe("/gte/local");
  expect(localeHref("/transcribe",navigationLocaleForPath("/gte/local","ja"))).toBe("/ja/transcribe");
  const switched=new URL(localeSwitchHref("/es/auth/verify-email?token=opaque&next=%2Fes%2Ftranscribe%3FresumeTranscription%3D1","ja"),"https://example.com");
  expect(switched.pathname).toBe("/ja/auth/verify-email");expect(switched.searchParams.get("token")).toBe("opaque");expect(switched.searchParams.get("next")).toBe("/ja/transcribe?resumeTranscription=1");
  const paths=localizeCheckoutReturnPaths({success:"/premium/welcome?next=%2Ftranscribe",cancel:"/transcribe?resumeTranscription=1",manage:"/settings"},"ja");
  expect(paths.cancel).toBe("/ja/transcribe?resumeTranscription=1");expect(paths.manage).toBe("/ja/settings");
 });
 it("uses device language and respects explicit choices",()=>{
  expect(deviceLocale("ja-JP,ja;q=0.9,en;q=0.8",()=>true)).toBe("ja");
  expect(deviceLocale("en-US,ja;q=0.8",()=>true)).toBe("en");
  expect(deviceLocale("ja,en;q=0.8",locale=>locale!=="ja")).toBe("en");
  expect(detectedLocaleDestination("/pricing?utm_source=music","ja-JP",undefined,"Browser",()=>true)).toBe("/ja/pricing?utm_source=music");
  expect(detectedLocaleDestination("/pricing","ja","en","Browser",()=>true)).toBeNull();
  expect(detectedLocaleDestination("/pricing","en","ja","Browser",()=>true)).toBe("/ja/pricing");
  expect(detectedLocaleDestination("/ja/pricing","es",undefined,"Browser",()=>true)).toBeNull();
 });
 it("preserves privacy rules on Japanese paths",()=>{
  expect(sanitizeAnalyticsPathname("/ja/job/private?email=private")).toBe("/ja/job/[job_id]");
  expect(sanitizeAnalyticsPathname("/ja/reset-password/secret")).toBe("/ja/reset-password/[token]");
  expect(sessionReplayIsBlocked("/ja/auth/signup")).toBe(true);expect(sessionReplayIsBlocked("/ja/settings")).toBe(true);
 });
 it("separates language, geography and currency, preserving yen and Brazilian prices",()=>{
  expect(localeCohort("ja","JP")).toMatchObject({visitor_market:"japan",localization_cohort:"ja:JP"});
  expect(localeCohort("en","JP").localization_cohort).toBe("en:JP");
  expect(localeCohort("ja","BR")).toMatchObject({visitor_market:"brazil",localization_cohort:"ja:BR"});
  expect(localeCohort("ja",undefined).visitor_country).toBe("unknown");
  expect(formatLocalizedPrice("PREMIUM","monthly","JPY","ja")).toBe("￥999");
  expect(formatLocalizedPrice("PRO","monthly","JPY","ja")).toBe("￥2,499");
  expect(formatLocalizedPrice("PREMIUM","monthly","BRL","pt-BR")).toContain("21,90");
  expect(formatLocalizedPrice("PREMIUM","monthly","USD","ja")).toContain("5.99");
 });
 it("ships completed editions as indexable production pages by default",()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");
  for(const key of ["NEXT_PUBLIC_JA_REVIEWED","NEXT_PUBLIC_ES_REVIEWED","NEXT_PUBLIC_PT_BR_REVIEWED"])vi.stubEnv(key,undefined);
  for(const locale of TRANSLATED_LOCALES){expect(localizedPilotAvailable(locale)).toBe(true);expect(localizedPilotIndexable(locale)).toBe(true);}
  vi.stubEnv("VERCEL_ENV","preview");for(const locale of TRANSLATED_LOCALES)expect(localizedPilotIndexable(locale)).toBe(false);
 });
 it("gates Japanese independently and keeps previews noindex",async()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("NEXT_PUBLIC_JA_REVIEWED","false");vi.stubEnv("NEXT_PUBLIC_ES_REVIEWED","true");
  const loader=vi.fn().mockResolvedValue({props:{ok:true}});const setHeader=vi.fn();const ctx={resolvedUrl:"/ja/pricing",req:{headers:{"x-vercel-ip-country":"JP"}},res:{setHeader}}as any;
  expect(await withJapanesePilot(loader)(ctx)).toEqual({notFound:true});expect(loader).not.toHaveBeenCalled();
  expect(requestLocale({body:{locale:"ja"},cookies:{}})).toBe("en");expect(localizedPilotIndexable("ja")).toBe(false);
  vi.stubEnv("VERCEL_ENV","preview");expect(await withJapanesePilot(loader)(ctx)).toEqual({props:{ok:true,initialDisplayCurrency:"JPY"}});
  expect(setHeader).toHaveBeenCalledWith("X-Robots-Tag","noindex, follow");expect(requestLocale({body:{locale:"ja"},cookies:{}})).toBe("ja");
 });
 it("compiles all 26 articles with Japanese links, headings and source revision guards",async()=>{
  expect(Object.keys(japanesePosts)).toHaveLength(26);
  for(const [slug,row] of Object.entries(japanesePosts)){
   const result=await localizeBlogProps({post:{slug,title:row.sourceTitle,updatedAt:row.sourceUpdatedAt,authorName:"Author",contentHtml:"Original"},toc:[]},"ja");const post=result.post as any;
   expect(post.contentLanguage,slug).toBe("ja");expect(post.title).toBe(row.title);expect(post.authorName).toBe("Author");
   expect(post.contentHtml).not.toMatch(/href="\/(editor|transcribe|blog|auth)\b/);expect(post.contentHtml).not.toContain("<script");
   for(const heading of result.toc as any[])expect(post.contentHtml).toContain(`id="${heading.id}"`);
   expect(articleLocales(slug,row.sourceUpdatedAt)).toContain("ja");
   expect(articleTranslation(slug,"2099",row.sourceTitle,"ja")).toBeNull();
  }
  const row=japanesePosts["mp3-to-guitar-tabs"];
  const stale=await localizeBlogProps({post:{slug:"mp3-to-guitar-tabs",title:row.sourceTitle,updatedAt:"2099",contentHtml:"Updated"}},"ja");
  expect(stale.post).toMatchObject({contentLanguage:"en",contentHtml:"Updated"});
 },30000);
 it("estimates Japanese reading time without relying on spaces",()=>{
  expect(localizedReadingTime("あ".repeat(1500),"ja").minutes).toBe(3);
  expect(localizedReadingTime("あ".repeat(500)+"```\ncode\n```","ja").minutes).toBe(1);
 });
 it("localizes transactional emails and preserves names and labels safely",async()=>{
  await sendVerificationEmail("test@example.com","opaque",{locale:"ja",name:"<script>"});let mail=vi.mocked(sendTransactionalEmail).mock.calls.at(-1)![0];
  expect(mail.html).toContain('lang="ja"');expect(mail.html).toContain("&lt;script&gt;");expect(mail.text).toContain("/ja/auth/verify-email");
  await sendPasswordResetEmail("test@example.com","opaque","123456",{locale:"ja"});mail=vi.mocked(sendTransactionalEmail).mock.calls.at(-1)![0];expect(mail.text).toContain("/ja/reset-password/opaque");expect(mail.text).toContain("123456");
  const done=buildTranscriptionCompleteEmail({jobId:"job",sourceLabel:"<img>",locale:"ja"});expect(done.html).toContain("&lt;img&gt;");expect(done.html).toContain('lang="ja"');expect(done.editorUrl).toContain("/ja/job/job");
 });
 it("emits reciprocal Japanese canonicals and hreflang only after release",async()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");
  for(const key of ["NEXT_PUBLIC_JA_REVIEWED","NEXT_PUBLIC_ES_REVIEWED","NEXT_PUBLIC_PT_BR_REVIEWED"])vi.stubEnv(key,"true");
  for(const locale of ["en",...TRANSLATED_LOCALES]){
   const html=renderToStaticMarkup(React.createElement(LocaleProvider,{path:localeHref("/pricing",locale),children:React.createElement(SeoHead,{title:"Pricing",canonicalPath:"/pricing"})}));
   for(const alternate of ["en",...TRANSLATED_LOCALES])expect(html).toContain(`hrefLang="${alternate}" href="https://www.note2tabs.com${localeHref("/pricing",alternate)}"`);
  }
  const write=vi.fn();await sitemap({res:{setHeader:vi.fn(),write,end:vi.fn()}}as any);const xml=write.mock.calls[0][0];expect(xml).toContain("/ja/editor");expect(xml).toContain('hreflang="ja"');expect(xml).not.toContain("/ja/settings");
 });
});
