import {sendVerificationEmail} from "../../lib/emailVerification";
import {sendPasswordResetEmail} from "../../lib/passwordReset";
import {sendTransactionalEmail} from "../../lib/email";
import {buildTranscriptionCompleteEmail} from "../../lib/transcriptionCompleteEmail";
import {afterEach, describe, expect, it, vi} from "vitest";
import {ALL_LOCALES, localeFromPath, localeHref, localeSwitchHref, localeDirection, localeCohort, stripLocale} from "../../lib/i18n/locale";
import {deviceLocale, detectedLocaleDestination} from "../../lib/i18n/detection";
import {stripeLocale} from "../../lib/i18n/checkout";
import {sanitizeAnalyticsPathname} from "../../lib/analyticsPrivacy";
import {sessionReplayIsBlocked} from "../../lib/posthogClient";
import {formatLocalizedPrice, displayCurrencyForCountry} from "../../lib/localizedPricing";

describe("additional language routing", () => {
  it.each(["ko", "pl", "ar", "zh-Hans"] as const)("preserves %s navigation, tokens and privacy", locale => {
    const path=localeHref("/pricing",locale);
    expect(localeFromPath(path)).toBe(locale);
    expect(stripLocale(path)).toBe("/pricing");
    for(const target of ALL_LOCALES) expect(localeHref(path,target)).toBe(localeHref("/pricing",target));
    const result=new URL(localeSwitchHref("/es/auth/login?next=%2Fes%2Ftranscribe%3FresumeTranscription%3D1&token=opaque",locale),"https://example.com");
    expect(result.searchParams.get("token")).toBe("opaque");
    expect(result.searchParams.get("next")).toBe(localeHref("/transcribe?resumeTranscription=1",locale));
    expect(localeHref("/gte/editor-id",locale)).toBe("/gte/editor-id");
    expect(sanitizeAnalyticsPathname(localeHref("/reset-password/secret",locale))).toBe(localeHref("/reset-password/[token]",locale));
    expect(sessionReplayIsBlocked(localeHref("/auth/signup",locale))).toBe(true);
    expect(detectedLocaleDestination("/pricing","en",locale,"browser",()=>true)).toBe(path);
    expect(detectedLocaleDestination(path,"en",undefined,"browser",()=>true)).toBeNull();
    expect(detectedLocaleDestination("/pricing",locale,undefined,"Googlebot",()=>true)).toBeNull();
  });
  it("uses device preferences without conflating Chinese scripts",()=>{
    expect(deviceLocale("ko-KR,en;q=0.8",()=>true)).toBe("ko");
    expect(deviceLocale("pl-PL,en;q=0.8",()=>true)).toBe("pl");
    expect(deviceLocale("ar-EG,en;q=0.8",()=>true)).toBe("ar");
    for(const tag of ["zh", "zh-CN", "zh-SG", "zh-Hans", "zh-Hans-CN"]) expect(deviceLocale(tag,()=>true)).toBe("zh-Hans");
    for(const tag of ["zh-TW", "zh-HK", "zh-MO", "zh-Hant", "zh-Hant-TW"]) expect(deviceLocale(`${tag},en;q=0.8`,()=>true)).toBe("en");
    expect(deviceLocale("ko;q=0,pl;q=0.5,en;q=0.9",()=>true)).toBe("en");
    expect(deviceLocale("ar,en;q=0.8",locale=>locale!=="ar")).toBe("en");
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
  });
  it("uses Stripe-supported language codes and existing country prices",()=>{
    expect(stripeLocale("zh-Hans")).toBe("zh");expect(stripeLocale("ar")).toBe("auto");
    expect(stripeLocale("ko")).toBe("ko");expect(stripeLocale("pl")).toBe("pl");
    expect(displayCurrencyForCountry("KR")).toBe("KRW");
    expect(formatLocalizedPrice("PREMIUM","monthly","KRW","ko")).toBe("₩7,900");
    expect(formatLocalizedPrice("PREMIUM","monthly","PLN","pl")).toContain("19,99");
    expect(formatLocalizedPrice("PREMIUM","monthly","CNY","zh-Hans")).toContain("30.00");
    expect(formatLocalizedPrice("PREMIUM","monthly","BRL","pt-BR")).toContain("21,90");
    expect(localeCohort("ar","SA")).toMatchObject({visitor_country:"SA", visitor_market:"arabic_speaking_markets",localization_cohort:"ar:SA"});
    expect(localeCohort("ko","KR").visitor_market).toBe("south_korea");
    expect(localeCohort("pl","PL").visitor_market).toBe("poland");
    expect(localeCohort("zh-Hans","CN").visitor_market).toBe("china");
  });
});

vi.mock("../../lib/email",()=>({sendTransactionalEmail:vi.fn().mockResolvedValue(true)}));
vi.mock("../../lib/prisma",()=>({prisma:{}}));
afterEach(()=>vi.clearAllMocks());
describe("additional-language email drafts",()=>{
  it.each(["ko","pl","ar","zh-Hans"] as const)("preserves %s links and escapes user content",async locale=>{
    await sendVerificationEmail("test@example.com","opaque",{locale,name:"<img>"});
    let mail=vi.mocked(sendTransactionalEmail).mock.calls.at(-1)![0];
    expect(mail.html).toContain(`lang="${locale}"`);
    expect(mail.html).toContain(`dir="${locale==="ar"?"rtl":"ltr"}"`);
    expect(mail.html).toContain("&lt;img&gt;");
    expect(mail.text).toContain(localeHref("/auth/verify-email",locale));
    await sendPasswordResetEmail("test@example.com","opaque","123456",{locale,name:"<script>"});
    mail=vi.mocked(sendTransactionalEmail).mock.calls.at(-1)![0];
    expect(mail.text).toContain(localeHref("/reset-password/opaque",locale));
    expect(mail.text).toContain("123456");expect(mail.html).toContain("&lt;script&gt;");
    const done=buildTranscriptionCompleteEmail({jobId:"job",sourceLabel:"<img>",locale});
    expect(done.html).toContain("&lt;img&gt;");expect(done.editorUrl).toContain(localeHref("/job/job",locale));
  });
});

import {catalogs} from "../../lib/i18n/translate";
import {additionalPosts} from "../../lib/i18n/blog/additionalPosts";
import {articleTranslation, japanesePosts, localizeBlogProps, localizedReadingTime} from "../../lib/i18n/blog/localize";
import {articleLocales} from "../../lib/i18n/blog/availability";

describe("complete additional-language content",()=>{
  it.each(["ko","pl","ar","zh-Hans"] as const)("keeps every %s message and interpolation",locale=>{
    expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(catalogs.en).sort());
    for(const [source,message] of Object.entries(catalogs[locale])) {
      expect(message.trim(),source).not.toBe("");
      expect((message.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)||[]).sort(),source).toEqual((source.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)||[]).sort());
    }
  });
  it.each(["ko","pl","ar","zh-Hans"] as const)("compiles all %s guides and guards source changes",async locale=>{
    const posts=additionalPosts[locale];
    expect(Object.keys(posts).sort()).toEqual(Object.keys(japanesePosts).sort());
    for(const [slug,row] of Object.entries(posts)) {
      const original=(japanesePosts as Record<string,typeof row>)[slug];
      expect(row.sourceTitle,slug).toBe(original.sourceTitle);
      expect(row.sourceUpdatedAt,slug).toBe(original.sourceUpdatedAt);
      const links=(content:string)=>(content.match(/\]\(([^\s)]+)\)/g)||[]).map(s=>s.split("#")[0].replace(/\)$/,"" )).sort();
      const translatedLinks=links(row.content);
      for(const link of new Set(links(original.content))) expect(translatedLinks.filter(item=>item===link).length,`${slug}: ${link}`).toBeGreaterThanOrEqual(links(original.content).filter(item=>item===link).length);
      expect(row.content,slug).not.toBe(original.content);
      const result=await localizeBlogProps({post:{slug,title:row.sourceTitle,updatedAt:row.sourceUpdatedAt,contentHtml:"Original"},toc:[]},locale);
      const post=result.post as any;
      expect(post.contentLanguage,slug).toBe(locale);
      expect(post.contentHtml).not.toMatch(/href="\/(editor|transcribe|blog|auth)\b/);
      expect(post.contentHtml).not.toContain("<script");
      for(const heading of result.toc as any[]) expect(post.contentHtml).toContain(`id="${heading.id}"`);
      expect(articleLocales(slug,row.sourceUpdatedAt)).toContain(locale);
      expect(articleTranslation(slug,"changed",row.sourceTitle,locale)).toBeNull();
      expect(articleTranslation(slug,row.sourceUpdatedAt,"Changed title",locale)).toBeNull();
    }
    const row=posts["mp3-to-guitar-tabs"];
    const fallback=await localizeBlogProps({post:{slug:"mp3-to-guitar-tabs",title:row.sourceTitle,updatedAt:"changed",contentHtml:"Updated"}},locale);
    expect(fallback.post).toMatchObject({contentLanguage:"en",contentHtml:"Updated"});
  },30000);
  it("counts Chinese reading time without spaces",()=>{
    expect(localizedReadingTime("音".repeat(1500),"zh-Hans").minutes).toBe(3);
    expect(localizedReadingTime("音".repeat(500)+"```\ncode\n```","zh-Hans").minutes).toBe(1);
  });
});
