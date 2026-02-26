import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../prisma";
import {
  GTE_SESSION_ENDED_EVENT,
  GTE_SESSION_STARTED_EVENT,
  toLegacyName,
} from "./canonical";
import {
  ANALYTICS_ANON_COOKIE,
  ANALYTICS_SESSION_COOKIE,
  ensureTrackingCookies,
  getConsentFromCookies,
  parseRequestCookies,
} from "./cookies";
import { ensureConsentSubject } from "./consent";
import { hashFingerprint } from "./fingerprintHash";
import { analyticsFlags } from "./flags";
import { hashIpAddress } from "./ip";
import { parseIngestBody, type NormalizedIngestEvent, validatePropsSizeOrThrow } from "./schemas";
import { parseUserAgent } from "./ua";
import crypto from "crypto";

/**
 * Analytics v2 rollout phases:
 * Phase 1: deploy schema + ingest endpoint with dual-write enabled.
 * Phase 2: migrate client instrumentation to v2 payloads.
 * Phase 3: switch dashboard/query reads to v2 and validate parity.
 * Phase 4: disable dual-write to legacy AnalyticsEvent.
 * Phase 5: optionally archive/deprecate legacy analytics tables.
 */
export type IngestContext = {
  req?: NextApiRequest;
  res?: NextApiResponse;
  accountId?: string | null;
  prismaClient?: PrismaClient;
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

type IdentityContext = {
  accountId?: string;
  anonId?: string;
  sessionId?: string;
  fingerprintHash?: string;
  consentSubjectId?: bigint;
};

function resolveBody(input: unknown) {
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return {};
    }
  }
  return input;
}

function extractIp(req?: NextApiRequest): string | undefined {
  if (!req) return undefined;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded;
  if (Array.isArray(forwarded) && forwarded.length) return forwarded[0];
  return req.socket.remoteAddress || undefined;
}

function getEnvironment() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function deterministicUuid(input: string) {
  const hash = crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function getGteSessionId(event: NormalizedIngestEvent): string | undefined {
  const props = event.props || {};
  const candidates = [
    event.sessionId,
    typeof props.gteSessionId === "string" ? props.gteSessionId : undefined,
    typeof props.sessionId === "string" ? props.sessionId : undefined,
    typeof props.session_id === "string" ? props.session_id : undefined,
  ].filter((value): value is string => Boolean(value && value.trim()));

  const first = candidates[0];
  if (!first) return undefined;
  return isUuid(first) ? first : deterministicUuid(first);
}

function toDurationMs(event: NormalizedIngestEvent): number | undefined {
  const props = event.props || {};
  const durationMsValue = props.durationMs;
  if (typeof durationMsValue === "number" && Number.isFinite(durationMsValue)) {
    return Math.max(0, Math.min(86400000, Math.round(durationMsValue)));
  }
  const durationSecValue = props.durationSec;
  if (typeof durationSecValue === "number" && Number.isFinite(durationSecValue)) {
    return Math.max(0, Math.min(86400000, Math.round(durationSecValue * 1000)));
  }
  if (typeof durationSecValue === "string") {
    const parsed = Number(durationSecValue);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(86400000, Math.round(parsed * 1000)));
    }
  }
  return undefined;
}

async function updateGteSession(
  prismaClient: PrismaClient,
  event: NormalizedIngestEvent,
  identity: IdentityContext,
  env: string
) {
  const gteSessionId = getGteSessionId(event);
  if (!gteSessionId) return;

  const editorId =
    event.editorId ||
    (typeof event.props.editorId === "string" ? event.props.editorId : undefined) ||
    "unknown";

  if (event.name === GTE_SESSION_STARTED_EVENT) {
    await prismaClient.analyticsGteSession.upsert({
      where: { gteSessionId },
      update: {},
      create: {
        gteSessionId,
        editorId,
        accountId: identity.accountId || null,
        anonId: identity.anonId || null,
        fingerprintHash: identity.fingerprintHash || null,
        startedAt: event.ts,
        env,
        props: event.props as Prisma.InputJsonValue,
      },
    });
    return;
  }

  if (event.name !== GTE_SESSION_ENDED_EVENT) return;

  const durationMs = toDurationMs(event);
  const existing = await prismaClient.analyticsGteSession.findUnique({
    where: { gteSessionId },
    select: {
      gteSessionId: true,
      startedAt: true,
      endedAt: true,
    },
  });

  if (existing && !existing.endedAt) {
    await prismaClient.analyticsGteSession.update({
      where: { gteSessionId },
      data: {
        endedAt: event.ts,
        durationMs: durationMs ?? Math.max(0, event.ts.getTime() - existing.startedAt.getTime()),
        endReason:
          typeof event.props.endReason === "string"
            ? event.props.endReason
            : typeof event.props.reason === "string"
            ? event.props.reason
            : "normal",
      },
    });
    return;
  }

  const inferredDuration = durationMs ?? 0;
  const inferredStart = new Date(event.ts.getTime() - inferredDuration);
  await prismaClient.analyticsGteSession.upsert({
    where: { gteSessionId },
    update: {},
    create: {
      gteSessionId,
      editorId,
      accountId: identity.accountId || null,
      anonId: identity.anonId || null,
      fingerprintHash: identity.fingerprintHash || null,
      startedAt: inferredStart,
      endedAt: event.ts,
      durationMs: inferredDuration,
      inferredStart: true,
      endReason:
        typeof event.props.endReason === "string"
          ? event.props.endReason
          : typeof event.props.reason === "string"
          ? event.props.reason
          : "inferred",
      env,
      props: {
        ...event.props,
        inferredStart: true,
      } as Prisma.InputJsonValue,
    },
  });
}

async function resolveFingerprintHash(
  prismaClient: PrismaClient,
  accountId: string | undefined,
  anonId: string | undefined,
  eventRawFingerprint: string | undefined
) {
  const hashed = hashFingerprint(eventRawFingerprint);
  if (hashed) return hashed;

  if (accountId) {
    const subject = await prismaClient.analyticsConsentSubject.findUnique({
      where: { userId: accountId },
      select: { fingerprintHash: true },
    });
    if (subject?.fingerprintHash) return subject.fingerprintHash;
  }

  if (anonId) {
    const subject = await prismaClient.analyticsConsentSubject.findUnique({
      where: { anonId },
      select: { fingerprintHash: true },
    });
    if (subject?.fingerprintHash) return subject.fingerprintHash;
  }

  return undefined;
}

async function writeLegacyEvent(
  prismaClient: PrismaClient,
  event: NormalizedIngestEvent,
  identity: IdentityContext,
  context: { ipHash?: string; browser: string; os: string; deviceType: string }
) {
  await prismaClient.analyticsEvent.create({
    data: {
      userId: identity.accountId || null,
      sessionId: identity.sessionId || null,
      fingerprint: identity.fingerprintHash || null,
      event: toLegacyName(event.name, event.legacyEventName),
      path: event.path || null,
      referer: event.referrer || null,
      ipHash: context.ipHash || null,
      browser: context.browser,
      os: context.os,
      deviceType: context.deviceType,
      payload: JSON.stringify(event.props || {}),
      createdAt: event.ts,
    },
  });
}

export async function ingestAnalyticsEvents(context: IngestContext): Promise<IngestResult> {
  const prismaClient = context.prismaClient || prisma;
  const parsedBody = resolveBody(context.body ?? context.req?.body);
  const { events } = parseIngestBody(parsedBody);

  const cookieMap = context.cookies || (context.req ? parseRequestCookies(context.req) : {});
  const consent = getConsentFromCookies(cookieMap);
  if (consent === "denied") {
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

  let sessionId = cookieMap[ANALYTICS_SESSION_COOKIE];
  let anonId = cookieMap[ANALYTICS_ANON_COOKIE];
  if (context.res) {
    const ensured = ensureTrackingCookies(context.res, cookieMap);
    sessionId = sessionId || ensured.sessionId;
    anonId = anonId || ensured.anonId;
  }

  const ua = parseUserAgent(context.req?.headers["user-agent"]);
  const ipHash = hashIpAddress(extractIp(context.req));
  const env = getEnvironment();
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || undefined;

  let written = 0;
  let deduped = 0;
  let dualWritten = 0;

  let consentSubject =
    (context.accountId
      ? await prismaClient.analyticsConsentSubject.findUnique({ where: { userId: context.accountId } })
      : null) || (anonId ? await prismaClient.analyticsConsentSubject.findUnique({ where: { anonId } }) : null);

  for (const event of events) {
    validatePropsSizeOrThrow(event.props);

    const fingerprintHash = await resolveFingerprintHash(
      prismaClient,
      context.accountId || undefined,
      event.anonId || anonId,
      event.rawFingerprint
    );

    if (!consentSubject && (context.accountId || anonId)) {
      consentSubject = await ensureConsentSubject({
        prismaClient,
        state: "granted",
        userId: context.accountId || null,
        anonId: event.anonId || anonId || null,
        fingerprintHash: fingerprintHash || null,
      });
    }

    if (
      consentSubject &&
      fingerprintHash &&
      consentSubject.fingerprintHash !== fingerprintHash
    ) {
      consentSubject = await prismaClient.analyticsConsentSubject.update({
        where: { id: consentSubject.id },
        data: { fingerprintHash },
      });
    }

    const identity: IdentityContext = {
      accountId: context.accountId || undefined,
      anonId: event.anonId || anonId,
      sessionId: event.sessionId || sessionId,
      fingerprintHash: fingerprintHash || consentSubject?.fingerprintHash || undefined,
      consentSubjectId: consentSubject?.id,
    };

    try {
      await prismaClient.analyticsEventV2.create({
        data: {
          eventId: event.eventId,
          schemaVersion: event.schemaVersion,
          name: event.name,
          legacyEventName: event.legacyEventName || null,
          ts: event.ts,
          accountId: identity.accountId || null,
          anonId: identity.anonId || null,
          sessionId: identity.sessionId || null,
          fingerprintHash: identity.fingerprintHash || null,
          consentSubjectId: identity.consentSubjectId,
          path: event.path || null,
          referrer: event.referrer || null,
          utmSource: event.utmSource || null,
          utmMedium: event.utmMedium || null,
          utmCampaign: event.utmCampaign || null,
          utmTerm: event.utmTerm || null,
          utmContent: event.utmContent || null,
          ipHash: ipHash || null,
          uaBrowser: ua.browser,
          uaOs: ua.os,
          uaDevice: ua.deviceType,
          props: {
            ...event.props,
            ...(event.editorId ? { editorId: event.editorId } : {}),
            ...(event.jobId ? { jobId: event.jobId } : {}),
            ...(context.source ? { source: context.source } : {}),
          },
          env,
          appVersion: event.appVersion || appVersion || null,
        },
      });
      written += 1;
    } catch (error) {
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
        (typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "P2002")
      ) {
        deduped += 1;
        continue;
      }
      throw error;
    }

    if (analyticsFlags.dualWrite) {
      await writeLegacyEvent(prismaClient, event, identity, {
        ipHash,
        browser: ua.browser,
        os: ua.os,
        deviceType: ua.deviceType,
      });
      dualWritten += 1;
    }

    if (event.name === GTE_SESSION_STARTED_EVENT || event.name === GTE_SESSION_ENDED_EVENT) {
      await updateGteSession(prismaClient, event, identity, env);
    }
  }

  return {
    ok: true,
    received: events.length,
    written,
    deduped,
    dualWritten,
    blocked: 0,
  };
}
