import type { GetServerSideProps } from "next";
import { prisma } from "../../lib/prisma";
import { getBaseUrl, getPublishedWhere } from "../../lib/blog";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const baseUrl = getBaseUrl();
  const posts = await prisma.post.findMany({
    where: getPublishedWhere(),
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 50,
    select: { title: true, slug: true, excerpt: true, publishedAt: true, publishAt: true, updatedAt: true },
  });

  const items = posts
    .map((post) => {
      const link = `${baseUrl}/blog/${post.slug}`;
      const pubDate = (post.publishedAt || post.publishAt || post.updatedAt).toUTCString();
      return `
      <item>
        <title>${escapeXml(post.title)}</title>
        <link>${link}</link>
        <guid>${link}</guid>
        <pubDate>${pubDate}</pubDate>
        <description>${escapeXml(post.excerpt)}</description>
      </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Note2Tabs Blog</title>
    <link>${baseUrl}/blog</link>
    <description>Guides and updates for Note2Tabs guitar tab creation.</description>
    ${items}
  </channel>
</rss>`;

  res.setHeader("Content-Type", "application/rss+xml");
  res.write(xml);
  res.end();

  return { props: {} };
};

export default function BlogRss() {
  return null;
}
