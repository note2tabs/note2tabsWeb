import type { GetServerSideProps } from "next";
import { prisma } from "../lib/prisma";
import { withPrismaReadRetry } from "../lib/prismaRetry";
import { getBaseUrl, getPublishedWhere } from "../lib/blog";
import { SEO_OPPORTUNITY_CONTENT_LAST_MODIFIED, seoFeaturePages } from "../lib/seoFeaturePages";

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
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/audio-to-guitar-tab-converter",
  "/youtube-to-guitar-tabs",
  "/mp3-to-guitar-tabs",
  "/ai-guitar-tab-generator",
  "/free-guitar-tab-maker",
  "/features",
  ...seoFeaturePages.map((page) => `/features/${page.slug}`),
];

const recentlyUpdatedSeoPaths = new Set([
  "/editor",
  "/audio-to-guitar-tab-converter",
  "/mp3-to-guitar-tabs",
  "/ai-guitar-tab-generator",
  "/free-guitar-tab-maker",
  "/features",
  ...seoFeaturePages.map((page) => `/features/${page.slug}`),
]);

const refreshedSeoPathDates = new Map([
  ["/audio-to-guitar-tab-converter", "2026-08-05"],
  ["/mp3-to-guitar-tabs", "2026-08-05"],
  ["/ai-guitar-tab-generator", "2026-08-14"],
]);

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

  // Keep submissions focused on canonical product pages and individual articles.
  // Taxonomy archives remain discoverable through the blog's internal links.
  const posts = await withPrismaReadRetry(() =>
    prisma.post.findMany({
      where: publishedWhere,
      select: { slug: true, updatedAt: true, publishedAt: true, publishAt: true },
    })
  ).catch((error) => {
    // Product and legal URLs should remain discoverable during a temporary
    // content-database outage. A later cached response restores article URLs.
    console.error("sitemap blog lookup failed", error);
    return [];
  });

  const entries: SitemapEntry[] = staticPaths.map((path) => ({
    loc: buildUrl(baseUrl, path),
    ...(recentlyUpdatedSeoPaths.has(path)
      ? {
          lastmod: `${
            refreshedSeoPathDates.get(path) || SEO_OPPORTUNITY_CONTENT_LAST_MODIFIED
          }T00:00:00.000Z`,
        }
      : {}),
  }));

  posts.forEach((post) => {
    entries.push({
      loc: buildUrl(baseUrl, `/blog/${post.slug}`),
      lastmod: post.updatedAt.toISOString(),
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
