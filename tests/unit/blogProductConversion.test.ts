import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BlogProductLink from "../../components/blog/BlogProductLink";

describe("blog product conversion links", () => {
  it("keeps a crawlable product destination", () => {
    const html = renderToStaticMarkup(
      createElement(
        BlogProductLink,
        {
          href: "/transcribe",
          articleSlug: "example-guide",
          cta: "blog_transcribe",
          placement: "article_sidebar_primary",
        },
        "Try the transcriber"
      )
    );

    expect(html).toContain('href="/transcribe"');
    expect(html).toContain("Try the transcriber");
  });
});
