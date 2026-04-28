import Head from "next/head";
import { getConfiguredSiteUrl } from "../lib/siteUrl";

export const SITE_NAME = "Note2Tabs";
export const SITE_URL = getConfiguredSiteUrl();
export const DEFAULT_OG_IMAGE = `${SITE_URL}/logo01black.png`;
export const DEFAULT_DESCRIPTION =
  "Upload audio or a YouTube link and instantly get playable guitar tabs. Edit, simplify and practice songs directly in the browser.";

type JsonLd = Record<string, unknown>;

type SeoHeadProps = {
  title: string;
  description?: string;
  canonicalPath?: string;
  canonicalUrl?: string;
  imageUrl?: string | null;
  ogType?: "website" | "article";
  noindex?: boolean;
  rssUrl?: string;
  jsonLd?: JsonLd | JsonLd[];
  articlePublishedTime?: string;
  articleModifiedTime?: string;
};

export const absoluteUrl = (pathOrUrl: string) => {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_URL}${path}`;
};

export default function SeoHead({
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalPath,
  canonicalUrl,
  imageUrl,
  ogType = "website",
  noindex = false,
  rssUrl,
  jsonLd,
  articlePublishedTime,
  articleModifiedTime,
}: SeoHeadProps) {
  const canonical = canonicalUrl || absoluteUrl(canonicalPath || "/");
  const image = imageUrl || DEFAULT_OG_IMAGE;
  const structuredData = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];

  return (
    <Head>
      <title>{title}</title>
      <meta key="description" name="description" content={description} />
      <link key="canonical" rel="canonical" href={canonical} />
      <meta key="robots" name="robots" content={noindex ? "noindex,nofollow" : "index,follow"} />
      <meta key="og:title" property="og:title" content={title} />
      <meta key="og:description" property="og:description" content={description} />
      <meta key="og:type" property="og:type" content={ogType} />
      <meta key="og:url" property="og:url" content={canonical} />
      <meta key="og:site_name" property="og:site_name" content={SITE_NAME} />
      <meta key="og:image" property="og:image" content={image} />
      <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      <meta key="twitter:image" name="twitter:image" content={image} />
      {articlePublishedTime && (
        <meta key="article:published_time" property="article:published_time" content={articlePublishedTime} />
      )}
      {articleModifiedTime && (
        <meta key="article:modified_time" property="article:modified_time" content={articleModifiedTime} />
      )}
      {rssUrl && (
        <link
          key="rss"
          rel="alternate"
          type="application/rss+xml"
          title={`${SITE_NAME} Blog RSS`}
          href={absoluteUrl(rssUrl)}
        />
      )}
      {structuredData.map((item, index) => (
        <script
          key={`jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </Head>
  );
}
