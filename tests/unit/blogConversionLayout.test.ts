import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const postSource = readFileSync("pages/blog/[slug].tsx", "utf8");
const indexSource = readFileSync("pages/blog/index.tsx", "utf8");
const styles = readFileSync("styles/globals.css", "utf8");

describe("blog conversion layout", () => {
  it("offers product paths without interrupting desktop reading", () => {
    expect(indexSource).toContain('placement="blog_index_hero"');
    expect(postSource).toContain('placement="article_sidebar_primary"');
    expect(postSource).toContain('placement="article_contextual_links"');
    expect(postSource).toContain('placement="article_end"');
  });

  it("shows the compact introduction prompt only at mobile widths", () => {
    expect(styles).toContain(".post-mobile-product-card {\n  display: none;");
    expect(styles).toMatch(/@media \(max-width: 960px\)[\s\S]*\.post-mobile-product-card \{\s*display: flex;/);
  });
});
