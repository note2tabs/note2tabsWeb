import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextConfig = require("../../next.config.js");

describe("SEO routing", () => {
  it("permanently consolidates the apex domain onto www", async () => {
    const redirects = await nextConfig.redirects();

    expect(redirects).toContainEqual({
      source: "/:path*",
      has: [{ type: "host", value: "note2tabs.com" }],
      destination: "https://www.note2tabs.com/:path*",
      permanent: true,
    });
  });

  it("sends a noindex response header for every editor workspace", async () => {
    const headers = await nextConfig.headers();

    expect(headers).toContainEqual({
      source: "/gte/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
    });
  });
});
