import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { deviceLocale, detectedLocaleDestination } from "../../lib/i18n/detection";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue({ sub: "user-1" }) }));
import proxy from "../../proxy";

const available = () => true;
afterEach(() => vi.unstubAllEnvs());
describe("device language detection", () => {
  it.each([
    ["pt-BR,pt;q=0.9,en;q=0.8", "pt-BR"], ["pt-PT", "pt-BR"],
    ["es-MX,es;q=0.9,en;q=0.8", "es"], ["es-ES", "es"],
    ["en-US,es;q=0.8", "en"], ["es;q=0.5,en;q=0.9", "en"],
    ["fr,es;q=0.8", "es"], ["es;q=0,en", "en"],
    ["es;q=invalid,pt-BR;q=0.7", "pt-BR"], ["de-DE", "en"], ["", "en"],
  ])("uses the highest-priority supported device language: %s", (header, locale) => {
    expect(deviceLocale(header, available)).toBe(locale);
  });
  it("never selects an unavailable translation", () => {
    expect(deviceLocale("es,pt-BR;q=0.8,en;q=0.5", locale => locale !== "es")).toBe("pt-BR");
    expect(detectedLocaleDestination("/pricing", "es", "es", "Browser", locale => locale === "en")).toBeNull();
  });
  it("preserves an explicit choice, including English", () => {
    expect(detectedLocaleDestination("/pricing", "es", "en", "Browser", available)).toBeNull();
    expect(detectedLocaleDestination("/pricing", "en", "pt-BR", "Browser", available)).toBe("/pt-br/pricing");
    expect(detectedLocaleDestination("/pricing", "es", "invalid", "Browser", available)).toBe("/es/pricing");
  });
  it("preserves direct translated URLs, search crawlers, private pages and the editor workspace", () => {
    for (const path of ["/es/pricing", "/pt-br/editor", "/gte/local", "/api/transcribe", "/settings", "/reset-password/secret", "/admin"])
      expect(detectedLocaleDestination(path, "es", undefined, "Browser", available)).toBeNull();
    expect(detectedLocaleDestination("/pricing", "es", undefined, "Googlebot", available)).toBeNull();
  });
  it("preserves acquisition and transcription-resume query parameters", () => {
    expect(detectedLocaleDestination("/transcribe?resumeTranscription=1&utm_source=music", "es-MX", undefined, "Browser", available))
      .toBe("/es/transcribe?resumeTranscription=1&utm_source=music");
  });
  it("redirects before authentication using device language, never country, and avoids caching it", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await proxy(new NextRequest("https://www.note2tabs.com/pricing?utm_source=music", {
      headers: { "accept-language": "es-MX", "x-vercel-ip-country": "BR" },
    }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.note2tabs.com/es/pricing?utm_source=music");
    expect(response.headers.get("vary")).toBe("Accept-Language, Cookie");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.cookies.get("n2t_currency")?.value).toBe("BRL");
  });
  it("keeps public English pages accessible to signed-in users without redirecting them to home", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await proxy(new NextRequest("https://www.note2tabs.com/about", { headers: { "accept-language": "en" } }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
  it("does not redirect into gated production languages", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ES_REVIEWED", "false"); vi.stubEnv("NEXT_PUBLIC_PT_BR_REVIEWED", "false");
    const response = await proxy(new NextRequest("https://www.note2tabs.com/pricing", { headers: { "accept-language": "es" } }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
