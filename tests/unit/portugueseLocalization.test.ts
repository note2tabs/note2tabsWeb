import { afterEach, describe, expect, it, vi } from "vitest";
import english from "../../lib/i18n/en.json";
import portuguese from "../../lib/i18n/pt-BR.json";
import { localeFromPath, localeHref, localeSwitchHref, normalizeLocale } from "../../lib/i18n/locale";
import { translate, translatedError } from "../../lib/i18n/translate";
import { portuguesePilotIndexable, withPortuguesePilot } from "../../lib/i18n/pilot";
import { localizeCheckoutReturnPaths } from "../../lib/i18n/checkout";
import { sanitizeAnalyticsPathname, sanitizeAnalyticsUrl } from "../../lib/analyticsPrivacy";
import { sessionReplayIsBlocked } from "../../lib/posthogClient";
import { buildPricingProductStructuredData } from "../../lib/pricingStructuredData";
import { formatLocalizedPrice } from "../../lib/localizedPricing";
import { buildTranscriptionCompleteEmail } from "../../lib/transcriptionCompleteEmail";
import { buildVerificationUrl, sendVerificationEmail } from "../../lib/emailVerification";
import { sendPasswordResetEmail } from "../../lib/passwordReset";
import { sendTransactionalEmail } from "../../lib/email";
vi.mock("../../lib/email", () => ({sendTransactionalEmail: vi.fn().mockResolvedValue(true)}));
vi.mock("../../lib/prisma", () => ({prisma: {}}));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Portuguese acquisition pilot", () => {
  it("has matching catalogs and interpolation parameters", () => {
    expect(Object.keys(portuguese).sort()).toEqual(Object.keys(english).sort());
    for (const [source, message] of Object.entries(portuguese)) {
      expect(message.trim(), source).not.toBe("");
      expect((message.match(/\{\w+\}/g) || []).sort(), source).toEqual((source.match(/\{\w+\}/g) || []).sort());
    }
    expect(translate("Free YouTube clips must be {seconds} seconds or less.", "pt-BR", {seconds: 30})).toContain("30 segundos");
    expect(translate(" month ", "en")).toBe(" month ");
    expect(translate(" and Pro is {price} per {period}", "pt-BR", {price: "R$ 54,90", period: "mês"})).toBe(" e o Pro custa R$ 54,90 por mês");
  });
  it("keeps unsupported editor/legal/blog URLs and external URLs intact", () => {
    expect(localeHref("/transcriber?resumeTranscription=1", "pt-BR")).toBe("/pt-br/transcribe?resumeTranscription=1");
    expect(localeHref("/?resumeTranscription=1#hero", "pt-BR")).toBe("/pt-br?resumeTranscription=1#hero");
    expect(localeHref("/pt-br?resumeTranscription=1#hero", "en")).toBe("/?resumeTranscription=1#hero");
    for (const path of ["/gte/private", "/editor", "/privacy", "/blog/song", "https://stripe.com/checkout", "//example.com"]) expect(localeHref(path, "pt-BR")).toBe(path);
    expect(localeFromPath("/pt-brain")).toBe("en");
    expect(normalizeLocale("pt-PT")).toBe("en");
  });
  it("preserves verification tokens while switching the authentication destination", () => {
    const path = localeSwitchHref("/pt-br/auth/verify-email?token=secret&next=%2Fpt-br%2Fpricing%3Fcheckout%3D1", "en");
    const url = new URL(path, "https://example.com");
    expect(url.pathname).toBe("/auth/verify-email");
    expect(url.searchParams.get("token")).toBe("secret");
    expect(url.searchParams.get("next")).toBe("/pricing?checkout=1");
  });
  it("keeps private Portuguese routes sanitized and excluded from session replay", () => {
    expect(sanitizeAnalyticsUrl("https://www.note2tabs.com/pt-br/reset-password/secret?email=private@example.com")).toBe("https://www.note2tabs.com/pt-br/reset-password/[token]");
    expect(sanitizeAnalyticsPathname("/pt-br/job/private-job?token=secret")).toBe("/pt-br/job/[job_id]");
    expect(sessionReplayIsBlocked("/pt-br/auth/verify-email?token=secret")).toBe(true);
    expect(sessionReplayIsBlocked("/pt-br/reset-password/secret")).toBe(true);
  });
  it("blocks unreviewed production pages and keeps previews noindex", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED", "false");
    const setHeader = vi.fn(); const loader = vi.fn().mockResolvedValue({props: {example: true}});
    const context = {req: {headers: {"x-vercel-ip-country": "BR"}}, res: {setHeader}} as any;
    expect(await withPortuguesePilot(loader)(context)).toEqual({notFound: true}); expect(loader).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await withPortuguesePilot(loader)(context)).toEqual({props: {example: true, initialDisplayCurrency: "BRL"}});
    expect(setHeader).toHaveBeenCalledWith("X-Robots-Tag", "noindex, follow");
    vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED", "true"); vi.stubEnv("VERCEL_ENV", "production");
    await withPortuguesePilot(loader)(context); expect(setHeader).toHaveBeenLastCalledWith("X-Robots-Tag", "index, follow");
  });
  it("keeps reviewed previews noindex after client hydration too", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED", "true");
    vi.stubEnv("NEXT_PUBLIC_PT_BR_PREVIEW", "true"); vi.stubGlobal("window", {});
    expect(portuguesePilotIndexable()).toBe(false);
  });
  it("uses Brazilian formatting without changing prices or forcing currency from language", () => {
    expect(formatLocalizedPrice("PREMIUM", "monthly", "BRL", "pt-BR").replace(/\s/g, " ")).toBe("R$ 21,90");
    expect(formatLocalizedPrice("PREMIUM", "monthly", "USD")).toBe("$5.99");
    expect(formatLocalizedPrice("PREMIUM", "monthly", "USD", "pt-BR")).toContain("5,99");
    expect(buildPricingProductStructuredData(true, "BRL").offers).toMatchObject({highPrice: "549.00", priceCurrency: "BRL"});
  });
  it("retains upload-resume intent through checkout success and cancellation", () => {
    const paths = {success: "/premium/welcome?next=%2Ftranscribe%3FresumeTranscription%3D1",cancel: "/transcribe?resumeTranscription=1&upgrade=cancel",manage: "/settings?upgrade=manage"};
    expect(localizeCheckoutReturnPaths(paths, "en")).toEqual(paths);
    const localized = localizeCheckoutReturnPaths(paths, "pt-BR");
    expect(localized.cancel).toBe("/pt-br/transcribe?resumeTranscription=1&upgrade=cancel");
    expect(new URL(localized.success, "https://example.com").searchParams.get("next")).toBe("/pt-br/transcribe?resumeTranscription=1");
    expect(localized.manage).toBe(paths.manage);
  });
  it("keeps known actionable errors and hides unknown backend details", () => {
    expect(translatedError("Password must be at least 10 characters.", "pt-BR")).toContain("10 caracteres");
    const message = translate("File is too large. Max size is {size} for your plan.", "pt-BR", {size: "50 MB"});
    expect(translatedError(message, "pt-BR")).toBe(message);
    expect(translatedError("trace conexão secret-123", "pt-BR")).not.toContain("secret-123");
    expect(translate("constructor", "pt-BR")).toBe("constructor");
  });
});

describe("Portuguese transactional messages", () => {
  it("localizes account-verification and reset emails and escapes names", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.note2tabs.com");
    const url = buildVerificationUrl("secret", "a@example.com", "/pt-br/transcribe", "pt-BR");
    expect(new URL(url).pathname).toBe("/pt-br/auth/verify-email");
    expect(new URL(url).searchParams.get("next")).toBe("/pt-br/transcribe");
    await sendVerificationEmail("test@example.com", "secret", {name: "<script>",locale:"pt-BR"});
    expect(sendTransactionalEmail).toHaveBeenLastCalledWith(expect.objectContaining({subject:"Confirme sua conta do Note2Tabs",html:expect.stringContaining('lang="pt-BR"')}));
    const verification = vi.mocked(sendTransactionalEmail).mock.calls.at(-1)![0]; expect(verification.html).toContain("&lt;script&gt;");
    await sendPasswordResetEmail("test@example.com", "reset-token", "123456", {locale:"pt-BR"});
    const reset = vi.mocked(sendTransactionalEmail).mock.calls.at(-1)![0]; expect(reset.text).toContain("/pt-br/reset-password/reset-token"); expect(reset.text).toContain("123456");
  });
  it("localizes completion and discloses the English editor", () => {
    const email = buildTranscriptionCompleteEmail({jobId:"private",name:"<script>",sourceLabel:"<img>",locale:"pt-BR"});
    expect(email.subject).toBe("Sua transcrição do Note2Tabs está pronta");
    expect(email.editorUrl).toContain("/pt-br/job/private");
    expect(email.html).toContain("&lt;img&gt;"); expect(email.html).not.toContain("<script>"); expect(email.text).toContain("O editor está em inglês.");
    expect(buildTranscriptionCompleteEmail({jobId:"a",editorId:"editor",locale:"pt-BR"}).editorUrl).toContain("/gte/editor");
  });
});
