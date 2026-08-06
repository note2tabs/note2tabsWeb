import { getAuthSiteUrl } from "./siteUrl";

export const APP_HOME_URL = getAuthSiteUrl();

export const getAppBaseUrl = (_req?: { headers?: Record<string, string | string[] | undefined> }) => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return getAuthSiteUrl();
};
