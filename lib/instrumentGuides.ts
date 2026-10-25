import fs from "node:fs/promises";
import path from "node:path";
import { compilePostContent } from "./blogContent";
import { estimateReadingTime } from "./blog";

import { instrumentGuides } from "./instrumentGuideIndex";
export async function instrumentGuideProps(slug: string) {
  const guide = instrumentGuides.find(item => item.slug === slug);
  if (!guide) return { notFound: true as const };
  const content = await fs.readFile(path.join(process.cwd(), "data", "instrument-guides", `${slug}.md`), "utf8");
  const compiled = await compilePostContent(content, "PLAIN", { title: guide.title });
  const reading = estimateReadingTime(content);
  return { props: {
    post: { id: `guide-${slug}`, title: guide.title, slug, excerpt: guide.excerpt, contentMode: "PLAIN" as const,
      contentHtml: compiled.contentHtml, contentLanguage: "en" as const,
      coverImageUrl: null, publishedAt: "2026-10-25T00:00:00.000Z", publishAt: null, updatedAt: "2026-10-25T00:00:00.000Z",
      authorName: "Note2Tabs", seoTitle: guide.title, seoDescription: guide.excerpt, canonicalUrl: null,
      categories: [], tags: [], clusters: [],
    }, readingMinutes: reading.minutes, wordCount: reading.words, toc: compiled.contentToc,
    relatedPosts: instrumentGuides.filter(item => item.slug !== slug && item.instrument === guide.instrument)
      .map(item => ({ id: `guide-${item.slug}`, title: item.title, slug: item.slug })),
  } };
}
