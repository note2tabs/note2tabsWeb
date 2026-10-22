import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestCountry, isHeavyPreviewCountry } from "../../lib/heavyPreview";

describe("Heavy preview country eligibility", () => {
  beforeEach(() => vi.stubEnv("HEAVY_PREVIEW_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "false", "", "1", "TRUE"])("disables previews unless explicitly enabled (%s)", (value) => {
    vi.stubEnv("HEAVY_PREVIEW_ENABLED", value);
    vi.stubEnv("HEAVY_PREVIEW_COUNTRIES", "US,DE");
    expect(isHeavyPreviewCountry({ headers: { "x-vercel-ip-country": "US" } } as any)).toBe(false);
  });
  it("normalizes Vercel's trusted country header", () => {
    const request = { headers: { "x-vercel-ip-country": "gb" } } as any;
    expect(getRequestCountry(request)).toBe("GB");
    expect(isHeavyPreviewCountry(request)).toBe(true);
  });

  it("rejects countries outside the launch allowlist", () => {
    expect(isHeavyPreviewCountry({ headers: { "x-vercel-ip-country": "DE" } } as any)).toBe(true);
    expect(isHeavyPreviewCountry({ headers: { "x-vercel-ip-country": "BR" } } as any)).toBe(false);
  });
});
