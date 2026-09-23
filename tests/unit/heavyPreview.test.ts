import { describe, expect, it } from "vitest";
import { getRequestCountry, isHeavyPreviewCountry } from "../../lib/heavyPreview";

describe("Heavy preview country eligibility", () => {
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
