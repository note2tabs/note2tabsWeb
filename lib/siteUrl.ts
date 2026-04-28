const PRODUCTION_HOST = "www.note2tabs.com";

export const normalizeSiteUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim().replace(/\/$/, "");
  if (!trimmed) return `https://${PRODUCTION_HOST}`;

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
  normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || `https://${PRODUCTION_HOST}`);
