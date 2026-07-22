import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FeaturePage, { getStaticPaths } from "../../pages/features/[slug]";
import { seoFeaturePages } from "../../lib/seoFeaturePages";

describe("issue 106 editor feature pages", () => {
  it("builds a substantial indexable page for every feature cluster", () => {
    expect(seoFeaturePages).toHaveLength(6);

    for (const page of seoFeaturePages) {
      const html = renderToStaticMarkup(createElement(FeaturePage, { page }));

      expect(html).toContain(`<h1 class="hero-title">${page.title}</h1>`);
      expect(html).toContain("Try the editor free");
      expect(html).toContain("Transcribe audio to tabs");
      expect(html.length).toBeGreaterThan(4500);
    }
  });

  it("pre-renders every configured feature route", async () => {
    const result = await getStaticPaths({} as never);

    expect(result).toEqual({
      paths: seoFeaturePages.map((page) => ({ params: { slug: page.slug } })),
      fallback: false,
    });
  });

  it("covers every feature named in issue 106", () => {
    const copy = JSON.stringify(seoFeaturePages).toLowerCase();

    for (const phrase of [
      "fingering",
      "cut positions",
      "snap-to-key",
      "key detection",
      "alternate",
      "chord tracks",
      "chord diagrams",
      "strumming",
      "keyboard shortcuts",
      "bends",
      "hammer-ons",
      "pull-offs",
      "import",
      "export",
      "speed trainer",
    ]) {
      expect(copy).toContain(phrase);
    }
  });
});
