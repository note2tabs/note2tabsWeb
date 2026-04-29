const PRODUCTION_HOST = "www.note2tabs.com";
const CANONICAL_SITE_URL = `https://${PRODUCTION_HOST}`;

export const normalizeSiteUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim().replace(/\/$/, "");
  if (!trimmed) return CANONICAL_SITE_URL;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "note2tabs.com") {
      url.hostname = PRODUCTION_HOST;
      url.protocol = "https:";
    }
    return url.origin;
  } catch {
    return trimmed;
  }
};

export const getConfiguredSiteUrl = () =>
  process.env.NODE_ENV === "production"
    ? CANONICAL_SITE_URL
    : normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || CANONICAL_SITE_URL);

const isLocalHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

export const getAuthSiteUrl = () => {
  if (process.env.NODE_ENV === "production") {
    return CANONICAL_SITE_URL;
  }

  const rawUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!rawUrl) return "http://localhost:3000";

  try {
    const url = new URL(normalizeSiteUrl(rawUrl));
    if (isLocalHost(url.hostname)) return url.origin;
    if (url.protocol === "https:") return url.origin;
  } catch {
    // Fall through to localhost for malformed development values.
  }

  return "http://localhost:3000";
};
