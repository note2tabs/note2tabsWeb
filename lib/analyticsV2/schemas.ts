import { z } from "zod";
import { generateId } from "./cookies";
import { toCanonicalName } from "./canonical";
import { analyticsFlags } from "./flags";

const anyRecordSchema = z.record(z.unknown());

const canonicalSchema = z
  .object({
    event_id: z.string().uuid().optional(),
    eventId: z.string().uuid().optional(),
    schema_version: z.number().int().positive().optional(),
    schemaVersion: z.number().int().positive().optional(),
    name: z.string().min(1),
    ts: z.string().datetime().optional(),
    props: anyRecordSchema.optional(),
    path: z.string().optional(),
    referrer: z.string().optional(),
    referer: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_term: z.string().optional(),
    utm_content: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
    utmTerm: z.string().optional(),
    utmContent: z.string().optional(),
    editor_id: z.string().optional(),
    editorId: z.string().optional(),
    job_id: z.string().optional(),
    jobId: z.string().optional(),
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    anon_id: z.string().optional(),
    anonId: z.string().optional(),
    app_version: z.string().optional(),
    appVersion: z.string().optional(),
    fingerprint_id: z.string().optional(),
    fingerprintId: z.string().optional(),
  })
  .passthrough();

const legacySchema = z
  .object({
    event: z.string().min(1),
    event_id: z.string().uuid().optional(),
    eventId: z.string().uuid().optional(),
    path: z.string().optional(),
    referer: z.string().optional(),
    referrer: z.string().optional(),
    payload: anyRecordSchema.optional(),
    ts: z.string().datetime().optional(),
    fingerprintId: z.string().optional(),
    sessionId: z.string().optional(),
    session_id: z.string().optional(),
    anonId: z.string().optional(),
    anon_id: z.string().optional(),
    appVersion: z.string().optional(),
    app_version: z.string().optional(),
  })
  .passthrough();

const bodySchema = z
  .union([
    z.object({ events: z.array(z.unknown()).min(1) }),
    canonicalSchema,
    legacySchema,
  ])
  .refine((value) => Boolean(value), "Body is required");

export type NormalizedIngestEvent = {
  eventId: string;
  schemaVersion: number;
  name: string;
  legacyEventName?: string;
  ts: Date;
  props: Record<string, unknown>;
  path?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  editorId?: string;
  jobId?: string;
  sessionId?: string;
  anonId?: string;
  appVersion?: string;
  rawFingerprint?: string;
  rawOriginal: Record<string, unknown>;
};

const MAX_EVENTS_PER_REQUEST = 50;

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function parseDate(ts: string | undefined): Date {
  if (!ts) return new Date();
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function parseCanonicalEvent(input: unknown): NormalizedIngestEvent {
  const parsed = canonicalSchema.parse(input);
  const rawProps = parsed.props || {};
  const props: Record<string, unknown> = {
    ...rawProps,
  };

  if (parsed.editor_id || parsed.editorId) {
    props.editorId = parsed.editor_id || parsed.editorId;
  }
  if (parsed.job_id || parsed.jobId) {
    props.jobId = parsed.job_id || parsed.jobId;
  }

  return {
    eventId: parsed.event_id || parsed.eventId || generateId(),
    schemaVersion: parsed.schema_version || parsed.schemaVersion || 2,
    name: parsed.name,
    ts: parseDate(parsed.ts),
    props,
    path: parsed.path,
    referrer: parsed.referrer || parsed.referer,
    utmSource: parsed.utm_source || parsed.utmSource,
    utmMedium: parsed.utm_medium || parsed.utmMedium,
    utmCampaign: parsed.utm_campaign || parsed.utmCampaign,
    utmTerm: parsed.utm_term || parsed.utmTerm,
    utmContent: parsed.utm_content || parsed.utmContent,
    editorId: parsed.editor_id || parsed.editorId,
    jobId: parsed.job_id || parsed.jobId,
    sessionId: parsed.session_id || parsed.sessionId,
    anonId: parsed.anon_id || parsed.anonId,
    appVersion: parsed.app_version || parsed.appVersion,
    rawFingerprint: parsed.fingerprint_id || parsed.fingerprintId,
    rawOriginal: toRecord(input),
  };
}

function parseLegacyEvent(input: unknown): NormalizedIngestEvent {
  const parsed = legacySchema.parse(input);
  const canonical = toCanonicalName(parsed.event);
  const payload = parsed.payload || {};
  const payloadSessionId =
    typeof payload.sessionId === "string"
      ? payload.sessionId
      : typeof payload.session_id === "string"
      ? payload.session_id
      : undefined;
  const payloadAnonId =
    typeof payload.anonId === "string"
      ? payload.anonId
      : typeof payload.anon_id === "string"
      ? payload.anon_id
      : undefined;
  return {
    eventId: parsed.event_id || parsed.eventId || generateId(),
    schemaVersion: 1,
    name: canonical.name,
    legacyEventName: canonical.legacyEventName,
    ts: parseDate(parsed.ts),
    props: payload,
    path: parsed.path,
    referrer: parsed.referrer || parsed.referer,
    sessionId: parsed.sessionId || parsed.session_id || payloadSessionId,
    anonId: parsed.anonId || parsed.anon_id || payloadAnonId,
    appVersion: parsed.appVersion || parsed.app_version,
    rawFingerprint: parsed.fingerprintId,
    rawOriginal: toRecord(input),
  };
}

export type ParsedIngestBody = {
  events: NormalizedIngestEvent[];
};

export function parseIngestBody(body: unknown): ParsedIngestBody {
  const parsed = bodySchema.parse(body) as { events?: unknown[] };
  const rawEvents: unknown[] = Array.isArray(parsed.events) ? parsed.events : [parsed];
  if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
    throw new Error(`Too many events. Maximum ${MAX_EVENTS_PER_REQUEST}.`);
  }

  const events = rawEvents.map((raw: unknown) => {
    const asRecord = toRecord(raw);
    if (typeof asRecord.event === "string") {
      return parseLegacyEvent(raw);
    }
    return parseCanonicalEvent(raw);
  });

  return { events };
}

export function validatePropsSizeOrThrow(props: Record<string, unknown>) {
  const serialized = JSON.stringify(props || {});
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > analyticsFlags.propsMaxBytes) {
    throw new Error(`Event props too large (${bytes} bytes). Max ${analyticsFlags.propsMaxBytes}.`);
  }
}
