import { afterEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";
import handler from "../../pages/api/analytics/replay-eligibility";

afterEach(() => vi.unstubAllEnvs());

describe("country-scoped replay eligibility", () => {
  it.each(["JP", "CN", "BR", "KR", "PL", "ES", "AE", "US", "unknown", "jp", "", ["JP", "CN"]])(
    "allows only exact trusted production target countries: %s", country => {
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "production");
      const { req, res } = createMocks({ method: "GET", headers: { "x-vercel-ip-country": country } });
      handler(req as any, res as any);
      expect(res._getJSONData()).toEqual({ eligible: country === "JP" || country === "CN" });
      expect(res.getHeader("Cache-Control")).toBe("private, no-store");
    }
  );

  it.each(["preview", "development", "production"])("rejects missing trusted hosting or geography in %s", environment => {
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("VERCEL", "");
    const { req, res } = createMocks({ method: "GET", headers: { "x-vercel-ip-country": "JP" } });
    handler(req as any, res as any);
    expect(res._getJSONData()).toEqual({ eligible: false });
    vi.stubEnv("VERCEL", "1");
    const missing = createMocks({ method: "GET", query: { country: "JP" }, headers: { cookie: "country=JP", "accept-language": "ja" } });
    handler(missing.req as any, missing.res as any);
    expect(missing.res._getJSONData()).toEqual({ eligible: false });
  });

  it("rejects writes", () => {
    const { req, res } = createMocks({ method: "POST" });
    handler(req as any, res as any);
    expect(res.statusCode).toBe(405);
  });
});
