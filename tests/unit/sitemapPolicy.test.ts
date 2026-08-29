import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sitemapSource = readFileSync(
  join(process.cwd(), "pages", "sitemap.xml.ts"),
  "utf8"
);

describe("sitemap indexing policy", () => {
  it("submits the canonical standalone editor landing page", () => {
    expect(sitemapSource).toContain('"/editor"');
    expect(sitemapSource).not.toContain('"/online-guitar-tab-editor"');
  });

  it("submits published articles without taxonomy archive crawl noise", () => {
    expect(sitemapSource).toContain("prisma.post.findMany");
    expect(sitemapSource).not.toContain("prisma.category.findMany");
    expect(sitemapSource).not.toContain("prisma.tag.findMany");
    expect(sitemapSource).not.toContain("prisma.topicCluster.findMany");
  });
});
