import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FeaturePage, { getStaticPaths } from "../../pages/features/[slug]";
import FeaturesPage from "../../pages/features";
import { seoFeaturePages } from "../../lib/seoFeaturePages";

describe("issue 106 editor feature pages", () => {
  it("builds a substantial indexable page for every feature cluster", () => {
    expect(seoFeaturePages).toHaveLength(6);

    for (const page of seoFeaturePages) {
      const html = renderToStaticMarkup(createElement(FeaturePage, { page }));

      expect(html).toContain(`class="feature-story feature-story--`);
      expect(html).toContain(`<h1>${page.title}</h1>`);
      expect(html).toContain("Try the editor free");
      expect(html).toContain("Transcribe audio to tabs");
      expect(html).toContain("View all features");
      expect(html).toContain('<a href="/editor">Guitar tab editor</a>');
      expect(html).toContain('<a href="/features">Features</a>');
      expect(html.match(/<section/g)?.length).toBeGreaterThanOrEqual(7);
      for (const step of page.steps) expect(html).toContain(step.title);
      for (const section of page.contentSections) expect(html).toContain(section.title);
      for (const faq of page.faqs) expect(html).toContain(faq.question);
    }
  });

  it("builds a useful collection page that links every feature to the editor journey", () => {
    const html = renderToStaticMarkup(createElement(FeaturesPage));

    expect(html).toContain("Tools for the decisions guitar tabs actually need.");
    expect(html).toContain('href="/editor"');
    expect(html).toContain('href="/transcribe"');
    expect(html).toContain('<a href="/editor">Guitar tab editor</a>');
    for (const page of seoFeaturePages) {
      expect(html).toContain(`href="/features/${page.slug}"`);
      expect(html).toContain(page.title);
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
