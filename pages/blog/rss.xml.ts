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

  const items = posts
    .map((post) => {
      const translated = locale === "pt-BR" ? articleTranslation(post.slug, post.updatedAt.toISOString(), post.title) : null;
      const link = `${baseUrl}${localeHref(`/blog/${post.slug}`, translated ? "pt-BR" : "en")}`;
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
    <description>${locale === "pt-BR" ? "Guias e novidades para criar tablaturas com Note2Tabs." : "Guides and updates for Note2Tabs guitar tab creation."}</description>
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
