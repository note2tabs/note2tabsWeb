import type { GetServerSideProps } from "next";
import { prisma } from "../lib/prisma";
import { getBaseUrl, getPublishedWhere } from "../lib/blog";

type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

const buildUrl = (baseUrl: string, path: string) =>
  path.startsWith("http") ? path : `${baseUrl}${path}`;

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const baseUrl = getBaseUrl();

  const [posts, categories, tags, clusters] = await Promise.all([
    prisma.post.findMany({
      where: getPublishedWhere(),
      select: { slug: true, updatedAt: true, publishedAt: true, publishAt: true },
    }),
    prisma.category.findMany({ select: { slug: true, updatedAt: true } }),
    prisma.tag.findMany({ select: { slug: true, updatedAt: true } }),
    prisma.topicCluster.findMany({ select: { slug: true, updatedAt: true } }),
  ]);

  const entries: SitemapEntry[] = [
    { loc: buildUrl(baseUrl, "/") },
    { loc: buildUrl(baseUrl, "/editor") },
    { loc: buildUrl(baseUrl, "/transcribe") },
    { loc: buildUrl(baseUrl, "/pricing") },
    { loc: buildUrl(baseUrl, "/blog") },
    { loc: buildUrl(baseUrl, "/blog/rss.xml") },
  ];

  posts.forEach((post) => {
    entries.push({
      loc: buildUrl(baseUrl, `/blog/${post.slug}`),
      lastmod: (post.publishedAt || post.publishAt || post.updatedAt).toISOString(),
    });
  });

  categories.forEach((category) => {
    entries.push({
      loc: buildUrl(baseUrl, `/blog/category/${category.slug}`),
      lastmod: category.updatedAt.toISOString(),
    });
  });

  tags.forEach((tag) => {
    entries.push({
      loc: buildUrl(baseUrl, `/blog/tag/${tag.slug}`),
      lastmod: tag.updatedAt.toISOString(),
    });
  });

  clusters.forEach((cluster) => {
    entries.push({
      loc: buildUrl(baseUrl, `/blog/cluster/${cluster.slug}`),
      lastmod: cluster.updatedAt.toISOString(),
    });
  });

  const body = entries
    .map(
      (entry) => `
  <url>
    <loc>${entry.loc}</loc>${entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ""}
  </url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}
</urlset>`;

  res.setHeader("Content-Type", "text/xml");
  res.write(xml);
  res.end();

  return { props: {} };
};

export default function Sitemap() {
  return null;
}
