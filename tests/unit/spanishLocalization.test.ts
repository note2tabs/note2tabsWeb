import {seoFeaturePages} from "../../lib/seoFeaturePages";
import portuguese from "../../lib/i18n/pt-BR.json";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach,describe,expect,it,vi} from "vitest";
import english from "../../lib/i18n/en.json";
import spanish from "../../lib/i18n/es.json";
import {LOCALIZED_FLOW_PATHS,localeFromPath,localeHref,localeSwitchHref,navigationLocaleForPath,localeCohort} from "../../lib/i18n/locale";
import {translate,translatedError} from "../../lib/i18n/translate";
import {withSpanishPilot,localizedPilotIndexable} from "../../lib/i18n/pilot";
import {requestLocale} from "../../lib/i18n/request";
import {localizeCheckoutReturnPaths} from "../../lib/i18n/checkout";
import {spanishPosts,localizeBlogProps,articleTranslation} from "../../lib/i18n/blog/localize";
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
import {articleLocales} from "../../lib/i18n/blog/availability";
vi.mock("next/head",()=>({default:({children}:any)=>React.createElement(React.Fragment,null,children)}));
vi.mock("../../lib/email",()=>({sendTransactionalEmail:vi.fn().mockResolvedValue(true)}));
vi.mock("../../lib/prisma",()=>({prisma:{post:{findMany:vi.fn().mockResolvedValue([])}}}));
vi.stubGlobal("React",React);
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe("Spanish website",()=>{
 it("has all messages and preserves every interpolation parameter",()=>{
  expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
  for(const [source,message]of Object.entries(spanish)){
   expect(message.trim(),source).not.toBe("");
   expect((message.match(/\{\w+\}/g)||[]).sort(),source).toEqual((source.match(/\{\w+\}/g)||[]).sort());
  }
  expect(translate("{price} billed today · Cancel anytime","es",{price:"21,90 BRL"})).toContain("21,90 BRL se cobra hoy");
  expect(translatedError("Password must be at least 10 characters.","es")).toContain("10 caracteres");
  const rendered=translate("File is too large. Max size is {size} for your plan.","es",{size:"50 MB"});
  expect(translatedError(rendered,"es")).toBe(rendered);
  expect(translatedError("secret backend trace","es")).not.toContain("secret");
 });
 it("covers dynamic feature paragraphs and SEO titles in both translations",()=>{
  const check=(value:unknown,key="")=>{
   if(Array.isArray(value))for(const item of value)check(item,key);
   else if(value&&typeof value==="object")for(const [k,v]of Object.entries(value))check(v,k);
   else if(typeof value==="string"&&!['slug','relatedSlugs'].includes(key)){
    for(const catalog of [spanish,portuguese])expect(Object.prototype.hasOwnProperty.call(catalog,value),value).toBe(true);
   }
  };check(seoFeaturePages);
 });
 it("switches all routes between three languages without duplicate prefixes",()=>{
  for(const path of [...LOCALIZED_FLOW_PATHS,"/features/guitar-tab-practice-trainer","/blog/mp3-to-guitar-tabs","/blog/tag/guitar","/tabs/private/edit","/job/private"]){
   const es=localeHref(path,"es");expect(es).toBe(`/es${path==="/"?"":path}`);
   expect(localeHref(es,"pt-BR")).toBe(localeHref(path,"pt-BR"));expect(localeHref(es,"en")).toBe(path);
  }
  for(const path of ["/gte","/gte/local","/admin","https://stripe.com","//example.com"])expect(localeHref(path,"es")).toBe(path);
  expect(localeFromPath("/essay")).toBe("en");
  expect(localeHref("/transcribe",navigationLocaleForPath("/gte/local","es"))).toBe("/es/transcribe");
  const switched=new URL(localeSwitchHref("/pt-br/auth/verify-email?token=opaque&next=%2Fpt-br%2Ftranscribe%3FresumeTranscription%3D1","es"),"https://example.com");
  expect(switched.pathname).toBe("/es/auth/verify-email");expect(switched.searchParams.get("token")).toBe("opaque");expect(switched.searchParams.get("next")).toBe("/es/transcribe?resumeTranscription=1");
 });
 it("keeps Spanish privacy and replay rules intact",()=>{
  expect(sanitizeAnalyticsPathname("/es/reset-password/secret?email=private")).toBe("/es/reset-password/[token]");
  expect(sanitizeAnalyticsPathname("/es/job/private")).toBe("/es/job/[job_id]");
  expect(sessionReplayIsBlocked("/es/auth/verify-email?token=secret")).toBe(true);
  expect(sessionReplayIsBlocked("/es/settings")).toBe(true);
 });
 it("releases each language independently and keeps previews noindex",async()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED","true");vi.stubEnv("NEXT_PUBLIC_ES_REVIEWED","false");
  const loader=vi.fn().mockResolvedValue({props:{ok:true}});const setHeader=vi.fn();const ctx={resolvedUrl:"/es/pricing",req:{headers:{"x-vercel-ip-country":"BR"}},res:{setHeader}}as any;
  expect(await withSpanishPilot(loader)(ctx)).toEqual({notFound:true});expect(loader).not.toHaveBeenCalled();
  expect(requestLocale({body:{locale:"es"},cookies:{}})).toBe("en");
  expect(localizedPilotIndexable("pt-BR")).toBe(true);expect(localizedPilotIndexable("es")).toBe(false);
  vi.stubEnv("VERCEL_ENV","preview");expect(await withSpanishPilot(loader)(ctx)).toEqual({props:{ok:true,initialDisplayCurrency:"BRL"}});
  expect(setHeader).toHaveBeenCalledWith("X-Robots-Tag","noindex, follow");expect(requestLocale({body:{locale:"es"},cookies:{}})).toBe("es");
 });
 it("retains Brazil prices and separates currency from language",()=>{
  expect(formatLocalizedPrice("PREMIUM","monthly","BRL","es")).toContain("21,90");
  expect(formatLocalizedPrice("PRO","monthly","BRL","es")).toContain("54,90");
  expect(formatLocalizedPrice("PREMIUM","monthly","USD","es")).toContain("5,99");
 });
 it("preserves checkout resume and account returns",()=>{
  const paths=localizeCheckoutReturnPaths({success:"/premium/welcome?next=%2Ftranscribe%3FresumeTranscription%3D1",cancel:"/transcribe?resumeTranscription=1&upgrade=cancel",manage:"/settings"},"es");
  expect(paths.cancel).toBe("/es/transcribe?resumeTranscription=1&upgrade=cancel");expect(paths.manage).toBe("/es/settings");
  expect(new URL(paths.success,"https://example.com").searchParams.get("next")).toBe("/es/transcribe?resumeTranscription=1");
 });
 it("separates language and country cohorts without guessing unknown geography",()=>{
  expect(localeCohort("es","ES")).toMatchObject({visitor_market:"spain",localization_cohort:"es:ES"});
  expect(localeCohort("es","MX")).toMatchObject({visitor_market:"spanish_latin_america",localization_cohort:"es:MX"});
  expect(localeCohort("es","AR").localization_cohort).toBe("es:AR");
  expect(localeCohort("en","MX").localization_cohort).toBe("en:MX");
  expect(localeCohort("pt-BR","BR").localization_cohort).toBe("pt-BR:BR");
  expect(localeCohort("es",undefined)).toMatchObject({visitor_country:"unknown",visitor_market:"unknown"});
 });
 it("compiles all 26 Spanish articles with localized links and valid TOC",async()=>{
  expect(Object.keys(spanishPosts)).toHaveLength(26);
  for(const [slug,row]of Object.entries(spanishPosts)){
   const result=await localizeBlogProps({post:{slug,title:row.sourceTitle,updatedAt:row.sourceUpdatedAt,authorName:"Author",contentHtml:"Original"},toc:[]},"es");const post=result.post as any;
   expect(post.contentLanguage,slug).toBe("es");expect(post.title).toBe(row.title);expect(post.authorName).toBe("Author");
   expect(post.contentHtml).not.toMatch(/href="\/(editor|transcribe|blog|auth)\b/);expect(post.contentHtml).not.toContain("<script");
   for(const heading of result.toc as any[])expect(post.contentHtml).toContain(`id="${heading.id}"`);
   expect(articleLocales(slug,row.sourceUpdatedAt)).toContain("es");
  }
 },30000);
 it("rejects changed sources without rewriting user content",async()=>{
  const row=spanishPosts["mp3-to-guitar-tabs"];
  expect(articleTranslation("mp3-to-guitar-tabs","2099",row.sourceTitle,"es")).toBeNull();
  expect(articleLocales("mp3-to-guitar-tabs","2099")).toEqual([]);
  const result=await localizeBlogProps({post:{slug:"mp3-to-guitar-tabs",title:row.sourceTitle,updatedAt:"2099",contentHtml:"Updated"},user:{name:"My music"}},"es");
  expect(result.post).toMatchObject({contentLanguage:"en",contentHtml:"Updated"});expect(result.user.name).toBe("My music");
 });
 it("localizes transactional emails and escapes names and recording labels",async()=>{
  await sendVerificationEmail("test@example.com","opaque",{locale:"es",name:"<script>"});let mail=vi.mocked(sendTransactionalEmail).mock.calls.at(-1)![0];
  expect(mail.html).toContain('lang="es"');expect(mail.html).toContain("&lt;script&gt;");expect(mail.text).toContain("/es/auth/verify-email");
  await sendPasswordResetEmail("test@example.com","opaque","123456",{locale:"es"});mail=vi.mocked(sendTransactionalEmail).mock.calls.at(-1)![0];expect(mail.text).toContain("/es/reset-password/opaque");expect(mail.text).toContain("123456");
  const done=buildTranscriptionCompleteEmail({jobId:"job",sourceLabel:"<img>",locale:"es"});expect(done.html).toContain("&lt;img&gt;");expect(done.text).toContain("El editor está en inglés.");expect(done.editorUrl).toContain("/es/job/job");
 });
 it("emits three reciprocal public alternates including article paths only after release",()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED","true");vi.stubEnv("NEXT_PUBLIC_ES_REVIEWED","true");
  for(const path of ["/pricing","/editor","/blog/mp3-to-guitar-tabs"]){
   for(const locale of ["en","pt-BR","es"]as const){const html=renderToStaticMarkup(React.createElement(LocaleProvider,{path:localeHref(path,locale),children:React.createElement(SeoHead,{title:"Pricing",canonicalPath:path})}));
    expect(html).toContain(`rel="canonical" href="https://www.note2tabs.com${localeHref(path,locale)}"`);
    for(const alternate of ["en","pt-BR","es"]as const)expect(html).toContain(`hrefLang="${alternate}" href="https://www.note2tabs.com${localeHref(path,alternate)}"`);
   }
  }
 });
 it("adds only reviewed public Spanish routes to the sitemap",async()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("NEXT_PUBLIC_ES_REVIEWED","true");vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED","false");
  const write=vi.fn();await sitemap({res:{setHeader:vi.fn(),write,end:vi.fn()}}as any);const xml=write.mock.calls[0][0];
  expect(xml).toContain("/es/editor");expect(xml).toContain('hreflang="es"');expect(xml).not.toContain("/pt-br");expect(xml).not.toContain("/es/settings");
 });
});
