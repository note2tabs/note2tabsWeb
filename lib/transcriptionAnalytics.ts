import type { NextApiRequest } from "next";
import { prisma } from "./prisma";
import { isPostHogConfigured } from "./posthogServer";
import { ingestAnalyticsEvents } from "./analyticsV2/ingest";
import { ANALYTICS_ANON_COOKIE, ANALYTICS_SESSION_COOKIE, getConsentFromCookies, parseRequestCookies } from "./analyticsV2/cookies";
import { getTranscriptionModelAnalyticsProperties, type TranscriptionModelChoice } from "./transcriptionModels";
import { getTranscriptionStartedModelEvent } from "./analytics";
import { ANALYTICS_ATTRIBUTION_COOKIE, parseAcquisitionAttribution } from "./acquisitionAttribution";

type JobAnalytics = {
  version: 1;
  properties: Record<string, unknown>;
  startDelivered?: boolean;
  terminalDelivered?: boolean;
  geo?: { countryCode?: string; continentCode?: string };
  sessionId?: string;
  anonId?: string;
};
export type AnalyticsJob = {
  id: string; userId: string; status: string;
  createdAt: Date; startedAt: Date | null; finishedAt: Date | null;
  analytics: JobAnalytics;
};

// Root job metadata is a durable outbox. JSONB updates preserve worker input.
// No audio, filename, source URL, raw error, or model output enters analytics.
export async function registerTranscriptionAnalytics(input: {
  req: NextApiRequest; jobId: string; userId: string;
  model: TranscriptionModelChoice; workerPool?: string;
  durationSec: number; mode: string; plan: string; accessType: string;
  preview: boolean; creditsUsed: number;
}) {
  if (process.env.NODE_ENV !== "production" || !isPostHogConfigured()) return false;
  // Only production runs the scheduled outbox. Preview keeps browser tracking.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return false;
  const cookies = parseRequestCookies(input.req);
  if (getConsentFromCookies(cookies) !== "granted") return false;
  const attribution = parseAcquisitionAttribution(cookies[ANALYTICS_ATTRIBUTION_COOKIE]);
  const country = input.req.headers["x-vercel-ip-country"];
  const continent = input.req.headers["x-vercel-ip-continent"];
  const validCode = (value: unknown) => typeof value === "string" && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : undefined;
  const routes = await prisma.$queryRaw<Array<{ pool: string | null; prepareType: string | null }>>`
    SELECT root.output->>'workerPool' AS pool, prepare.type AS "prepareType"
    FROM jobs AS root LEFT JOIN jobs AS prepare ON prepare.id = root.output->>'prepareJobId'
    WHERE root.id = ${input.jobId} AND root."userId" = ${input.userId}
  `;
  const route = routes[0];
  const smallPool = route?.prepareType === "transcription_prepare_msmodel_small_subscribed" ? "msmodel_small_subscribed"
    : route?.prepareType === "transcription_prepare_msmodel_small" ? "msmodel_small" : undefined;
  const workerPool = route?.pool || smallPool || input.workerPool;
  const analytics: JobAnalytics = {
    version: 1,
    startDelivered: false,
    terminalDelivered: false,
    sessionId: cookies[ANALYTICS_SESSION_COOKIE],
    anonId: cookies[ANALYTICS_ANON_COOKIE],
    ...(process.env.VERCEL ? { geo: { countryCode: validCode(country), continentCode: validCode(continent) } } : {}),
    properties: {
      ...(attribution || {}),
      ...(attribution ? { traffic_source: attribution.first_touch_source, traffic_medium: attribution.first_touch_medium } : {}),
      ...getTranscriptionModelAnalyticsProperties(input.model),
      job_id: input.jobId, jobId: input.jobId,
      transcription_worker_pool: workerPool,
      duration_sec: input.durationSec, durationSec: input.durationSec,
      mode: input.mode.toLowerCase(), subscription_plan: input.plan.toLowerCase(),
      input_source: input.mode.toLowerCase() === "file" ? "local_file" : "youtube",
      access_type: input.accessType, heavy_preview: input.preview,
      credits_used: input.creditsUsed, acceptance_status: "accepted",
      transcription_tracking_source: "server_job_outbox",
    },
  };
  const updated = await prisma.$executeRaw`
    UPDATE jobs SET input = jsonb_set(input, '{transcriptionAnalytics}', ${JSON.stringify(analytics)}::jsonb)
    WHERE id = ${input.jobId} AND "userId" = ${input.userId}
      AND NOT (input ? 'transcriptionAnalytics')
  `;
  return updated > 0;
}

export async function getServerTranscriptionAnalytics(jobId: string, userId: string) {
  const rows = await prisma.$queryRaw<Array<{
    tracked: boolean; workerPool: string | null; accessType: string | null;
    subscriptionPlan: string | null; heavyPreview: boolean | null;
  }>>`
    SELECT input ? 'transcriptionAnalytics' AS tracked,
      input->'transcriptionAnalytics'->'properties'->>'transcription_worker_pool' AS "workerPool",
      input->'transcriptionAnalytics'->'properties'->>'access_type' AS "accessType",
      input->'transcriptionAnalytics'->'properties'->>'subscription_plan' AS "subscriptionPlan",
      (input->'transcriptionAnalytics'->'properties'->>'heavy_preview')::boolean AS "heavyPreview"
    FROM jobs
    WHERE id = ${jobId} AND "userId" = ${userId}
  `;
  return rows[0];
}

export function transcriptionLifecycleEvents(job: AnalyticsJob) {
  const properties = job.analytics.properties;
  const model: TranscriptionModelChoice = properties.transcription_backend_method === "msmodel" ? "super_heavy" : "light";
  const events: Array<{ name: string; ts: string; event_id: string; props: Record<string, unknown> }> = [];
  const add = (name: string, date: Date, extras: Record<string, unknown> = {}) => {
    events.push({ name, ts: date.toISOString(), event_id: `${name}:${job.id}`, props: { ...properties, ...extras } });
  };
  if (!job.analytics.startDelivered) {
    add("transcription_started", job.createdAt);
    add(getTranscriptionStartedModelEvent(model), job.createdAt);
  }
  if (!job.analytics.terminalDelivered && job.finishedAt && ["succeeded", "failed"].includes(job.status)) {
    const elapsed = {
      total_elapsed_sec: Math.max(0, (job.finishedAt.getTime() - job.createdAt.getTime()) / 1000),
      ...(job.startedAt ? { worker_elapsed_sec: Math.max(0, (job.finishedAt.getTime() - job.startedAt.getTime()) / 1000) } : {}),
    };
    if (job.status === "succeeded") {
      add("job_completed", job.finishedAt, elapsed);
      add("transcription_succeeded", job.finishedAt, elapsed);
      if (properties.heavy_preview) add("heavy_preview_completed", job.finishedAt, elapsed);
    } else {
      add("transcription_failed", job.finishedAt, { ...elapsed, failure_stage: "worker", error_code: "worker_failed" });
    }
  }
  return events;
}

export async function deliverTranscriptionAnalytics() {
  if (!isPostHogConfigured()) return { jobs: 0, events: 0 };
  const jobs = await prisma.$queryRaw<AnalyticsJob[]>`
    SELECT id, "userId", status, "createdAt", "startedAt", "finishedAt",
      input->'transcriptionAnalytics' AS analytics FROM jobs
    WHERE input->'transcriptionAnalytics'->>'version' = '1'
      AND (COALESCE(input->'transcriptionAnalytics'->>'startDelivered', 'false') != 'true'
        OR (status IN ('succeeded', 'failed') AND COALESCE(input->'transcriptionAnalytics'->>'terminalDelivered', 'false') != 'true'))
    ORDER BY "createdAt" ASC LIMIT 100
  `;
  let events = 0;
  for (const job of jobs) {
    const batch = transcriptionLifecycleEvents(job);
    if (!batch.length) continue;
    // The UUID, timestamp, event name and owner stay fixed across retries.
    await ingestAnalyticsEvents({
      accountId: job.userId, cookies: {}, source: "transcription_job_outbox",
      geo: job.analytics.geo,
      body: { events: batch.map(event => ({ ...event, session_id: job.analytics.sessionId, anon_id: job.analytics.anonId })) },
    });
    const delivered = {
      ...job.analytics, startDelivered: true,
      terminalDelivered: Boolean(job.finishedAt && ["succeeded", "failed"].includes(job.status)),
    };
    await prisma.$executeRaw`
      UPDATE jobs SET input = jsonb_set(input, '{transcriptionAnalytics}', ${JSON.stringify(delivered)}::jsonb)
      WHERE id = ${job.id} AND "userId" = ${job.userId}
    `;
    events += batch.length;
  }
  return { jobs: jobs.length, events };
}
