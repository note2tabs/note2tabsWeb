import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { buildUniqueTabJobLabel, deriveTabJobBaseLabel } from "../../../lib/tabJobNames";
import {
  parseStoredTabPayload,
  serializeStoredTabPayload,
  type StoredArtifactReference,
  type StoredReviewState,
} from "../../../lib/storedTabs";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;
const FINAL_JOB_STATUSES = new Set(["done", "completed", "succeeded", "success"]);
const MAX_JOB_RESPONSE_BYTES = 3_500_000;
const MAX_UPSTREAM_TEXT_BYTES = 2000;
const LARGE_JOB_FIELDS = [
  "tabs",
  "tab_text",
  "tabText",
  "transcriberSegments",
  "segmentGroups",
  "segments",
  "noteEventGroups",
  "note_events",
  "noteEvents",
];

function getJobSources(job: unknown) {
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

function getFirstJobValue(job: unknown, keys: string[]) {
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

function stripLargeJobFields(job: Record<string, unknown>) {
  for (const source of getJobSources(job)) {
    for (const key of LARGE_JOB_FIELDS) {
      if (key in source) {
        delete source[key];
      }
    }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getStringValue(job: Record<string, unknown>, keys: string[]) {
  const value = getFirstJobValue(job, keys);
  return typeof value === "string" && value.trim() ? value : null;
}

function getFiniteNumberValue(job: Record<string, unknown>, keys: string[]) {
  const value = Number(getFirstJobValue(job, keys));
  return Number.isFinite(value) ? value : null;
}

function getObjectValue(job: Record<string, unknown>, keys: string[]) {
  const value = getFirstJobValue(job, keys);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeStems(value: unknown) {
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

function trimPayloadToBudget(payload: Record<string, unknown>, maxBytes = MAX_JOB_RESPONSE_BYTES) {
  const safePayload = { ...payload };
  const byteLength = () => Buffer.byteLength(JSON.stringify(safePayload), "utf-8");
  if (byteLength() <= maxBytes) return safePayload;

  const removableFields = [
    "transcriberSegments",
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

function normalizeTabs(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((segment) =>
      Array.isArray(segment)
        ? segment.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
        : []
    )
    .filter((segment) => segment.length > 0);
}

function normalizeTranscriberSegment(value: unknown) {
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

function normalizeTranscriberSegments(value: unknown) {
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

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function getPreviewVersionToken(payload: Record<string, unknown>) {
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

function normalizeArtifactReference(value: unknown): StoredArtifactReference | null {
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

function extractStoredReviewState(payload: Record<string, unknown>): StoredReviewState | null {
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

async function persistCompletedJob(jobId: string, sessionUserId: string, payload: Record<string, unknown>) {
  const existing = await prisma.tabJob.findFirst({
    where: {
      userId: sessionUserId,
      resultJson: {
        contains: `"backendJobId":"${jobId}"`,
      },
    },
    select: { id: true, sourceLabel: true, sourceType: true, durationSec: true, resultJson: true },
  });

  const tabs = normalizeTabs(getFirstJobValue(payload, ["tabs"]));
  const transcriberSegments = normalizeTranscriberSegments(
    getFirstJobValue(payload, ["transcriberSegments", "noteEventGroups", "segmentGroups", "segments"])
  );
  if (tabs.length === 0 && transcriberSegments.length === 0) {
    return existing?.id ?? null;
  }
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
  const durationValue = Number(getFirstJobValue(payload, ["durationSec", "duration", "duration_sec"]));
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
  const normalizedDuration = Number.isFinite(durationValue) ? Math.max(1, Math.round(durationValue)) : null;
  const serializedPayload = serializeStoredTabPayload({
    tabs,
    transcriberSegments,
    backendJobId: jobId,
    ...(multipleGuitars !== null ? { multipleGuitars } : {}),
    review,
  });
  if (existing) {
    const parsedExisting = parseStoredTabPayload(existing.resultJson);
    const needsUpdate =
      existing.sourceLabel !== sourceLabel ||
      existing.sourceType !== sourceType ||
      existing.durationSec !== normalizedDuration ||
      existing.resultJson !== serializedPayload ||
      parsedExisting.backendJobId !== jobId;
    if (needsUpdate) {
      await prisma.tabJob.update({
        where: { id: existing.id },
        data: {
          sourceType,
          sourceLabel,
          durationSec: normalizedDuration,
          resultJson: serializedPayload,
        },
      });
    }
    return existing.id;
  }

  const created = await prisma.tabJob.create({
    data: {
      userId: sessionUserId,
      sourceType,
      sourceLabel,
      durationSec: normalizedDuration,
      resultJson: serializedPayload,
    },
    select: { id: true },
  });

  return created.id;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jobId = Array.isArray(req.query.job_id) ? req.query.job_id[0] : req.query.job_id;
  if (!jobId) {
    return res.status(400).json({ error: "Missing job id" });
  }

  const headers: Record<string, string> = {};
  if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.id) headers["X-User-Id"] = session.user.id;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      headers,
    });
  } catch {
    return res.status(502).json({ error: "Unable to reach transcription backend." });
  }
  const text = await upstream.text();
  const contentType = upstream.headers.get("content-type");
  if (!text) {
    res.status(upstream.status);
    return res.end();
  }

  if (contentType?.includes("application/json")) {
    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      const artifacts = getObjectValue(payload, ["artifacts"]);
      const existingPreviewUrl = getStringValue(payload, ["audio_preview_url", "audioPreviewUrl"]);
      if (!existingPreviewUrl && artifacts && artifacts.previewAudio) {
        const previewUrl = `/api/jobs/${encodeURIComponent(jobId)}/artifacts/preview_audio`;
        const previewVersion = getPreviewVersionToken(payload);
        payload.audio_preview_url = previewVersion ? appendQueryParam(previewUrl, "v", previewVersion) : previewUrl;
      }

      let resolvedTabJobId = getStringValue(payload, ["tab_job_id", "tabJobId", "tab_id", "tabId"]);
      const normalizedStatus =
        typeof getFirstJobValue(payload, ["status"]) === "string"
          ? String(getFirstJobValue(payload, ["status"])).toLowerCase()
          : null;
      if (upstream.ok && session?.user?.id && normalizedStatus && FINAL_JOB_STATUSES.has(normalizedStatus)) {
        const tabJobId = await persistCompletedJob(jobId, session.user.id, payload);
        if (tabJobId) {
          resolvedTabJobId = tabJobId;
          payload.tab_job_id = tabJobId;
          payload.tabJobId = tabJobId;
          stripLargeJobFields(payload);
        }
      }

      const responsePayload: Record<string, unknown> = {
        job_id: getStringValue(payload, ["job_id", "jobId", "id"]) || jobId,
        status: getStringValue(payload, ["status"]) || (upstream.ok ? "processing" : "error"),
      };
      const stringFieldMap: Array<{ field: string; keys: string[] }> = [
        { field: "type", keys: ["type"] },
        { field: "rawStatus", keys: ["rawStatus", "raw_status"] },
        { field: "createdAt", keys: ["createdAt", "created_at"] },
        { field: "updatedAt", keys: ["updatedAt", "updated_at"] },
        { field: "startedAt", keys: ["startedAt", "started_at"] },
        { field: "finishedAt", keys: ["finishedAt", "finished_at"] },
        { field: "workflowState", keys: ["workflowState", "workflow_state"] },
        { field: "currentStepKey", keys: ["currentStepKey", "current_step_key"] },
        { field: "currentStepLabel", keys: ["currentStepLabel", "current_step_label"] },
        { field: "currentStepDetail", keys: ["currentStepDetail", "current_step_detail"] },
        { field: "lastError", keys: ["lastError", "last_error"] },
        { field: "error_message", keys: ["error_message", "errorMessage", "lastError", "last_error"] },
        { field: "song_title", keys: ["song_title", "songTitle", "title"] },
        { field: "artist", keys: ["artist"] },
        { field: "audio_preview_url", keys: ["audio_preview_url", "audioPreviewUrl"] },
        { field: "gte_editor_id", keys: ["gte_editor_id", "gteEditorId"] },
      ];
      for (const { field, keys } of stringFieldMap) {
        const value = getStringValue(payload, keys);
        if (value !== null) {
          responsePayload[field] = value;
        }
      }

      const progress = getFiniteNumberValue(payload, ["progress"]);
      if (progress !== null) responsePayload.progress = progress;
      const attempts = getFiniteNumberValue(payload, ["attempts"]);
      if (attempts !== null) responsePayload.attempts = Math.max(0, Math.round(attempts));

      const steps = getFirstJobValue(payload, ["steps"]);
      if (Array.isArray(steps)) responsePayload.steps = steps;

      const stems = normalizeStems(getFirstJobValue(payload, ["stems"]));
      if (stems.length > 0) responsePayload.stems = stems;

      const review = extractStoredReviewState(payload);
      if (review) {
        const normalizedReview: Record<string, unknown> = {};
        if (review.params) normalizedReview.params = review.params;
        if (isFiniteNumber(review.noteEventCount)) normalizedReview.noteEventCount = review.noteEventCount;
        if (Object.keys(normalizedReview).length > 0) {
          responsePayload.review = normalizedReview;
        }
      }

      if (resolvedTabJobId) {
        responsePayload.tab_job_id = resolvedTabJobId;
        responsePayload.tabJobId = resolvedTabJobId;
        responsePayload.tab_id = resolvedTabJobId;
        responsePayload.tabId = resolvedTabJobId;
        if (session?.user?.id) {
          const savedTab = await prisma.tabJob.findFirst({
            where: { id: resolvedTabJobId, userId: session.user.id },
            select: { resultJson: true },
          });
          if (savedTab) {
            const parsedSavedTab = parseStoredTabPayload(savedTab.resultJson);
            if (typeof parsedSavedTab.multipleGuitars === "boolean") {
              responsePayload.multipleGuitars = parsedSavedTab.multipleGuitars;
            }
          }
        }
      } else {
        const tabs = normalizeTabs(getFirstJobValue(payload, ["tabs"]));
        if (tabs.length > 0) responsePayload.tabs = tabs;
        const tabText = getStringValue(payload, ["tab_text", "tabText"]);
        if (tabText !== null) responsePayload.tab_text = tabText;
        const transcriberSegments = normalizeTranscriberSegments(
          getFirstJobValue(payload, ["transcriberSegments", "noteEventGroups", "segmentGroups", "segments"])
        );
        if (transcriberSegments.length > 0) {
          responsePayload.transcriberSegments = transcriberSegments;
        }
        const multipleGuitarsValue = getFirstJobValue(payload, ["multipleGuitars", "multiple_guitars"]);
        if (typeof multipleGuitarsValue === "boolean") {
          responsePayload.multipleGuitars = multipleGuitarsValue;
        }
      }

      const safeResponsePayload = trimPayloadToBudget(responsePayload);
      res.status(upstream.status);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.json(safeResponsePayload);
    } catch {
      // Fall through to controlled error response below.
    }
  }

  const textSnippet = text.slice(0, MAX_UPSTREAM_TEXT_BYTES);
  res.status(upstream.ok ? 502 : upstream.status);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.json({
    error: upstream.ok
      ? "Invalid response from backend job endpoint."
      : textSnippet || "Job request failed.",
  });
}
