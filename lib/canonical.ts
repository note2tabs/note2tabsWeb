import { getBaseUrl } from "./blog";
import { normalizeSiteUrl } from "./siteUrl";

export const normalizeCanonicalUrl = (value?: string | null) => {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("/")) {
    return `${getBaseUrl()}${raw}`;
  }
  try {
    const url = new URL(raw);
    const normalizedOrigin = normalizeSiteUrl(url.origin);
    return `${normalizedOrigin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return raw;
  }
};
