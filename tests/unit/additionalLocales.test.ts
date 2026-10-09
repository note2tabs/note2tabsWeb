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
