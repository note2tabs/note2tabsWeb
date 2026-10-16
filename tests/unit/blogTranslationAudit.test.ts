import {readdirSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {compilePostContent} from "../../lib/blogContent";
import {localizeBlogProps} from "../../lib/i18n/blog/localize";
import {articleLocales} from "../../lib/i18n/blog/availability";
import {localeHref, type AppLocale} from "../../lib/i18n/locale";

const locales = ["pt-BR", "es", "ja", "ko", "pl", "ar", "zh-Hans"] as const;
const cases = locales.flatMap(locale => readdirSync(`lib/i18n/blog/${locale}`).filter(file => file.endsWith(".json")).map(file => ({locale, slug: file.slice(0,-5), row: JSON.parse(readFileSync(`lib/i18n/blog/${locale}/${file}`, "utf8"))})));
describe("all authored blog translations", () => {
  it.each(cases)("compiles and retains localized links for $locale / $slug", async ({locale, slug, row}) => {
    expect(articleLocales(slug, row.sourceUpdatedAt)).toContain(locale);
    const result = await localizeBlogProps({post: {slug, title: row.sourceTitle, updatedAt: row.sourceUpdatedAt, seoTitle: "Source title", contentHtml: "<p>English source fixture</p>"}, readingMinutes: 1, wordCount: 3, toc: []}, locale) as any;
    expect(result.post.title).toBe(row.title);
    expect(result.post.seoTitle).toBe(row.seoTitle);
    expect(result.post.contentLanguage).toBe(locale);
    expect(result.post.canonicalUrl).toBeNull();
    expect(result.post.contentHtml).not.toContain("English source fixture");
    expect(result.post.contentHtml.length).toBeGreaterThan(100);
    expect(result.readingMinutes).toBeGreaterThan(0);
    for (const [,href] of row.content.matchAll(/\]\((\/[^\s)]*)\)/g)) {
      const expected = localeHref(href, locale);
      const actualLinks = [...result.post.contentHtml.matchAll(/href="([^"]+)"/g)].map((match: any) => decodeURI(match[1].replaceAll("&#x26;", "&").replaceAll("&amp;", "&")));
      expect(actualLinks).toContain(decodeURI(expected));
      const url = new URL(href, "https://local.test");
      const target = cases.find(item => item.locale === locale && `/blog/${item.slug}` === url.pathname);
      if (target && url.hash) {
        const compiled = await compilePostContent(target.row.content, "PLAIN", {title: target.row.title});
        expect(compiled.contentHtml, `${locale}: ${slug} links to missing ${href}`).toContain(`id="${decodeURIComponent(url.hash.slice(1))}"`);
      }
    }
  });
  it.each(["fr", "it"] as AppLocale[])("keeps unauthored %s articles as an explicit English fallback", async locale => {
    const result = await localizeBlogProps({post: {slug: cases[0].slug, title: cases[0].row.sourceTitle, updatedAt: cases[0].row.sourceUpdatedAt, contentHtml: "<p>English source fixture</p>"}}, locale) as any;
    expect(result.post.contentLanguage).toBe("en");
    expect(result.post.contentHtml).toBe("<p>English source fixture</p>");
  });
  it.each(locales)("does not show stale %s translations after a source update", async locale => {
    const row = cases.find(item => item.locale === locale)!;
    const result = await localizeBlogProps({post: {slug: row.slug, title: row.row.sourceTitle, updatedAt: "2099-01-01T00:00:00.000Z", contentHtml: "<p>New English source</p>"}}, locale) as any;
    expect(result.post.contentLanguage).toBe("en");
    expect(result.post.contentHtml).toContain("New English source");
  });
});
