import type { GetServerSideProps } from "next";
import { prisma } from "../lib/prisma";
import { getBaseUrl, getPublishedWhere } from "../lib/blog";

type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

const staticPaths = [
  "/",
  "/editor",
  "/transcribe",
  "/pricing",
  "/blog",
  "/contact",
  "/privacy",
  "/terms",
  "/audio-to-guitar-tab-converter",
  "/youtube-to-guitar-tabs",
  "/mp3-to-guitar-tabs",
  "/online-guitar-tab-editor",
  "/ai-guitar-tab-generator",
  "/free-guitar-tab-maker",
];

const buildUrl = (baseUrl: string, path: string) =>
  path.startsWith("http") ? path : `${baseUrl}${path}`;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const baseUrl = getBaseUrl();
  const publishedWhere = getPublishedWhere();

  const [posts, categories, tags, clusters] = await Promise.all([
    prisma.post.findMany({
      where: publishedWhere,
      select: { slug: true, updatedAt: true, publishedAt: true, publishAt: true },
    }),
    prisma.category.findMany({
      where: { posts: { some: { post: publishedWhere } } },
      select: { slug: true, updatedAt: true },
    }),
    prisma.tag.findMany({
      where: { posts: { some: { post: publishedWhere } } },
      select: { slug: true, updatedAt: true },
    }),
    prisma.topicCluster.findMany({
      where: { posts: { some: { post: publishedWhere } } },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const entries: SitemapEntry[] = staticPaths.map((path) => ({ loc: buildUrl(baseUrl, path) }));

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
    <loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ""}
  </url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}
</urlset>`;

  res.setHeader("Content-Type", "text/xml");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.write(xml);
  res.end();

  return { props: {} };
};

export default function Sitemap() {
  return null;
}
