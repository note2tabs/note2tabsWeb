import { requestLocale } from "../../../lib/i18n/request";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { buildUniqueTabJobLabel, deriveTabJobBaseLabel } from "../../../lib/tabJobNames";
import { normalizePositiveDurationSec } from "../../../lib/transcriptionDuration";
import { sendTranscriptionCompleteEmailOnce } from "../../../lib/transcriptionCompleteEmail";
import { getServerTranscriptionAnalytics } from "../../../lib/transcriptionAnalytics";
import { attachFunctionTiming } from "../../../lib/functionTiming";
import {
  parseStoredTabPayload,
  normalizeTranscriberTracks,
  serializeStoredTabPayload,
  type StoredArtifactReference,
  type StoredReviewState,
} from "../../../lib/storedTabs";

import { API_BASE, BACKEND_SECRET, FINAL_JOB_STATUSES, FAILED_JOB_STATUSES, MAX_JOB_RESPONSE_BYTES, MAX_UPSTREAM_TEXT_BYTES, LARGE_JOB_FIELDS, acknowledgedDurableResults, getJobSources, getFirstJobValue, stripLargeJobFields, isFiniteNumber, getStringValue, getFiniteNumberValue, getObjectValue, normalizeStems, trimPayloadToBudget, normalizeTabs, normalizeTranscriberSegment, normalizeTranscriberSegments, appendQueryParam, shouldLogTransferMetrics, logJobTransferMetric, fetchBackendJob, forwardPollingHeaders, setJobCacheHeaders, addPreviewUrl, getPreviewVersionToken, normalizeArtifactReference, extractStoredReviewState, hasPersistableJobResult, persistedTabJobSelect, isUniqueConstraintFailure, findPersistedTabJob, markBackendJobPersisted, persistCompletedJob } from "../../../lib/jobResultDelivery";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let upstreamBytes = 0;
  attachFunctionTiming(res, "/api/jobs/[job_id]", () => ({ upstreamBytes }));
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }

  const jobId = Array.isArray(req.query.job_id) ? req.query.job_id[0] : req.query.job_id;
  if (!jobId) {
    return res.status(400).json({ error: "Missing job id" });
  }
  const includeOutputRaw = Array.isArray(req.query.include_output)
    ? req.query.include_output[0]
    : req.query.include_output;
  const clientRequestedFullOutput = includeOutputRaw === "true" || includeOutputRaw === "1";

  const headers: Record<string, string> = {};
  if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
  headers["X-User-Id"] = session.user.id;
  const ifNoneMatchRaw = req.headers["if-none-match"];
  const ifNoneMatch = Array.isArray(ifNoneMatchRaw) ? ifNoneMatchRaw[0] : ifNoneMatchRaw;
  if (!clientRequestedFullOutput && ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;

  const requestStartedAt = Date.now();
  let fetched;
  try {
    fetched = await fetchBackendJob(jobId, headers, clientRequestedFullOutput);
  } catch {
    return res.status(502).json({ error: "Unable to reach transcription backend." });
  }
  let upstream = fetched.upstream;
  const pollingHeadersSource = fetched.upstream;
  const text = fetched.text;
  const contentType = fetched.contentType;
  upstreamBytes = fetched.bytes;
  let fetchedFullOutput = clientRequestedFullOutput;
  let persistedTab = false;
  if (!text) {
    forwardPollingHeaders(res, pollingHeadersSource);
    setJobCacheHeaders(res);
    res.status(upstream.status);
    return res.end();
  }

  if (contentType?.includes("application/json")) {
    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      addPreviewUrl(payload, jobId);

      let resolvedTabJobId = getStringValue(payload, ["tab_job_id", "tabJobId", "tab_id", "tabId"]);
      const normalizedStatus =
        typeof getFirstJobValue(payload, ["status"]) === "string"
          ? String(getFirstJobValue(payload, ["status"])).toLowerCase()
          : null;
      if (["done", "succeeded", "failed", "error"].includes(normalizedStatus || "")) {
        try {
          const analytics = await getServerTranscriptionAnalytics(jobId, session.user.id);
          payload.analyticsServerTracked = analytics?.tracked === true;
          if (analytics?.workerPool) payload.workerPool = analytics.workerPool;
          if (analytics?.accessType) payload.accessType = analytics.accessType;
          if (analytics?.subscriptionPlan) payload.subscriptionPlan = analytics.subscriptionPlan;
          if (typeof analytics?.heavyPreview === "boolean") payload.heavyPreview = analytics.heavyPreview;
        } catch {
          // Unknown tracking state must not produce a duplicate server outcome.
          payload.analyticsServerTracked = true;
        }
      }
      if (
        session?.user?.id &&
        normalizedStatus &&
        FAILED_JOB_STATUSES.has(normalizedStatus)
      ) {
        try {
          await prisma.user.updateMany({
            where: {
              id: session.user.id,
              heavyPreviewJobId: jobId,
            },
            data: {
              heavyPreviewUsedAt: null,
              heavyPreviewJobId: null,
            },
          });
        } catch (error) {
          // A failed cleanup must not hide the backend's real job status.
          console.warn("Heavy preview restoration failed", { jobId, error });
        }
      }
      if (upstream.ok && session?.user?.id && normalizedStatus && FINAL_JOB_STATUSES.has(normalizedStatus)) {
        let tabJobId = await persistCompletedJob(jobId, session.user.id, payload);
        if (!tabJobId && !hasPersistableJobResult(payload) && !fetchedFullOutput) {
          try {
            const fullFetch = await fetchBackendJob(jobId, headers, true);
            upstreamBytes += fullFetch.bytes;
            fetchedFullOutput = true;
            if (fullFetch.upstream.ok && fullFetch.contentType?.includes("application/json") && fullFetch.text) {
              const fullPayload = JSON.parse(fullFetch.text) as Record<string, unknown>;
              addPreviewUrl(fullPayload, jobId);
              tabJobId = await persistCompletedJob(jobId, session.user.id, fullPayload);
              if (tabJobId) {
                Object.keys(payload).forEach((key) => delete payload[key]);
                Object.assign(payload, fullPayload);
                upstream = fullFetch.upstream;
              }
            }
          } catch (error) {
            console.warn("Job status full-result fetch failed", error);
          }
        }
        if (tabJobId) {
          persistedTab = true;
          const backendDurableResultId = getStringValue(payload, ["durableResultId"]);
          if (backendDurableResultId !== tabJobId) {
            await markBackendJobPersisted(jobId, session.user.id, tabJobId);
          }
          try {
            await sendTranscriptionCompleteEmailOnce({
              userId: session.user.id,
              jobId,
              tabJobId,
              locale: requestLocale(req),
            });
          } catch (error) {
            // Email is helpful but must never turn a completed transcription
            // into a failed job response. A later final-status poll can retry.
            console.error("Transcription completion email delivery failed", {
              userId: session.user.id,
              jobId,
              error,
            });
          }
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
      if (typeof payload.analyticsServerTracked === "boolean") {
        responsePayload.analyticsServerTracked = payload.analyticsServerTracked;
      }
      if (typeof payload.heavyPreview === "boolean") responsePayload.heavyPreview = payload.heavyPreview;
      const stringFieldMap: Array<{ field: string; keys: string[] }> = [
        { field: "type", keys: ["type"] },
        { field: "rawStatus", keys: ["rawStatus", "raw_status"] },
        { field: "createdAt", keys: ["createdAt", "created_at"] },
        { field: "updatedAt", keys: ["updatedAt", "updated_at"] },
        { field: "startedAt", keys: ["startedAt", "started_at"] },
        { field: "finishedAt", keys: ["finishedAt", "finished_at"] },
        { field: "workflowState", keys: ["workflowState", "workflow_state"] },
        { field: "transcriptionMethod", keys: ["transcriptionMethod", "transcription_method"] },
        { field: "workerPool", keys: ["workerPool"] },
        { field: "accessType", keys: ["accessType"] },
        { field: "subscriptionPlan", keys: ["subscriptionPlan"] },
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
      const durationSec = getFiniteNumberValue(payload, ["durationSec", "duration", "duration_sec"]);
      if (durationSec !== null && durationSec > 0) {
        responsePayload.durationSec = Math.max(1, Math.round(durationSec));
      }

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
        const savedTab = session?.user?.id
          ? await prisma.tabJob.findFirst({
              where: { id: resolvedTabJobId, userId: session.user.id },
              select: { resultJson: true, gteEditorId: true },
            })
          : null;
        if (savedTab?.gteEditorId) {
          responsePayload.gte_editor_id = savedTab.gteEditorId;
        }
        const multipleGuitarsValue = getFirstJobValue(payload, ["multipleGuitars", "multiple_guitars"]);
        if (typeof multipleGuitarsValue === "boolean") {
          responsePayload.multipleGuitars = multipleGuitarsValue;
        } else if (savedTab) {
          const parsedSavedTab = parseStoredTabPayload(savedTab.resultJson);
          if (typeof parsedSavedTab.multipleGuitars === "boolean") {
            responsePayload.multipleGuitars = parsedSavedTab.multipleGuitars;
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
        const transcriberTracks = normalizeTranscriberTracks(
          getFirstJobValue(payload, ["transcriberTracks", "instrumentTracks"])
        );
        if (transcriberTracks.length > 0) responsePayload.transcriberTracks = transcriberTracks;
        const multipleGuitarsValue = getFirstJobValue(payload, ["multipleGuitars", "multiple_guitars"]);
        if (typeof multipleGuitarsValue === "boolean") {
          responsePayload.multipleGuitars = multipleGuitarsValue;
        }
      }

      const safeResponsePayload = trimPayloadToBudget(responsePayload);
      res.status(upstream.status);
      res.setHeader("Content-Type", "application/json");
      forwardPollingHeaders(res, pollingHeadersSource);
      setJobCacheHeaders(res);
      logJobTransferMetric({
        upstreamStatus: upstream.status,
        upstreamBytes,
        responseBytes: Buffer.byteLength(JSON.stringify(safeResponsePayload), "utf-8"),
        durationMs: Date.now() - requestStartedAt,
        fetchedFullOutput,
        persistedTab,
      });
      return res.json(safeResponsePayload);
    } catch {
      // Fall through to controlled error response below.
    }
  }

  res.status(upstream.ok ? 502 : upstream.status);
  res.setHeader("Content-Type", "application/json");
  forwardPollingHeaders(res, pollingHeadersSource);
  setJobCacheHeaders(res);
  return res.json({
    error: upstream.ok
      ? "The transcription service returned an incomplete update. Your job is still safe; please try again shortly."
      : upstream.status === 404
        ? "This transcription could not be found. It may have expired or been removed."
        : upstream.status === 401 || upstream.status === 403
          ? "Your session has expired. Please sign in again."
          : upstream.status === 429
            ? "The transcription service is busy. Wait a moment and try again."
            : "We could not load this transcription right now. Please try again shortly.",
  });
}
