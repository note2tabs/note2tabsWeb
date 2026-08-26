import type { NextApiRequest, NextApiResponse } from "next";
import { isIP } from "node:net";
import {
  createPostHogServerClient,
  flushPostHogServerClientInBackground,
  isPostHogConfigured,
} from "../posthogServer";
import {
  sanitizeAnalyticsPathname,
  sanitizeAnalyticsProperties,
  sanitizeAnalyticsReferrer,
  sanitizeAnalyticsUrl,
} from "../analyticsPrivacy";
import { referringDomain } from "../acquisitionAttribution";
import {
  ANALYTICS_ANON_COOKIE,
  ANALYTICS_SESSION_COOKIE,
  getConsentFromCookies,
  parseRequestCookies,
} from "./cookies";
import { parseIngestBody, validatePropsSizeOrThrow } from "./schemas";

export type IngestContext = {
  req?: NextApiRequest;
  res?: NextApiResponse;
  accountId?: string | null;
  source?: string;
  body?: unknown;
  cookies?: Record<string, string>;
};

export type IngestResult = {
  ok: boolean;
  reason?: string;
  received: number;
  written: number;
  deduped: number;
  dualWritten: number;
  blocked: number;
};

function resolveBody(input: unknown) {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function header(req: NextApiRequest | undefined, name: string) {
  const value = req?.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function analyticsHost(value: string | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+(?::\d+)?$/.test(normalized)) return "";
  return normalized.replace(/:\d+$/, "").slice(0, 253);
}

const SERVER_CONTROLLED_PROPERTIES = new Set([
  "$current_url",
  "$geoip_continent_code",
  "$geoip_country_code",
  "$host",
  "$insert_id",
  "$ip",
  "$pathname",
  "$process_person_profile",
  "$raw_user_agent",
  "$referrer",
  "$referring_domain",
  "$session_id",
  "analytics_geo_source",
  "analytics_geo_version",
  "analytics_transport",
  "environment",
  "ingest_source",
]);

function clientEventProperties(props: Record<string, unknown>) {
  const sanitized = sanitizeAnalyticsProperties(props);
  for (const key of SERVER_CONTROLLED_PROPERTIES) delete sanitized[key];
  return sanitized;
}

function normalizedIp(value: string | undefined) {
  let candidate = (value || "").split(",", 1)[0].trim();
  const bracketed = candidate.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) candidate = bracketed[1];
  if (candidate.startsWith("::ffff:")) candidate = candidate.slice(7);
  return isIP(candidate) ? candidate : undefined;
}

function isTrustedVercelRequest() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

export function trustedAnalyticsClientIp(req: NextApiRequest | undefined) {
  if (!req || !isTrustedVercelRequest()) return undefined;
  for (const candidate of [
    header(req, "x-vercel-forwarded-for"),
    header(req, "x-forwarded-for"),
    header(req, "x-real-ip"),
  ]) {
    const ip = normalizedIp(candidate);
    if (ip) return ip;
  }
  return undefined;
}

function edgeCode(value: string | undefined) {
  const normalized = (value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

export function isTransientPrismaConnectionError() {
  return false;
}

export async function ingestAnalyticsEvents(
  context: IngestContext
): Promise<IngestResult> {
  const { events } = parseIngestBody(
    resolveBody(context.body ?? context.req?.body)
  );
  const cookies =
    context.cookies || (context.req ? parseRequestCookies(context.req) : {});

  if (getConsentFromCookies(cookies) !== "granted") {
    return {
      ok: true,
      reason: "consent_denied",
      received: events.length,
      written: 0,
      deduped: 0,
      dualWritten: 0,
      blocked: events.length,
    };
  }

  if (!isPostHogConfigured()) {
    return {
      ok: true,
      reason: "posthog_not_configured",
      received: events.length,
      written: 0,
      deduped: 0,
      dualWritten: 0,
      blocked: events.length,
    };
  }

  const client = createPostHogServerClient();
  if (!client) {
    throw new Error("PostHog is not configured.");
  }

  const cookieAnonId = cookies[ANALYTICS_ANON_COOKIE];
  const cookieSessionId = cookies[ANALYTICS_SESSION_COOKIE];
  const environment =
    process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const host = header(context.req, "host");
  const safeHost = analyticsHost(host);
  const forwardedProto = header(context.req, "x-forwarded-proto") || "https";
  const userAgent = header(context.req, "user-agent");
  const clientIp = trustedAnalyticsClientIp(context.req);
  const edgeCountry = isTrustedVercelRequest()
    ? edgeCode(header(context.req, "x-vercel-ip-country"))
    : undefined;
  const edgeContinent = isTrustedVercelRequest()
    ? edgeCode(header(context.req, "x-vercel-ip-continent"))
    : undefined;

  for (const event of events) {
    validatePropsSizeOrThrow(event.props);
    const distinctId =
      context.accountId ||
      event.anonId ||
      cookieAnonId ||
      event.sessionId ||
      cookieSessionId ||
      event.eventId;
    const pathname = event.path
      ? sanitizeAnalyticsPathname(event.path)
      : undefined;
    const safeProto = forwardedProto === "http" ? "http" : "https";
    const currentUrl =
      event.path && host
        ? sanitizeAnalyticsUrl(`${safeProto}://${host}${pathname}`)
        : pathname;
    const safeReferrer = sanitizeAnalyticsReferrer(event.referrer);
    const safeReferringDomain = referringDomain(safeReferrer);

    const properties = sanitizeAnalyticsProperties({
        ...clientEventProperties(event.props),
        $insert_id: event.eventId,
        $current_url: currentUrl,
        ...(safeHost ? { $host: safeHost } : {}),
        $pathname: pathname,
        $referrer: safeReferrer,
        ...(safeReferringDomain
          ? { $referring_domain: safeReferringDomain }
          : {}),
        $raw_user_agent: userAgent,
        $session_id: event.sessionId || cookieSessionId,
        anon_id: event.anonId || cookieAnonId,
        schema_version: event.schemaVersion,
        environment,
        analytics_transport: "server_proxy",
        analytics_geo_version: 2,
        ...(clientIp || edgeCountry
          ? { analytics_geo_source: "vercel_edge" }
          : {}),
        app_version:
          event.appVersion || process.env.NEXT_PUBLIC_APP_VERSION,
        ...(context.source ? { ingest_source: context.source } : {}),
        ...(event.utmSource ? { utm_source: event.utmSource } : {}),
        ...(event.utmMedium ? { utm_medium: event.utmMedium } : {}),
        ...(event.utmCampaign ? { utm_campaign: event.utmCampaign } : {}),
        ...(event.utmTerm ? { utm_term: event.utmTerm } : {}),
        ...(event.utmContent ? { utm_content: event.utmContent } : {}),
        editor_id: event.editorId,
        job_id: event.jobId,
        $process_person_profile: Boolean(context.accountId),
      });
    // These values are platform-authenticated and normalized above. Apply them
    // after the generic sanitizer so ISO codes retain PostHog's uppercase form.
    if (clientIp) properties.$ip = clientIp;
    if (edgeCountry) properties.$geoip_country_code = edgeCountry;
    if (edgeContinent) properties.$geoip_continent_code = edgeContinent;

    client.capture({
      distinctId,
      event: event.name === "page_viewed" ? "$pageview" : event.name,
      timestamp: event.ts,
      properties,
    });
  }
  flushPostHogServerClientInBackground(client);

  return {
    ok: true,
    received: events.length,
    written: events.length,
    deduped: 0,
    dualWritten: 0,
    blocked: 0,
  };
}
