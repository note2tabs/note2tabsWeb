import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const robots = readFileSync(join(process.cwd(), "public", "robots.txt"), "utf8");

describe("robots.txt", () => {
  it("allows crawlers to read noindex on editor workspaces", () => {
    expect(robots).not.toMatch(/^Disallow:\s*\/gte/m);
  });

  it("keeps public SEO pages crawlable and advertises the canonical sitemap", () => {
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://www.note2tabs.com/sitemap.xml");
  });

  it("continues to block internal APIs and administration routes", () => {
    expect(robots).toMatch(/^Disallow:\s*\/api\//m);
    expect(robots).toMatch(/^Disallow:\s*\/admin\//m);
    expect(robots).toMatch(/^Disallow:\s*\/mod\//m);
  });
});
