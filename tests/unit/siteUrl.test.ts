import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe("site URL resolution", () => {
  it("normalizes the apex production site URL to the canonical host", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://note2tabs.com/";
    process.env.NEXT_PUBLIC_APP_URL = "https://note2tabs.com/";

    const { getAuthSiteUrl, getConfiguredSiteUrl } = await import("../../lib/siteUrl");

    expect(getAuthSiteUrl()).toBe("https://www.note2tabs.com");
    expect(getConfiguredSiteUrl()).toBe("https://www.note2tabs.com");
  });

  it("uses the Vercel preview URL when no explicit app URL is configured", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "note2tabs-git-feature-note2tabs.vercel.app";

    const { getAuthSiteUrl, getConfiguredSiteUrl } = await import("../../lib/siteUrl");

    expect(getAuthSiteUrl()).toBe("https://note2tabs-git-feature-note2tabs.vercel.app");
    expect(getConfiguredSiteUrl()).toBe("https://note2tabs-git-feature-note2tabs.vercel.app");
  });

  it("prefers the Vercel preview URL for auth even when NEXTAUTH_URL is production", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://www.note2tabs.com";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "note2tabs-git-feature-note2tabs.vercel.app";

    const { getAuthSiteUrl } = await import("../../lib/siteUrl");

    expect(getAuthSiteUrl()).toBe("https://note2tabs-git-feature-note2tabs.vercel.app");
  });

  it("falls back to localhost for unsafe development auth URLs", async () => {
    process.env.NODE_ENV = "development";
    process.env.NEXTAUTH_URL = "http://130.229.155.173:3000/";
    process.env.NEXT_PUBLIC_APP_URL = "http://130.229.155.173:3000/";

    const { getAuthSiteUrl } = await import("../../lib/siteUrl");

    expect(getAuthSiteUrl()).toBe("http://localhost:3000");
  });
});
