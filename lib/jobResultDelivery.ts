import { requestLocale } from "./i18n/request";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "./prisma";
import { buildUniqueTabJobLabel, deriveTabJobBaseLabel } from "./tabJobNames";
import { normalizePositiveDurationSec } from "./transcriptionDuration";
import { sendTranscriptionCompleteEmailOnce } from "./transcriptionCompleteEmail";
import { getServerTranscriptionAnalytics } from "./transcriptionAnalytics";
import { attachFunctionTiming } from "./functionTiming";
import {
  parseStoredTabPayload,
  normalizeTranscriberTracks,
  serializeStoredTabPayload,
  type StoredArtifactReference,
  type StoredReviewState,
} from "./storedTabs";

export const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
export const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
export const FINAL_JOB_STATUSES = new Set(["done", "completed", "succeeded", "success"]);
export const FAILED_JOB_STATUSES = new Set(["failed", "error", "cancelled", "canceled"]);
export const MAX_JOB_RESPONSE_BYTES = 3_500_000;
export const MAX_UPSTREAM_TEXT_BYTES = 2000;
export const LARGE_JOB_FIELDS = [
  "tabs",
  "tab_text",
  "tabText",
  "transcriberSegments",
  "transcriberTracks",
  "segmentGroups",
  "segments",
  "noteEventGroups",
  "note_events",
  "noteEvents",
];
export const acknowledgedDurableResults = new Set<string>();

export function getJobSources(job: unknown) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return [] as Record<string, unknown>[];
  const direct = job as Record<string, unknown>;
  const output =
    direct.output && typeof direct.output === "object" && !Array.isArray(direct.output)
      ? (direct.output as Record<string, unknown>)
      : undefined;
  const result =
    direct.result && typeof direct.result === "object" && !Array.isArray(direct.result)
      ? (direct.result as Record<string, unknown>)
      : undefined;
  return [direct, output, result, output?.result as Record<string, unknown> | undefined, result?.output as Record<string, unknown> | undefined].filter(
    (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );
}

export function getFirstJobValue(job: unknown, keys: string[]) {
  for (const source of getJobSources(job)) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }
  return null;
}

export function stripLargeJobFields(job: Record<string, unknown>) {
  for (const source of getJobSources(job)) {
    for (const key of LARGE_JOB_FIELDS) {
      if (key in source) {
        delete source[key];
      }
    }
  }
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function getStringValue(job: Record<string, unknown>, keys: string[]) {
  const value = getFirstJobValue(job, keys);
  return typeof value === "string" && value.trim() ? value : null;
}

export function getFiniteNumberValue(job: Record<string, unknown>, keys: string[]) {
  const value = Number(getFirstJobValue(job, keys));
  return Number.isFinite(value) ? value : null;
}

export function getObjectValue(job: Record<string, unknown>, keys: string[]) {
  const value = getFirstJobValue(job, keys);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeStems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const url = typeof record.url === "string" ? record.url.trim() : "";
      if (!name || !url) return null;
      return { name, url };
    })
    .filter((entry): entry is { name: string; url: string } => Boolean(entry));
}

export function trimPayloadToBudget(payload: Record<string, unknown>, maxBytes = MAX_JOB_RESPONSE_BYTES) {
  const safePayload = { ...payload };
  const byteLength = () => Buffer.byteLength(JSON.stringify(safePayload), "utf-8");
  if (byteLength() <= maxBytes) return safePayload;

  const removableFields = [
    "transcriberSegments",
    "transcriberTracks",
    "noteEventGroups",
    "segmentGroups",
    "segments",
    "tabs",
    "tab_text",
    "tabText",
    "steps",
    "stems",
    "review",
    "currentStepDetail",
  ] as const;
  for (const key of removableFields) {
    if (!(key in safePayload)) continue;
    delete safePayload[key];
    if (byteLength() <= maxBytes) return safePayload;
  }

  return safePayload;
}

export function normalizeTabs(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((segment) =>
      Array.isArray(segment)
        ? segment.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
        : []
    )
    .filter((segment) => segment.length > 0);
}

export function normalizeTranscriberSegment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if ("start_time_s" in record || "end_time_s" in record || "pitch_midi" in record) {
    const startTime = Number(record.start_time_s);
    const endTime = Number(record.end_time_s);
    const pitchMidi = Number(record.pitch_midi);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || !Number.isFinite(pitchMidi)) return null;
    const rawPitchBend = Array.isArray(record.pitch_bend)
      ? record.pitch_bend
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry))
          .map((entry) => Math.round(entry))
      : null;
    const amplitude =
      record.amplitude === null || record.amplitude === undefined
        ? null
        : Number.isFinite(Number(record.amplitude))
        ? Number(record.amplitude)
        : null;
    return {
      start_time_s: Math.max(0, Number(startTime)),
      end_time_s: Math.max(Number(startTime), Number(endTime)),
      pitch_midi: Math.round(Number(pitchMidi)),
      amplitude,
      pitch_bend: rawPitchBend,
    };
  }
  const midiNumLine = Array.isArray(record.MidiNumLine)
    ? record.MidiNumLine
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.round(entry))
    : [];
  const midiNum =
    record.midiNum === null || record.midiNum === undefined
      ? null
      : Number.isFinite(Number(record.midiNum))
      ? Math.round(Number(record.midiNum))
      : null;
  const lineStart = Number(record.lineStart);
  const lineEnd = Number(record.lineEnd);
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return null;
  if (midiNumLine.length === 0 && midiNum === null) return null;
  return {
    lineStart: Math.max(0, Math.round(lineStart)),
    lineEnd: Math.max(Math.round(lineStart), Math.round(lineEnd)),
    midiNum,
    MidiNumLine: midiNumLine.length > 0 ? midiNumLine : midiNum !== null ? [midiNum] : [],
  };
}

type NormalizedTranscriberSegment = NonNullable<ReturnType<typeof normalizeTranscriberSegment>>;

export function normalizeTranscriberSegments(value: unknown) {
  if (!Array.isArray(value)) return [];
  const directGroup = value
    .map((segment) => normalizeTranscriberSegment(segment))
    .filter((segment): segment is NormalizedTranscriberSegment => Boolean(segment));
  if (directGroup.length > 0) return [directGroup];
  return value
    .map((group) => {
      if (!Array.isArray(group)) return [];
      return group
        .map((segment) => normalizeTranscriberSegment(segment))
        .filter((segment): segment is NormalizedTranscriberSegment => Boolean(segment));
    })
    .filter((group) => group.length > 0);
}

export function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function shouldLogTransferMetrics() {
  return process.env.NOTE2TABS_TRANSFER_LOGS === "true";
}

export function logJobTransferMetric(metric: {
  upstreamStatus: number;
  upstreamBytes: number;
  responseBytes: number;
  durationMs: number;
  fetchedFullOutput: boolean;
  persistedTab: boolean;
}) {
  if (!shouldLogTransferMetrics()) return;
  console.info("note2tabs.transfer.job_status", {
    route: "/api/jobs/[job_id]",
    upstreamStatus: metric.upstreamStatus,
    upstreamBytes: metric.upstreamBytes,
    responseBytes: metric.responseBytes,
    durationMs: metric.durationMs,
    fetchedFullOutput: metric.fetchedFullOutput,
    persistedTab: metric.persistedTab,
  });
}

export async function fetchBackendJob(jobId: string, headers: Record<string, string>, includeOutput: boolean) {
  const startedAt = Date.now();
  const baseUrl = `${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}`;
  const url = includeOutput ? appendQueryParam(baseUrl, "include_output", "true") : baseUrl;
  const requestHeaders = { ...headers };
  if (includeOutput) delete requestHeaders["If-None-Match"];
  const upstream = await fetch(url, { headers: requestHeaders });
  const text = await upstream.text();
  return {
    upstream,
    text,
    contentType: upstream.headers.get("content-type"),
    bytes: Buffer.byteLength(text, "utf-8"),
    durationMs: Date.now() - startedAt,
  };
}

export function forwardPollingHeaders(res: NextApiResponse, upstream: Response) {
  const etag = upstream.headers.get("etag");
  const retryAfter = upstream.headers.get("retry-after");
  if (etag) res.setHeader("ETag", etag);
  if (retryAfter) res.setHeader("Retry-After", retryAfter);
  res.setHeader("Vary", "Cookie");
}

export function setJobCacheHeaders(res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

export function addPreviewUrl(payload: Record<string, unknown>, jobId: string) {
  const artifacts = getObjectValue(payload, ["artifacts"]);
  const existingPreviewUrl = getStringValue(payload, ["audio_preview_url", "audioPreviewUrl"]);
  if (!existingPreviewUrl && artifacts && artifacts.previewAudio) {
    const previewUrl = `/api/jobs/${encodeURIComponent(jobId)}/artifacts/preview_audio`;
    const previewVersion = getPreviewVersionToken(payload);
    payload.audio_preview_url = previewVersion ? appendQueryParam(previewUrl, "v", previewVersion) : previewUrl;
  }
}

export function getPreviewVersionToken(payload: Record<string, unknown>) {
  const updatedAtValue = getFirstJobValue(payload, ["updatedAt", "updated_at", "finishedAt", "finished_at"]);
  const updatedAt = typeof updatedAtValue === "string" ? updatedAtValue.trim() : "";
  const reviewValue = getFirstJobValue(payload, ["review"]);
  const review =
    reviewValue && typeof reviewValue === "object" && !Array.isArray(reviewValue)
      ? (reviewValue as Record<string, unknown>)
      : null;
  const noteEventCount = review && Number.isFinite(Number(review.noteEventCount)) ? String(Number(review.noteEventCount)) : "";
  return [updatedAt, noteEventCount].filter(Boolean).join(":");
}

export function normalizeArtifactReference(value: unknown): StoredArtifactReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const normalized: StoredArtifactReference = {
    storage: typeof record.storage === "string" && record.storage.trim() ? record.storage : null,
    localPath: typeof record.localPath === "string" && record.localPath.trim() ? record.localPath : null,
    objectKey: typeof record.objectKey === "string" && record.objectKey.trim() ? record.objectKey : null,
    gcsKey: typeof record.gcsKey === "string" && record.gcsKey.trim() ? record.gcsKey : null,
    s3Key: typeof record.s3Key === "string" && record.s3Key.trim() ? record.s3Key : null,
    fileName: typeof record.fileName === "string" && record.fileName.trim() ? record.fileName : null,
    contentType: typeof record.contentType === "string" && record.contentType.trim() ? record.contentType : null,
  };
  if (Object.values(normalized).every((entry) => entry === null || entry === undefined || entry === "")) {
    return null;
  }
  return normalized;
}

export function extractStoredReviewState(payload: Record<string, unknown>): StoredReviewState | null {
  const reviewValue = getFirstJobValue(payload, ["review"]);
  const review =
    reviewValue && typeof reviewValue === "object" && !Array.isArray(reviewValue)
      ? (reviewValue as Record<string, unknown>)
      : null;
  const artifactsValue = getFirstJobValue(payload, ["artifacts"]);
  const artifacts =
    artifactsValue && typeof artifactsValue === "object" && !Array.isArray(artifactsValue)
      ? (artifactsValue as Record<string, unknown>)
      : null;
  const paramsValue =
    review && review.params && typeof review.params === "object" && !Array.isArray(review.params)
      ? (review.params as Record<string, unknown>)
      : null;

  const onsetThresh = Number(paramsValue?.onsetThresh);
  const frameThresh = Number(paramsValue?.frameThresh);
  const minNoteLen = Number(paramsValue?.minNoteLen);
  const minFreq = Number(paramsValue?.minFreq);
  const maxFreq = Number(paramsValue?.maxFreq);
  const noteEventCount = Number(review?.noteEventCount);

  const params =
    Number.isFinite(onsetThresh) ||
    Number.isFinite(frameThresh) ||
    Number.isFinite(minNoteLen) ||
    Number.isFinite(minFreq) ||
    Number.isFinite(maxFreq)
      ? {
          ...(Number.isFinite(onsetThresh) ? { onsetThresh } : {}),
          ...(Number.isFinite(frameThresh) ? { frameThresh } : {}),
          ...(Number.isFinite(minNoteLen) ? { minNoteLen: Math.round(minNoteLen) } : {}),
          ...(Number.isFinite(minFreq) ? { minFreq } : {}),
          ...(Number.isFinite(maxFreq) ? { maxFreq } : {}),
        }
      : null;

  const normalizedArtifacts = artifacts
    ? {
        prediction: normalizeArtifactReference(artifacts.prediction),
        noteEvents: normalizeArtifactReference(artifacts.noteEvents),
        previewAudio: normalizeArtifactReference(artifacts.previewAudio),
      }
    : null;
  const hasArtifacts = Boolean(
    normalizedArtifacts &&
      (normalizedArtifacts.prediction || normalizedArtifacts.noteEvents || normalizedArtifacts.previewAudio)
  );
  if (!params && !Number.isFinite(noteEventCount) && !hasArtifacts) {
    return null;
  }
  return {
    ...(params ? { params } : {}),
    ...(Number.isFinite(noteEventCount) ? { noteEventCount: Math.max(0, Math.round(noteEventCount)) } : {}),
    ...(hasArtifacts ? { artifacts: normalizedArtifacts } : {}),
  };
}

export function hasPersistableJobResult(payload: Record<string, unknown>) {
  return (
    normalizeTabs(getFirstJobValue(payload, ["tabs"])).length > 0 ||
    normalizeTranscriberSegments(
      getFirstJobValue(payload, ["transcriberSegments", "noteEventGroups", "segmentGroups", "segments"])
    ).length > 0 ||
    normalizeTranscriberTracks(getFirstJobValue(payload, ["transcriberTracks", "instrumentTracks"])).length > 0
  );
}

export const persistedTabJobSelect = {
  id: true,
  userId: true,
  backendJobId: true,
  sourceLabel: true,
  sourceType: true,
  durationSec: true,
  resultJson: true,
} as const;

export function isUniqueConstraintFailure(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
  );
}

export async function findPersistedTabJob(jobId: string, sessionUserId: string) {
  const indexed = await prisma.tabJob.findUnique({
    where: { backendJobId: jobId },
    select: persistedTabJobSelect,
  });
  if (indexed) {
    if (indexed.userId !== sessionUserId) {
      throw new Error("Backend job result ownership conflict");
    }
    return indexed;
  }

  // Compatibility path for rows written before backendJobId became an indexed
  // column. Each successful read upgrades the row so future polling is O(1).
  const legacy = await prisma.tabJob.findFirst({
    where: {
      userId: sessionUserId,
      resultJson: {
        contains: `"backendJobId":"${jobId}"`,
      },
    },
    select: persistedTabJobSelect,
  });
  if (!legacy) return null;

  try {
    await prisma.tabJob.update({
      where: { id: legacy.id },
      data: { backendJobId: jobId },
    });
    return { ...legacy, backendJobId: jobId };
  } catch (error) {
    if (!isUniqueConstraintFailure(error)) throw error;
    const raced = await prisma.tabJob.findUnique({
      where: { backendJobId: jobId },
      select: persistedTabJobSelect,
    });
    if (!raced || raced.userId !== sessionUserId) {
      throw new Error("Backend job result ownership conflict");
    }
    return raced;
  }
}

export async function markBackendJobPersisted(jobId: string, sessionUserId: string, tabJobId: string) {
  const acknowledgementKey = `${jobId}:${sessionUserId}:${tabJobId}`;
  if (acknowledgedDurableResults.has(acknowledgementKey)) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-User-Id": sessionUserId,
    };
    if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
    const response = await fetch(
      `${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}/persisted`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ durableResultId: tabJobId }),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      console.warn("Backend job durability acknowledgement failed", {
        jobId,
        status: response.status,
        detail,
      });
    } else {
      acknowledgedDurableResults.add(acknowledgementKey);
      if (acknowledgedDurableResults.size > 500) acknowledgedDurableResults.delete(acknowledgedDurableResults.values().next().value!);
    }
  } catch (error) {
    // The persisted TabJob remains the source of truth. A later final-status
    // poll retries this idempotent acknowledgement before compaction can occur.
    console.warn("Backend job durability acknowledgement failed", { jobId, error });
  } finally {
    clearTimeout(timeout);
  }
}

export async function persistCompletedJob(jobId: string, sessionUserId: string, payload: Record<string, unknown>) {
  const tabs = normalizeTabs(getFirstJobValue(payload, ["tabs"]));
  const transcriberSegments = normalizeTranscriberSegments(
    getFirstJobValue(payload, ["transcriberSegments", "noteEventGroups", "segmentGroups", "segments"])
  );
  const transcriberTracks = normalizeTranscriberTracks(
    getFirstJobValue(payload, ["transcriberTracks", "instrumentTracks"])
  );
  if (tabs.length === 0 && transcriberSegments.length === 0 && transcriberTracks.length === 0) {
    const existing = await findPersistedTabJob(jobId, sessionUserId);
    return existing?.id ?? null;
  }

  const existing = await findPersistedTabJob(jobId, sessionUserId);
  const explicitLabel =
    typeof getFirstJobValue(payload, ["sourceLabel", "source_label", "fileName", "filename", "title"]) === "string"
      ? (getFirstJobValue(payload, ["sourceLabel", "source_label", "fileName", "filename", "title"]) as string)
      : "";
  const songTitle =
    typeof getFirstJobValue(payload, ["song_title", "songTitle"]) === "string"
      ? (getFirstJobValue(payload, ["song_title", "songTitle"]) as string)
      : "";
  const artist =
    typeof getFirstJobValue(payload, ["artist"]) === "string" ? (getFirstJobValue(payload, ["artist"]) as string) : "";
  const durationValue = getFirstJobValue(payload, ["durationSec", "duration", "duration_sec"]);
  const sourceType =
    typeof getFirstJobValue(payload, ["sourceType", "source_type"]) === "string"
      ? String(getFirstJobValue(payload, ["sourceType", "source_type"]))
      : "TRANSCRIBE";
  const baseSourceLabel = deriveTabJobBaseLabel({
    sourceType,
    explicitLabel,
    songTitle,
    artist,
    jobId,
  });
  const siblingLabels = await prisma.tabJob.findMany({
    where: {
      userId: sessionUserId,
      ...(existing ? { NOT: { id: existing.id } } : {}),
    },
    select: { sourceLabel: true },
  });
  const sourceLabel = buildUniqueTabJobLabel(
    baseSourceLabel,
    siblingLabels.map((item) => item.sourceLabel || "").filter(Boolean),
    existing?.sourceLabel || null
  );
  const review = extractStoredReviewState(payload);
  const multipleGuitarsValue = getFirstJobValue(payload, ["multipleGuitars", "multiple_guitars"]);
  const multipleGuitars =
    typeof multipleGuitarsValue === "boolean"
      ? multipleGuitarsValue
      : typeof multipleGuitarsValue === "number"
      ? multipleGuitarsValue !== 0
      : typeof multipleGuitarsValue === "string"
      ? ["1", "true", "yes", "on"].includes(multipleGuitarsValue.trim().toLowerCase())
        ? true
        : ["0", "false", "no", "off"].includes(multipleGuitarsValue.trim().toLowerCase())
        ? false
        : null
      : null;
  const normalizedDuration = normalizePositiveDurationSec(durationValue);
  const serializedPayload = serializeStoredTabPayload({
    tabs,
    transcriberSegments,
    transcriberTracks,
    backendJobId: jobId,
    ...(multipleGuitars !== null ? { multipleGuitars } : {}),
    review,
  });
  if (existing) {
    const parsedExisting = parseStoredTabPayload(existing.resultJson);
    const needsUpdate =
      existing.sourceLabel !== sourceLabel ||
      existing.sourceType !== sourceType ||
      (normalizedDuration !== null && existing.durationSec !== normalizedDuration) ||
      existing.resultJson !== serializedPayload ||
      parsedExisting.backendJobId !== jobId;
    if (needsUpdate) {
      await prisma.tabJob.update({
        where: { id: existing.id },
        data: {
          backendJobId: jobId,
          sourceType,
          sourceLabel,
          ...(normalizedDuration !== null ? { durationSec: normalizedDuration } : {}),
          resultJson: serializedPayload,
        },
      });
    }
    return existing.id;
  }

  const created = await prisma.tabJob.upsert({
    where: { backendJobId: jobId },
    create: {
      userId: sessionUserId,
      backendJobId: jobId,
      sourceType,
      sourceLabel,
      durationSec: normalizedDuration,
      resultJson: serializedPayload,
    },
    // A concurrent final poll may have created the row after our lookup. Do
    // not overwrite it until ownership has been checked below.
    update: {},
    select: { id: true, userId: true },
  });
  if (created.userId !== sessionUserId) {
    throw new Error("Backend job result ownership conflict");
  }
  return created.id;
}

