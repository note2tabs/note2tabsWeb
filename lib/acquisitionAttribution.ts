import { sanitizeAnalyticsPathname } from "./analyticsPrivacy";

export const ANALYTICS_ATTRIBUTION_COOKIE = "analytics_first_touch";

export type AcquisitionAttribution = {
  first_touch_source: string;
  first_touch_medium: string;
  first_touch_referring_domain: string;
  first_touch_landing_path: string;
  first_touch_campaign: string;
};

const SEARCH_DOMAINS: Array<[RegExp, string]> = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)search\.brave\.com$/, "brave"],
  [/(^|\.)search\.yahoo\.|(^|\.)yahoo\./, "yahoo"],
  [/(^|\.)ecosia\.org$/, "ecosia"],
  [/(^|\.)yandex\./, "yandex"],
];

const AI_DOMAINS: Array<[RegExp, string]> = [
  [/(^|\.)chatgpt\.com$/, "chatgpt"],
  [/(^|\.)perplexity\.(?:ai|com)$/, "perplexity"],
  [/(^|\.)copilot\.microsoft\.com$/, "copilot"],
  [/(^|\.)gemini\.google\.com$/, "gemini"],
  [/(^|\.)claude\.ai$/, "claude"],
  [/(^|\.)doubao\.com$/, "doubao"],
];

const SOCIAL_DOMAINS: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "facebook"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "youtube"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)twitter\.com$|(^|\.)x\.com$/, "x"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
];

const EMAIL_DOMAINS = [
  /(^|\.)mail\.google\.com$/,
  /^com\.google\.android\.gm$/,
  /(^|\.)outlook\.(?:live|office)\.com$/,
];

const AUTH_AND_PAYMENT_DOMAINS = [
  /(^|\.)accounts\.google\./,
  /(^|\.)checkout\.stripe\.com$/,
];

const RETURNING_ENTRY_PATHS = [
  /^\/auth\/(?:login|verify-email)(?:\/|$)/,
  /^\/(?:account|settings|history|tabs|job|gte)(?:\/|$)/,
];

function cookieValue(name: string) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function normalizeLabel(value: string | null | undefined, fallback = "") {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || fallback;
}

function referringDomain(referrer: string | undefined) {
  if (!referrer) return "";
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, "").slice(0, 160);
  } catch {
    return "";
  }
}

function isInternalDomain(domain: string, hostname: string) {
  const normalizedHost = hostname.toLowerCase().replace(/^www\./, "");
  return domain === normalizedHost || domain.endsWith(`.${normalizedHost}`);
}

function matchDomain(domain: string, mappings: Array<[RegExp, string]>) {
  return mappings.find(([pattern]) => pattern.test(domain))?.[1];
}

function mediumForSource(source: string) {
  if (["instagram", "facebook", "tiktok", "youtube", "reddit", "x", "linkedin"].includes(source)) {
    return "social";
  }
  if (["chatgpt", "perplexity", "copilot", "gemini", "claude", "doubao"].includes(source)) {
    return "ai_assistant";
  }
  return "campaign";
}

export function classifyAcquisition(input: {
  url: string;
  referrer?: string;
  hostname: string;
}): AcquisitionAttribution {
  const url = new URL(input.url, `https://${input.hostname}`);
  const landingPath = sanitizeAnalyticsPathname(url.pathname);
  const domain = referringDomain(input.referrer);
  const externalDomain = domain && !isInternalDomain(domain, input.hostname) ? domain : "";
  const utmSource = normalizeLabel(url.searchParams.get("utm_source"));
  const utmMedium = normalizeLabel(url.searchParams.get("utm_medium"));
  const campaign = normalizeLabel(url.searchParams.get("utm_campaign"));

  if (utmSource) {
    return {
      first_touch_source: utmSource,
      first_touch_medium: utmMedium || mediumForSource(utmSource),
      first_touch_referring_domain: externalDomain,
      first_touch_landing_path: landingPath,
      first_touch_campaign: campaign,
    };
  }

  if (AUTH_AND_PAYMENT_DOMAINS.some((pattern) => pattern.test(externalDomain))) {
    return {
      first_touch_source: "returning_unknown",
      first_touch_medium: "internal_return",
      first_touch_referring_domain: "",
      first_touch_landing_path: landingPath,
      first_touch_campaign: "",
    };
  }

  const searchSource = matchDomain(externalDomain, SEARCH_DOMAINS);
  if (searchSource) {
    return {
      first_touch_source: searchSource,
      first_touch_medium: "organic_search",
      first_touch_referring_domain: externalDomain,
      first_touch_landing_path: landingPath,
      first_touch_campaign: "",
    };
  }

  const aiSource = matchDomain(externalDomain, AI_DOMAINS);
  if (aiSource) {
    return {
      first_touch_source: aiSource,
      first_touch_medium: "ai_assistant",
      first_touch_referring_domain: externalDomain,
      first_touch_landing_path: landingPath,
      first_touch_campaign: "",
    };
  }

  const socialSource = matchDomain(externalDomain, SOCIAL_DOMAINS);
  if (socialSource) {
    return {
      first_touch_source: socialSource,
      first_touch_medium: "social",
      first_touch_referring_domain: externalDomain,
      first_touch_landing_path: landingPath,
      first_touch_campaign: "",
    };
  }

  if (EMAIL_DOMAINS.some((pattern) => pattern.test(externalDomain))) {
    return {
      first_touch_source: "email",
      first_touch_medium: "email",
      first_touch_referring_domain: externalDomain,
      first_touch_landing_path: landingPath,
      first_touch_campaign: "",
    };
  }

  if (externalDomain && !AUTH_AND_PAYMENT_DOMAINS.some((pattern) => pattern.test(externalDomain))) {
    return {
      first_touch_source: externalDomain,
      first_touch_medium: "referral",
      first_touch_referring_domain: externalDomain,
      first_touch_landing_path: landingPath,
      first_touch_campaign: "",
    };
  }

  const returningUnknown = RETURNING_ENTRY_PATHS.some((pattern) => pattern.test(landingPath));
  return {
    first_touch_source: returningUnknown ? "returning_unknown" : "direct",
    first_touch_medium: returningUnknown ? "internal_return" : "direct",
    first_touch_referring_domain: "",
    first_touch_landing_path: landingPath,
    first_touch_campaign: "",
  };
}

function isAttribution(value: unknown): value is AcquisitionAttribution {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return [
    "first_touch_source",
    "first_touch_medium",
    "first_touch_referring_domain",
    "first_touch_landing_path",
    "first_touch_campaign",
  ].every((key) => typeof record[key] === "string");
}

export function parseAcquisitionAttribution(value: string | undefined): AcquisitionAttribution | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!isAttribution(parsed)) return null;
    return {
      first_touch_source: normalizeLabel(parsed.first_touch_source, "unknown"),
      first_touch_medium: normalizeLabel(parsed.first_touch_medium, "unknown"),
      first_touch_referring_domain: normalizeLabel(parsed.first_touch_referring_domain),
      first_touch_landing_path: sanitizeAnalyticsPathname(parsed.first_touch_landing_path),
      first_touch_campaign: normalizeLabel(parsed.first_touch_campaign),
    };
  } catch {
    return null;
  }
}

export function getAcquisitionAttribution(): AcquisitionAttribution | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (cookieValue("analytics_consent") === "denied") return null;

  const existing = cookieValue(ANALYTICS_ATTRIBUTION_COOKIE);
  const parsedExisting = parseAcquisitionAttribution(existing);
  if (parsedExisting) return parsedExisting;

  const attribution = classifyAcquisition({
    url: window.location.href,
    referrer: document.referrer,
    hostname: window.location.hostname,
  });
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANALYTICS_ATTRIBUTION_COOKIE}=${encodeURIComponent(
    JSON.stringify(attribution)
  )}; Max-Age=${90 * 24 * 60 * 60}; path=/; SameSite=Lax${secure}`;
  return attribution;
}

export function getAcquisitionProperties() {
  const attribution = getAcquisitionAttribution();
  if (!attribution) return {};
  return {
    ...attribution,
    traffic_source: attribution.first_touch_source,
    traffic_medium: attribution.first_touch_medium,
    landing_path: attribution.first_touch_landing_path,
  };
}
