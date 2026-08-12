import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextConfig = require("../../next.config.js");

describe("embedded tab response policy", () => {
  it("allows embedding only on the isolated noindex route", async () => {
    const rules = await nextConfig.headers();
    const embedRule = rules.find((rule: { source: string }) => rule.source === "/embed/:path*");
    const appRule = rules.find((rule: { source: string }) => rule.source.includes("?!embed"));
    const embedHeaders = Object.fromEntries(
      embedRule.headers.map((header: { key: string; value: string }) => [header.key, header.value])
    );
    const appHeaders = Object.fromEntries(
      appRule.headers.map((header: { key: string; value: string }) => [header.key, header.value])
    );

    expect(embedHeaders["Content-Security-Policy"]).toContain("frame-ancestors *");
    expect(embedHeaders["Content-Security-Policy"]).toContain("media-src 'none'");
    expect(embedHeaders["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(embedHeaders["X-Robots-Tag"]).toContain("noindex");
    expect(embedHeaders["Referrer-Policy"]).toBe("no-referrer");
    expect(embedHeaders).not.toHaveProperty("X-Frame-Options");
    expect(appHeaders["X-Frame-Options"]).toBe("SAMEORIGIN");
  });
});
