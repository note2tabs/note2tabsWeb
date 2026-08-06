import type { NextApiRequest, NextApiResponse } from "next";
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
  const forwardedProto = header(context.req, "x-forwarded-proto") || "https";
  const userAgent = header(context.req, "user-agent");

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

    client.capture({
      distinctId,
      event: event.name === "page_viewed" ? "$pageview" : event.name,
      properties: sanitizeAnalyticsProperties({
        ...event.props,
        $insert_id: event.eventId,
        $current_url: currentUrl,
        $pathname: pathname,
        $referrer: sanitizeAnalyticsReferrer(event.referrer),
        $raw_user_agent: userAgent,
        $session_id: event.sessionId || cookieSessionId,
        anon_id: event.anonId || cookieAnonId,
        schema_version: event.schemaVersion,
        environment,
        app_version:
          event.appVersion || process.env.NEXT_PUBLIC_APP_VERSION,
        source: context.source,
        utm_source: event.utmSource,
        utm_medium: event.utmMedium,
        utm_campaign: event.utmCampaign,
        utm_term: event.utmTerm,
        utm_content: event.utmContent,
        editor_id: event.editorId,
        job_id: event.jobId,
        $process_person_profile: Boolean(context.accountId),
      }),
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
