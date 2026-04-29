import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe("site URL resolution", () => {
  it("forces the canonical HTTPS site URL in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "http://130.229.155.173:3000/";
    process.env.NEXT_PUBLIC_APP_URL = "http://130.229.155.173:3000/";

    const { getAuthSiteUrl, getConfiguredSiteUrl } = await import("../../lib/siteUrl");

    expect(getAuthSiteUrl()).toBe("https://www.note2tabs.com");
    expect(getConfiguredSiteUrl()).toBe("https://www.note2tabs.com");
  });

  it("falls back to localhost for unsafe development auth URLs", async () => {
    process.env.NODE_ENV = "development";
    process.env.NEXTAUTH_URL = "http://130.229.155.173:3000/";
    process.env.NEXT_PUBLIC_APP_URL = "http://130.229.155.173:3000/";

    const { getAuthSiteUrl } = await import("../../lib/siteUrl");

    expect(getAuthSiteUrl()).toBe("http://localhost:3000");
  });
});
