import Head from "next/head";
import { getConfiguredSiteUrl } from "../lib/siteUrl";

export const SITE_NAME = "Note2Tabs";
export const SITE_URL = getConfiguredSiteUrl();
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const EDITOR_APPLICATION_ID = `${SITE_URL}/editor#software-application`;
export const SITE_LOGO_URL = `${SITE_URL}/android-chrome-512x512.png`;
export const DEFAULT_OG_IMAGE = `${SITE_URL}/api/og?title=Note2Tabs`;
export const DEFAULT_DESCRIPTION =
  "Upload audio or a YouTube link and instantly get playable guitar tabs. Edit, simplify and practice songs directly in the browser.";
export const INDEX_ROBOTS_DIRECTIVE =
  "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

export const SITE_IDENTITY_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: {
      "@type": "ImageObject",
      url: SITE_LOGO_URL,
      width: 512,
      height: 512,
    },
    sameAs: [
      "https://instagram.com/note2tabs",
      "https://tiktok.com/@note2tabs",
      "https://youtube.com/@note2tabs",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    alternateName: "note2tabs.com",
    url: `${SITE_URL}/`,
    description: DEFAULT_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": ORGANIZATION_ID },
  },
] as const;

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

const canonicalizeUrl = (value: string) => {
  try {
    const url = new URL(value, SITE_URL);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return absoluteUrl(value);
  }
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
  const canonical = canonicalizeUrl(canonicalUrl || canonicalPath || "/");
  const image =
    imageUrl ||
    `${SITE_URL}/api/og?title=${encodeURIComponent(title.replace(/\s*\|\s*Note2Tabs\s*$/i, ""))}&subtitle=${encodeURIComponent(
      description.slice(0, 120)
    )}`;
  const structuredData = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];

  return (
    <Head>
      <title>{title}</title>
      <meta key="description" name="description" content={description} />
      <link key="canonical" rel="canonical" href={canonical} />
      <meta key="robots" name="robots" content={noindex ? "noindex,follow" : INDEX_ROBOTS_DIRECTIVE} />
      <meta key="googlebot" name="googlebot" content={noindex ? "noindex,follow" : INDEX_ROBOTS_DIRECTIVE} />
      <meta key="og:title" property="og:title" content={title} />
      <meta key="og:description" property="og:description" content={description} />
      <meta key="og:type" property="og:type" content={ogType} />
      <meta key="og:url" property="og:url" content={canonical} />
      <meta key="og:site_name" property="og:site_name" content={SITE_NAME} />
      <meta key="og:image" property="og:image" content={image} />
      {!imageUrl && <meta key="og:image:width" property="og:image:width" content="1200" />}
      {!imageUrl && <meta key="og:image:height" property="og:image:height" content="630" />}
      <meta key="og:image:alt" property="og:image:alt" content={`${title} — ${SITE_NAME}`} />
      <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      <meta key="twitter:image" name="twitter:image" content={image} />
      <meta key="twitter:image:alt" name="twitter:image:alt" content={`${title} — ${SITE_NAME}`} />
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
