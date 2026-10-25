import { instrumentGuides } from "../../lib/instrumentGuideIndex";
import { INSTRUMENT_SEO_UPDATED } from "../../lib/instrumentSeoPages";
import { articleTranslation } from "../../lib/i18n/blog/localize";
import { localeFromPath, localeHref } from "../../lib/i18n/locale";
import type { GetServerSideProps } from "next";
import { prisma } from "../../lib/prisma";
import { withPrismaReadRetry } from "../../lib/prismaRetry";
import { getBaseUrl, getPublishedWhere } from "../../lib/blog";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const getServerSideProps: GetServerSideProps = async ({ res, resolvedUrl }) => {
  const baseUrl = getBaseUrl();
  const locale = localeFromPath(resolvedUrl);
  const posts = await withPrismaReadRetry(() => prisma.post.findMany({
    where: getPublishedWhere(),
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 50,
    select: { title: true, slug: true, excerpt: true, publishedAt: true, publishAt: true, updatedAt: true },
  })).catch((error) => {
    // Keep a valid feed available while the content store recovers rather
    // than returning an HTML error document from an XML endpoint.
    console.error("blog RSS lookup failed", error);
    return [];
  });

  const guideDate = new Date(`${INSTRUMENT_SEO_UPDATED}T00:00:00.000Z`);
  const knownSlugs = new Set(posts.map(post => post.slug));
  const feedPosts = [...posts, ...(locale === "en" ? instrumentGuides.filter(guide => !knownSlugs.has(guide.slug)).map(guide => ({
    title: guide.title, slug: guide.slug, excerpt: guide.excerpt,
    publishedAt: guideDate, publishAt: null, updatedAt: guideDate,
  })) : [])].sort((a, b) => (b.publishedAt || b.publishAt || b.updatedAt).getTime() - (a.publishedAt || a.publishAt || a.updatedAt).getTime()).slice(0, locale === "en" ? 50 + instrumentGuides.length : 50);

  const items = feedPosts
    .map((post) => {
      const translated = locale !== "en" ? articleTranslation(post.slug, post.updatedAt.toISOString(), post.title, locale) : null;
      const link = `${baseUrl}${localeHref(`/blog/${post.slug}`, translated ? locale : "en")}`;
      const pubDate = (post.publishedAt || post.publishAt || post.updatedAt).toUTCString();
      return `
      <item>
        <title>${escapeXml(translated?.title || post.title)}</title>
        <link>${link}</link>
        <guid>${link}</guid>
        <pubDate>${pubDate}</pubDate>
        <description>${escapeXml(translated?.excerpt || post.excerpt)}</description>
      </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Note2Tabs Blog</title>
    <link>${baseUrl}${localeHref("/blog", locale)}</link>
    <language>${locale}</language>
    <description>${locale === "fr" ? "Guides et actualités pour créer des tablatures de guitare avec Note2Tabs." : locale === "it" ? "Guide e novità per creare tablature per chitarra con Note2Tabs." : locale === "ko" ? "Note2Tabs 기타 타브 악보 가이드 및 소식." : locale === "pl" ? "Poradniki i aktualności dotyczące tabulatur w Note2Tabs." : locale === "ar" ? "أدلة وأخبار إنشاء تابلاتشر الغيتار باستخدام Note2Tabs." : locale === "zh-Hans" ? "Note2Tabs 吉他六线谱制作指南与最新动态。" : locale === "pt-BR" ? "Guias e novidades para criar tablaturas com Note2Tabs." : locale === "es" ? "Guías y novedades para crear tablaturas con Note2Tabs." : locale === "ja" ? "Note2TabsでギターのTAB譜を作成するためのガイドと最新情報。" : "Guides and updates for Note2Tabs guitar tab creation."}</description>
    ${items}
  </channel>
</rss>`;

  res.setHeader("Content-Type", "application/rss+xml");
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
  res.write(xml);
  res.end();

  return { props: {} };
};

export default function BlogRss() {
  return null;
}
