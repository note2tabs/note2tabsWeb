import { getBaseUrl } from "./blog";

export const normalizeCanonicalUrl = (value?: string | null) => {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("/")) {
    return `${getBaseUrl()}${raw}`;
  }
  return raw;
};

