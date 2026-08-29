import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { signIn, useSession } from "next-auth/react";
import JobStatusLayout, {
  type JobResponse,
  type PendingJobPresentation,
} from "../../components/JobStatusLayout";
import { isLocalNoDbClientMode } from "../../lib/clientDevMode";
import { buildLaneEditorRef, gteApi, type TranscriberSegmentGroup, type TranscriberTrack } from "../../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../../lib/gteGuestDraft";
import { saveJobToHistory } from "../../lib/history";
import { ANALYTICS_EVENTS, sendEvent } from "../../lib/analytics";
import { normalizeTabSegments, tabSegmentsToStamps, tabsToTabText } from "../../lib/tabTextToStamps";
import { getAppBaseUrl } from "../../lib/urls";
import NoIndexHead from "../../components/NoIndexHead";
import { EditorLoadingState } from "../../components/EditorLoadingState";
import { categorizeAnalyticsError } from "../../lib/analyticsErrors";
import {
  DEFAULT_JOB_POLL_DELAY_MS,
  requestJobStatus,
} from "../../lib/jobPolling";
import AdvertisementSlot from "../../components/AdvertisementSlot";

const FINALIZE_IMPORT_TIMEOUT_MS = 60_000;
const FINALIZE_IMPORT_POLL_MS = 1200;
const PROCESSING_AD_DELAY_MS = 4_000;
const PENDING_JOB_STATUSES = new Set(["queued", "pending", "processing", "running"]);
const TAB_JOB_ID_KEYS = ["tab_job_id", "tabJobId", "tab_id", "tabId"];

type JobModeHint = "FILE" | "YOUTUBE";
type JobModelHint = "light" | "heavy";
type PendingStageKey = "queue" | "download" | "prepare" | "separate" | "predict" | "note_events" | "format";
type ImportResult = {
  editorId: string;
  importFormat: "segment_groups" | "tab_stamps";
  target: "new" | "existing" | "guest";
  href: string;
};

type StoredTabPayloadResponse = {
  id: string;
  sourceLabel: string;
  createdAt: string;
  tabs: string[][];
  transcriberSegments: TranscriberSegmentGroup[];
  transcriberTracks: TranscriberTrack[];
  backendJobId?: string | null;
};

function getQueryStringValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseBooleanFlag(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function parseBooleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return parseBooleanFlag(value);
  return null;
}

function parseIsoToMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProgressValue(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 1) return clamp(Math.round(num * 100), 0, 100);
  return clamp(Math.round(num), 0, 100);
}

function parsePositiveNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  if (minutes <= 0) return `${remainder}s`;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function formatStageLabel(stageKey: PendingStageKey) {
  if (stageKey === "download") return "Get your clip";
  if (stageKey === "prepare") return "Get audio ready";
  if (stageKey === "separate") return "Focus on guitar";
  if (stageKey === "predict") return "Find the notes";
  if (stageKey === "note_events") return "Build your tab";
  if (stageKey === "format") return "Get preview ready";
  return "In line";
}

function estimatePendingJobDurationSeconds(
  clipDurationSeconds: number | null,
  modeHint: JobModeHint | null,
  separateGuitar: boolean,
  modelHint: JobModelHint | null
) {
  const clipSeconds = clamp(clipDurationSeconds ?? 30, 1, 600);
  const isHeavyModel = modelHint === "heavy";
  const baseSeconds = isHeavyModel ? 32 : 18;
  const modeSeconds = modeHint === "YOUTUBE" ? 16 : 8;
  const separationSeconds = separateGuitar ? 28 : 0;
  const clipSecondsCost = clipSeconds * (isHeavyModel ? 0.72 : 0.46);
  const rawEstimate = baseSeconds + modeSeconds + separationSeconds + clipSecondsCost;

  return clamp(Math.round(rawEstimate), 25, isHeavyModel || separateGuitar ? 210 : 150);
}

function estimateMovingProgress(elapsedSeconds: number, estimatedDurationSeconds: number, isQueued: boolean) {
  if (isQueued) {
    return clamp(5 + (elapsedSeconds / 14) * 7, 5, 12);
  }

  const safeEstimate = Math.max(1, estimatedDurationSeconds);
  const ratio = elapsedSeconds / safeEstimate;
  if (ratio <= 0.32) {
    return clamp(12 + (ratio / 0.32) * 46, 12, 58);
  }
  if (ratio <= 0.72) {
    return clamp(58 + ((ratio - 0.32) / 0.4) * 22, 58, 80);
  }
  if (ratio <= 1) {
    return clamp(80 + ((ratio - 0.72) / 0.28) * 14, 80, 94);
  }

  return clamp(94 + Math.min((ratio - 1) / 4, 1) * 5, 94, 99);
}

function buildPendingPresentation(
  job: JobResponse | null,
  nowMs: number,
  modeHint: JobModeHint | null,
  separateGuitarHint: boolean | null,
  durationHintSeconds: number | null,
  modelHint: JobModelHint | null
): PendingJobPresentation | null {
  const workflowState = getWorkflowState(job);
  const isWorkflowProcessing = workflowState === "processing";
  if (!job || (!PENDING_JOB_STATUSES.has(job.status) && !isWorkflowProcessing)) return null;

  const isQueued = job.status === "queued" || job.status === "pending";
  const exactStages = normalizeBackendStages(getFirstJobValue(job, ["steps"]));
  const isYoutube = modeHint === "YOUTUBE";
  const separateGuitar = separateGuitarHint ?? false;
  const progressValue = normalizeProgressValue(job.progress);
  const createdMs = parseIsoToMs(job.createdAt) ?? nowMs;
  const startedMs = parseIsoToMs(job.startedAt);
  const elapsedSeconds = Math.max(0, Math.round((nowMs - (startedMs ?? createdMs)) / 1000));
  const attempts = Number.isFinite(Number(job.attempts)) ? Math.max(0, Number(job.attempts)) : 0;
  const attemptLabel = attempts > 1 ? "Trying again after a hiccup." : null;
  const estimatedDurationSeconds = estimatePendingJobDurationSeconds(
    durationHintSeconds,
    modeHint,
    separateGuitar,
    modelHint
  );
  const movingProgress = estimateMovingProgress(elapsedSeconds, estimatedDurationSeconds, isQueued);

  if (exactStages.length > 0) {
    const activeStageIndex = exactStages.findIndex((stage) => stage.state === "active");
    const completedCount = exactStages.filter((stage) => stage.state === "complete").length;
    const currentStepNumber =
      activeStageIndex >= 0
        ? activeStageIndex + 1
        : completedCount >= exactStages.length
        ? exactStages.length
        : isQueued
        ? 1
        : clamp(completedCount + 1, 1, exactStages.length);
    const stageBasedProgress =
      exactStages.length > 0
        ? activeStageIndex >= 0
          ? Math.round(((completedCount + 0.5) / exactStages.length) * 100)
          : completedCount >= exactStages.length
          ? 100
          : Math.round((completedCount / exactStages.length) * 100)
        : 0;
    const progressPercent = clamp(
      Math.round(Math.max(progressValue ?? 0, stageBasedProgress, movingProgress)),
      isQueued ? 4 : 8,
      99
    );
    const progressLabel = `${progressPercent}%`;
    const phaseLabel =
      (typeof getFirstJobValue(job, ["currentStepLabel"]) === "string"
        ? (getFirstJobValue(job, ["currentStepLabel"]) as string)
        : "") || exactStages[activeStageIndex]?.label || (isQueued ? "Getting started" : "Working on your tabs");
    const detail =
      (typeof getFirstJobValue(job, ["currentStepDetail"]) === "string"
        ? (getFirstJobValue(job, ["currentStepDetail"]) as string)
        : "") ||
      (isQueued
        ? "Your transcription is in line and should start shortly."
        : "Still working through the next step.");

    return {
      badgeLabel: isQueued ? "In line" : "Working",
      phaseLabel,
      detail,
      progressPercent,
      elapsedLabel: `Elapsed ${formatDuration(elapsedSeconds)}`,
      typicalDurationLabel: progressLabel,
      attemptLabel,
      warningLabel:
        !isQueued && elapsedSeconds > estimatedDurationSeconds * 1.35
          ? "This is taking longer than usual, but it is still moving."
          : null,
      stepSummary: `Step ${currentStepNumber} of ${exactStages.length}`,
      stages: exactStages,
    };
  }

  const stageKeys: PendingStageKey[] = separateGuitar
    ? isYoutube
      ? (["download", "separate", "predict", "note_events", "format"] as PendingStageKey[])
      : (["prepare", "separate", "predict", "note_events", "format"] as PendingStageKey[])
    : isYoutube
    ? (["download", "predict", "note_events", "format"] as PendingStageKey[])
    : (["prepare", "predict", "note_events", "format"] as PendingStageKey[]);
  const stageThresholds = stageKeys.length === 5 ? [14, 38, 68, 88, 100] : [18, 58, 86, 100];
  const progressPercent = clamp(
    Math.round(Math.max(progressValue ?? 0, movingProgress)),
    isQueued ? 4 : 8,
    99
  );
  const progressLabel = `${progressPercent}%`;

  let activeStageIndex = 0;
  if (!isQueued) {
    activeStageIndex = stageThresholds.findIndex((threshold) => progressPercent < threshold);
    if (activeStageIndex < 0) {
      activeStageIndex = stageKeys.length - 1;
    }
  }

  const activeStage: PendingStageKey = isQueued ? "queue" : stageKeys[activeStageIndex];
  const phaseCopy = {
    queue: {
      phaseLabel: "Getting started",
      detail: "Your transcription is in line and should start shortly.",
    },
    download: {
      phaseLabel: "Getting your clip",
      detail: "Pulling in the part you picked.",
    },
    prepare: {
      phaseLabel: "Getting the audio ready",
      detail: "Cleaning things up so the notes are easier to hear.",
    },
    separate: {
      phaseLabel: "Focusing on the guitar",
      detail: "Bringing the guitar forward before building the tab.",
    },
    predict: {
      phaseLabel: "Listening for the notes",
      detail: "Finding the notes and their timing.",
    },
    note_events: {
      phaseLabel: "Building your guitar tab",
      detail: "Turning the performance into structured tablature.",
    },
    format: {
      phaseLabel: "Getting your preview ready",
      detail: "Putting everything together for the next screen.",
    },
  } as const;

  const warningLabel =
    !isQueued && elapsedSeconds > estimatedDurationSeconds + 20
      ? "This is taking longer than usual, but it is still moving."
      : null;

  return {
    badgeLabel: isQueued ? "In line" : "Working",
    phaseLabel: phaseCopy[activeStage].phaseLabel,
    detail: phaseCopy[activeStage].detail,
    progressPercent,
    elapsedLabel: `Elapsed ${formatDuration(elapsedSeconds)}`,
    typicalDurationLabel: progressLabel,
    attemptLabel,
    warningLabel,
    stepSummary: isQueued ? `Step 1 of ${stageKeys.length}` : `Step ${activeStageIndex + 1} of ${stageKeys.length}`,
    stages: stageKeys.map((stageKey, index) => ({
      label: formatStageLabel(stageKey),
      state: isQueued
        ? index === 0
          ? "active"
          : "upcoming"
        : index < activeStageIndex
        ? "complete"
        : index === activeStageIndex
        ? "active"
        : "upcoming",
    })),
  };
}

function normalizeBackendStages(value: unknown): PendingJobPresentation["stages"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((stage) => {
      if (!stage || typeof stage !== "object" || Array.isArray(stage)) return null;
      const record = stage as Record<string, unknown>;
      const label =
        typeof record.label === "string"
          ? record.label
          : typeof record.key === "string"
          ? String(record.key)
              .split("_")
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" ")
          : null;
      if (!label) return null;
      const rawState =
        typeof record.status === "string"
          ? record.status
          : typeof record.state === "string"
          ? record.state
          : "upcoming";
      const normalizedState =
        rawState === "complete" || rawState === "done" || rawState === "succeeded"
          ? "complete"
          : rawState === "active" || rawState === "running" || rawState === "processing"
          ? "active"
          : "upcoming";
      return {
        label,
        state: normalizedState as "complete" | "active" | "upcoming",
      };
    })
    .filter((stage): stage is PendingJobPresentation["stages"][number] => Boolean(stage));
}

function getWorkflowState(job: JobResponse | null): string | null {
  return typeof getFirstJobValue(job, ["workflowState"]) === "string"
    ? (getFirstJobValue(job, ["workflowState"]) as string)
    : null;
}

function getReviewInfo(job: JobResponse | null) {
  const raw = getFirstJobValue(job, ["review"]);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function getJobTranscriberGroups(job: JobResponse | null): TranscriberSegmentGroup[] {
  const value = getFirstJobValue(job, ["transcriberSegments", "noteEventGroups", "segmentGroups", "segments"]);
  if (!Array.isArray(value)) return [];
  const directGroup = value.filter(
    (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );
  if (directGroup.length > 0) return [directGroup as TranscriberSegmentGroup];
  return value
    .map((group) =>
      Array.isArray(group)
        ? (group.filter(
            (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
          ) as TranscriberSegmentGroup)
        : []
    )
    .filter((group) => group.length > 0);
}

function getJobTranscriberTracks(job: JobResponse | null): TranscriberTrack[] {
  const value = getFirstJobValue(job, ["transcriberTracks", "instrumentTracks"]);
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const segments = Array.isArray(record.segments)
      ? (record.segments.filter(
          (segment): segment is TranscriberTrack["segments"][number] =>
            Boolean(segment) && typeof segment === "object" && !Array.isArray(segment)
        ) as TranscriberTrack["segments"])
      : [];
    if (!segments.length) return [];
    const trackType = record.trackType === "drums" || record.type === "drums" ? "drums" : "tab";
    return [{
      name: typeof record.name === "string" && record.name.trim()
        ? record.name.trim().slice(0, 80)
        : trackType === "drums" ? "Drums" : `Instrument ${index + 1}`,
      trackType,
      instrumentId: typeof record.instrumentId === "string" && record.instrumentId.trim()
        ? record.instrumentId.trim()
        : trackType === "drums" ? "drum1" : "jazz",
      segments,
    }];
  });
}

function getJobSources(job: JobResponse | null) {
  if (!job) return [] as Record<string, unknown>[];
  const direct = job as unknown as Record<string, unknown>;
  const output = direct.output as Record<string, unknown> | undefined;
  const result = direct.result as Record<string, unknown> | undefined;
  return [
    direct,
    output,
    result,
    output?.result as Record<string, unknown> | undefined,
    result?.output as Record<string, unknown> | undefined,
  ].filter(
    (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );
}

function getFirstJobValue(job: JobResponse | null, keys: string[]) {
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

function tabsValueToText(value: unknown) {
  const segments = tabsValueToSegments(value);
  return segments.length > 0 ? tabsToTabText(segments) : "";
}

function tabsValueToSegments(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return normalizeTabSegments(
    value.map((segment) =>
      Array.isArray(segment)
        ? segment.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
        : []
    )
  );
}

function tabTextToSegments(tabText?: string | null): string[][] {
  if (!tabText) return [];
  return normalizeTabSegments(
    tabText
      .split(/\n\s*\n+/)
      .map((segment) => segment.split("\n").map((line) => line.trimEnd()))
  );
}

function getTabPreviewText(tabText?: string | null, maxLines = 12) {
  if (!tabText) return "";
  const lines = tabText.replace(/\r\n/g, "\n").split("\n").map((line) => line.trimEnd());
  while (lines.length > 0 && !lines[0]?.trim()) {
    lines.shift();
  }
  return lines.slice(0, maxLines).join("\n").trimEnd();
}

function getJobTabSegments(job: JobResponse | null): string[][] {
  const structuredSegments = tabsValueToSegments(getFirstJobValue(job, ["tabs"]));
  if (structuredSegments.length > 0) return structuredSegments;
  const tabText =
    typeof getFirstJobValue(job, ["tab_text", "tabText"]) === "string"
      ? (getFirstJobValue(job, ["tab_text", "tabText"]) as string)
      : job?.tab_text;
  return tabTextToSegments(tabText);
}

function getJobTabJobId(job: JobResponse | null) {
  const value = getFirstJobValue(job, TAB_JOB_ID_KEYS);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mergeJobImportFallback(job: JobResponse | null, fallback: JobResponse | null) {
  if (!job) return fallback;
  if (!fallback) return job;
  return normalizeJobForDisplay({ ...(fallback as Record<string, unknown>), ...(job as Record<string, unknown>) } as JobResponse);
}

function normalizeJobForDisplay(job: JobResponse | null): JobResponse | null {
  if (!job) return null;
  const tabText =
    (typeof getFirstJobValue(job, ["tab_text", "tabText"]) === "string"
      ? (getFirstJobValue(job, ["tab_text", "tabText"]) as string)
      : "") || tabsValueToText(getFirstJobValue(job, ["tabs"]));
  const stems = getFirstJobValue(job, ["stems"]);
  return {
    ...job,
    song_title:
      (typeof getFirstJobValue(job, ["song_title", "songTitle"]) === "string"
        ? (getFirstJobValue(job, ["song_title", "songTitle"]) as string)
        : job.song_title) || job.song_title,
    artist:
      (typeof getFirstJobValue(job, ["artist"]) === "string"
        ? (getFirstJobValue(job, ["artist"]) as string)
        : job.artist) || job.artist,
    tab_text: tabText || job.tab_text,
    audio_preview_url:
      (typeof getFirstJobValue(job, ["audio_preview_url", "audioPreviewUrl"]) === "string"
        ? (getFirstJobValue(job, ["audio_preview_url", "audioPreviewUrl"]) as string)
        : job.audio_preview_url) || job.audio_preview_url,
    stems: Array.isArray(stems) ? stems : job.stems,
    error_message:
      (typeof getFirstJobValue(job, ["error_message", "errorMessage", "lastError"]) === "string"
        ? (getFirstJobValue(job, ["error_message", "errorMessage", "lastError"]) as string)
        : job.error_message) || job.error_message,
  };
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) {
    return "Request failed.";
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
  } catch {
    // Ignore parse failures and fall back to the raw response text.
  }
  return text;
}

async function fetchStoredTabPayload(tabId: string): Promise<StoredTabPayloadResponse> {
  const response = await fetch(`/api/tabs/${encodeURIComponent(tabId)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as StoredTabPayloadResponse;
}

async function resolveImportableJob(job: JobResponse | null): Promise<JobResponse | null> {
  const normalized = normalizeJobForDisplay(job);
  if (!normalized) return null;
  if (getJobTranscriberTracks(normalized).length > 0 || getJobTranscriberGroups(normalized).length > 0 || getJobTabSegments(normalized).length > 0) {
    return normalized;
  }

  const tabJobId = getJobTabJobId(normalized);
  if (!tabJobId) return null;

  try {
    const storedTab = await fetchStoredTabPayload(tabJobId);
    if (storedTab.transcriberTracks.length === 0 && storedTab.transcriberSegments.length === 0 && storedTab.tabs.length === 0) return null;
    return normalizeJobForDisplay({
      ...(normalized as Record<string, unknown>),
      tab_job_id: tabJobId,
      tabJobId,
      tab_id: tabJobId,
      tabId: tabJobId,
      tabs: storedTab.tabs,
      transcriberTracks: storedTab.transcriberTracks,
      transcriberSegments: storedTab.transcriberSegments,
      song_title: normalized.song_title || storedTab.sourceLabel,
    } as unknown as JobResponse);
  } catch {
    return null;
  }
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getFinalizedJobFromResponse(payload: Record<string, unknown> | null): JobResponse | null {
  if (!payload) return null;
  const candidates = [
    payload.job,
    payload.result,
    payload.output,
    (payload.result as Record<string, unknown> | undefined)?.job,
    (payload.output as Record<string, unknown> | undefined)?.job,
    payload,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const normalized = normalizeJobForDisplay(candidate as JobResponse);
    const workflowState = getWorkflowState(normalized);
    const hasWorkflowState = Boolean(workflowState && workflowState.trim());
    if (normalized?.status === "done" && (workflowState === "finalized" || !hasWorkflowState)) {
      return normalized;
    }
  }

  return null;
}

export default function JobPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { job_id } = router.query;
  const [job, setJob] = useState<JobResponse | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingInFlightRef = useRef(false);
  const pollingJobIdRef = useRef<string | null>(null);
  const jobEtagRef = useRef<string | null>(null);
  const pollDelayRef = useRef(DEFAULT_JOB_POLL_DELAY_MS);
  const [hasWatchedAd, setHasWatchedAd] = useState(false);
  const [showFallbackVideo, setShowFallbackVideo] = useState(true);
  const [adContainerKey, setAdContainerKey] = useState(0);
  const [savedHistory, setSavedHistory] = useState(false);
  const [shareUrls, setShareUrls] = useState<{ twitter: string; reddit: string } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [progressClock, setProgressClock] = useState(() => Date.now());
  const [processingAdReady, setProcessingAdReady] = useState(false);
  const automaticImportJobRef = useRef<string | null>(null);
  const displayJob = useMemo(() => normalizeJobForDisplay(job), [job]);
  const workflowState = useMemo(() => getWorkflowState(displayJob), [displayJob]);
  const reviewInfo = useMemo(() => getReviewInfo(displayJob), [displayJob]);
  const modeHint = useMemo<JobModeHint | null>(() => {
    if (!router.isReady) return null;
    const rawMode = getQueryStringValue(router.query.mode);
    return rawMode === "YOUTUBE" || rawMode === "FILE" ? rawMode : null;
  }, [router.isReady, router.query.mode]);
  const separateGuitarHint = useMemo(() => {
    if (!router.isReady) return null;
    return parseBooleanFlag(getQueryStringValue(router.query.separateGuitar));
  }, [router.isReady, router.query.separateGuitar]);
  const multipleGuitarsHint = useMemo(() => {
    if (!router.isReady) return null;
    return parseBooleanFlag(getQueryStringValue(router.query.multipleGuitars));
  }, [router.isReady, router.query.multipleGuitars]);
  const modelHint = useMemo<JobModelHint | null>(() => {
    if (!router.isReady) return null;
    const rawModel = getQueryStringValue(router.query.model)?.toLowerCase();
    return rawModel === "heavy" || rawModel === "light" ? rawModel : null;
  }, [router.isReady, router.query.model]);
  const durationHintSeconds = useMemo(() => {
    const queryDuration =
      parsePositiveNumber(getQueryStringValue(router.query.duration)) ??
      parsePositiveNumber(getQueryStringValue(router.query.durationSec));
    const jobDuration = parsePositiveNumber(
      getFirstJobValue(displayJob, ["durationSec", "durationSeconds", "duration_sec", "duration"])
    );
    return queryDuration ?? jobDuration;
  }, [displayJob, router.query.duration, router.query.durationSec]);
  const reviewModeRequested = useMemo(() => {
    if (!router.isReady) return false;
    return parseBooleanFlag(getQueryStringValue(router.query.review)) ?? false;
  }, [router.isReady, router.query.review]);
  const appendEditorId = useMemo(() => {
    if (!router.isReady) return null;
    const value = getQueryStringValue(router.query.appendEditorId);
    return value && value.trim() ? value.trim() : null;
  }, [router.isReady, router.query.appendEditorId]);
  const ytTitleHint = useMemo(() => {
    if (!router.isReady) return null;
    const value = getQueryStringValue(router.query.ytTitle);
    return value && value.trim() ? value.trim() : null;
  }, [router.isReady, router.query.ytTitle]);
  const isSignedIn = Boolean(session);
  const isPremiumUser = ["PREMIUM", "ADMIN", "MODERATOR", "MOD"].includes(
    session?.user?.role || ""
  );
  const isProcessingAdEligible = sessionStatus !== "loading" && !isPremiumUser;
  const canOpenGuestEditor = !isSignedIn && isLocalNoDbClientMode;
  const hasWorkflowState = Boolean(workflowState && workflowState.trim());
  const isWorkflowProcessing = workflowState === "processing";
  const isDoneJob = displayJob?.status === "done";
  const isReviewReady = displayJob?.status === "done" && workflowState === "review_ready";
  const isRecoverableReview =
    displayJob?.status === "done" && workflowState === "processing" && Boolean(displayJob?.audio_preview_url);
  const isFinalizedStatus = displayJob?.status === "done" && (workflowState === "finalized" || !hasWorkflowState);
  const isReopenedFinalizedReview =
    reviewModeRequested &&
    isFinalizedStatus &&
    (Boolean(displayJob?.audio_preview_url) || Boolean(reviewInfo));
  const showReviewUi = isReviewReady || isRecoverableReview || isReopenedFinalizedReview || isDoneJob;
  const isFinalizedJob = isFinalizedStatus && !showReviewUi;
  const pendingPresentation = useMemo(
    () => buildPendingPresentation(displayJob, progressClock, modeHint, separateGuitarHint, durationHintSeconds, modelHint),
    [displayJob, progressClock, modeHint, separateGuitarHint, durationHintSeconds, modelHint]
  );
  const hasPendingPresentation = Boolean(pendingPresentation);
  const completionTrackedRef = useRef<string | null>(null);
  const loadedMultipleGuitars = useMemo(
    () => parseBooleanValue(getFirstJobValue(displayJob, ["multipleGuitars", "multiple_guitars"])),
    [displayJob]
  );

  useEffect(() => {
    setProcessingAdReady(false);
    if (!hasPendingPresentation || !isProcessingAdEligible) return;
    const timer = window.setTimeout(() => setProcessingAdReady(true), PROCESSING_AD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasPendingPresentation, isProcessingAdEligible, job_id]);

  useEffect(() => {
    if (!showReviewUi || typeof job_id !== "string") return;
    if (completionTrackedRef.current === job_id) return;
    completionTrackedRef.current = job_id;
    const properties = {
      jobId: job_id,
      mode: modeHint || undefined,
      durationSec: durationHintSeconds || undefined,
      model: modelHint || undefined,
    };
    sendEvent(ANALYTICS_EVENTS.jobCompleted, {
      ...properties,
      $insert_id: `job-completed:${job_id}`,
    });
    sendEvent(ANALYTICS_EVENTS.tabGenerationSucceeded, {
      ...properties,
      $insert_id: `transcription-succeeded:${job_id}`,
    });
  }, [durationHintSeconds, job_id, modeHint, modelHint, showReviewUi]);


  const fetchJob = async (
    id: string,
    options?: { includeOutput?: boolean; conditional?: boolean }
  ): Promise<JobResponse | null> => {
    try {
      const result = await requestJobStatus<JobResponse>(id, {
        includeOutput: options?.includeOutput,
        etag: options?.conditional ? jobEtagRef.current : null,
      });
      pollDelayRef.current = result.retryAfterMs;
      if (!options?.includeOutput) jobEtagRef.current = result.etag;
      if (result.notModified) return null;

      const data = result.job;
      if (!data) return null;
      setJob(data);
      if (data.status === "error") {
        if (pollTimeoutRef.current) {
          clearTimeout(pollTimeoutRef.current);
          pollTimeoutRef.current = null;
        }
      }
      return data;
    } catch (err) {
      console.error(err);
      const fallback: JobResponse = {
        job_id: id,
        status: "error",
        error_message: "Could not fetch job status.",
      };
      setJob(fallback);
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      return fallback;
    }
  };

  const waitForImportableJob = async (
    initialJob: JobResponse | null,
    fallbackJob: JobResponse | null = displayJob
  ): Promise<JobResponse | null> => {
    const deadline = Date.now() + FINALIZE_IMPORT_TIMEOUT_MS;
    let latestJob = mergeJobImportFallback(initialJob, fallbackJob);

    while (Date.now() < deadline) {
      const importableJob = await resolveImportableJob(latestJob);
      if (importableJob) return importableJob;

      if (typeof job_id !== "string") return null;

      const fullLatestJob = await fetchJob(job_id, { includeOutput: true });
      latestJob = mergeJobImportFallback(normalizeJobForDisplay(fullLatestJob), latestJob);
      const fullImportableJob = await resolveImportableJob(latestJob);
      if (fullImportableJob) return fullImportableJob;

      if (latestJob?.status === "error" || latestJob?.status === "failed") {
        throw new Error(latestJob.error_message || "Transcription failed before the tabs were ready.");
      }

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), FINALIZE_IMPORT_POLL_MS);
      });

      const refreshedJob = await fetchJob(job_id);
      latestJob = mergeJobImportFallback(normalizeJobForDisplay(refreshedJob), latestJob);
    }

    return null;
  };

  useEffect(() => {
    if (!job_id || typeof job_id !== "string") return;
    if (pollingJobIdRef.current !== job_id) {
      pollingJobIdRef.current = job_id;
      jobEtagRef.current = null;
      pollDelayRef.current = DEFAULT_JOB_POLL_DELAY_MS;
    }

    const shouldPoll = !showReviewUi && !isFinalizedJob;
    if (!shouldPoll) {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const scheduleNextPoll = () => {
      if (cancelled) return;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = setTimeout(() => {
        pollTimeoutRef.current = null;
        if (typeof document !== "undefined" && document.hidden) {
          scheduleNextPoll();
          return;
        }
        void pollFetchJob(true);
      }, pollDelayRef.current);
    };
    const pollFetchJob = async (conditional: boolean) => {
      if (pollingInFlightRef.current) {
        scheduleNextPoll();
        return;
      }
      pollingInFlightRef.current = true;
      try {
        await fetchJob(job_id, { conditional });
      } finally {
        pollingInFlightRef.current = false;
        scheduleNextPoll();
      }
    };

    void pollFetchJob(Boolean(jobEtagRef.current));
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        if (pollTimeoutRef.current) {
          clearTimeout(pollTimeoutRef.current);
          pollTimeoutRef.current = null;
        }
        void pollFetchJob(true);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [job_id, showReviewUi, isFinalizedJob]);

  useEffect(() => {
    if (!hasPendingPresentation) return;
    setProgressClock(Date.now());
    const tick = window.setInterval(() => setProgressClock(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [hasPendingPresentation, job_id]);

  useEffect(() => {
    if (!isFinalizedJob) return;
    if (!savedHistory && job_id && typeof job_id === "string") {
      saveJobToHistory({
        jobId: job_id,
        songTitle: displayJob?.song_title,
        artist: displayJob?.artist,
        createdAt: new Date().toISOString(),
      });
      setSavedHistory(true);
    }
  }, [isFinalizedJob, savedHistory, job_id, displayJob?.song_title, displayJob?.artist]);

  useEffect(() => {
    setHasWatchedAd(false);
    setShowFallbackVideo(true);
    setAdContainerKey(0);
    setSavedHistory(false);
    setShareUrls(null);
    setReviewError(null);
    setReviewBusy(false);
    automaticImportJobRef.current = null;
  }, [job_id]);

  useEffect(() => {
    if (!isFinalizedJob || !job_id) return;
    const base =
      typeof window !== "undefined" ? window.location.href : `${getAppBaseUrl()}/job/${job_id}`;
    const text = encodeURIComponent("Check out these tabs I generated with Note2Tabs!");
    setShareUrls({
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(base)}`,
      reddit: `https://reddit.com/submit?url=${encodeURIComponent(base)}&title=${text}`,
    });
  }, [isFinalizedJob, job_id]);

  const handleDownloadTabs = () => {
    const content = displayJob?.tab_text || "";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${displayJob?.song_title || "note2tabs"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const performJobImportToEditor = async (
    jobToImport: JobResponse | null,
    targetEditorChoice: string,
    quantize: boolean
  ): Promise<ImportResult | null> => {
    if (!jobToImport) {
      throw new Error("No importable tab groups are available for this transcription.");
    }

    let importSourceLabel = ytTitleHint || jobToImport.song_title || "Imported transcription";
    let resolvedTranscriberGroups = getJobTranscriberGroups(jobToImport);
    let resolvedTranscriberTracks = getJobTranscriberTracks(jobToImport);
    let resolvedTabSegments = getJobTabSegments(jobToImport);
    const tabJobId = getJobTabJobId(jobToImport);
    if (tabJobId) {
      const needsStoredPayload = resolvedTranscriberGroups.length === 0 || resolvedTabSegments.length === 0;
      try {
        const storedTab = await fetchStoredTabPayload(tabJobId);
        resolvedTranscriberGroups =
          resolvedTranscriberGroups.length > 0 ? resolvedTranscriberGroups : storedTab.transcriberSegments;
        resolvedTranscriberTracks =
          resolvedTranscriberTracks.length > 0 ? resolvedTranscriberTracks : storedTab.transcriberTracks;
        resolvedTabSegments = resolvedTabSegments.length > 0 ? resolvedTabSegments : storedTab.tabs;
        if (!ytTitleHint && storedTab.sourceLabel) {
          importSourceLabel = storedTab.sourceLabel;
        }
      } catch (error) {
        if (needsStoredPayload) throw error;
      }
    }
    if (resolvedTranscriberTracks.length > 0) {
      resolvedTranscriberGroups = resolvedTranscriberTracks.map((track) => track.segments);
    }
    if (resolvedTranscriberGroups.length === 0 && resolvedTabSegments.length === 0) {
      throw new Error("No importable tab groups are available for this transcription.");
    }

    if (canOpenGuestEditor) {
      await gteApi.deleteEditor(GTE_GUEST_EDITOR_ID).catch(() => {});
      if (resolvedTranscriberGroups.length > 0) {
        const imported = await gteApi.importTranscriberToGuest({
          editorId: GTE_GUEST_EDITOR_ID,
          name: importSourceLabel,
          segmentGroups: resolvedTranscriberGroups,
          tracks: resolvedTranscriberTracks,
          quantize,
          sourceJobId: jobToImport.job_id,
        });
        return {
          editorId: imported.editorId,
          importFormat: "segment_groups",
          target: "guest",
          href: `/gte/${imported.editorId}?source=job`,
        };
      }

      const { stamps, totalFrames } = tabSegmentsToStamps(resolvedTabSegments);
      if (stamps.length === 0) {
        throw new Error("No playable tab notes were found in this transcription.");
      }
      const guestLaneEditorId = buildLaneEditorRef(GTE_GUEST_EDITOR_ID, "ed-1");
      await gteApi.importTab(guestLaneEditorId, { stamps, totalFrames });
      return {
        editorId: GTE_GUEST_EDITOR_ID,
        importFormat: "tab_stamps",
        target: "guest",
        href: `/gte/${GTE_GUEST_EDITOR_ID}?source=job`,
      };
    }

    if (!isSignedIn) {
      await signIn(undefined, {
        callbackUrl:
          typeof window !== "undefined"
            ? window.location.href
            : `${getAppBaseUrl()}/job/${jobToImport.job_id}`,
      });
      return null;
    }

    const targetEditorId = targetEditorChoice && targetEditorChoice !== "new" ? targetEditorChoice : null;
    if (resolvedTranscriberGroups.length > 0) {
      const imported = await gteApi.importTranscriberToSaved({
        target: targetEditorId ? "existing" : "new",
        editorId: targetEditorId ?? undefined,
        name: importSourceLabel,
        segmentGroups: resolvedTranscriberGroups,
        tracks: resolvedTranscriberTracks,
        quantize,
        sourceJobId: jobToImport.job_id,
      });
      return {
        editorId: imported.editorId,
        importFormat: "segment_groups",
        target: targetEditorId ? "existing" : "new",
        href: `/gte/${imported.editorId}?source=job`,
      };
    }

    const { stamps, totalFrames } = tabSegmentsToStamps(resolvedTabSegments);
    if (stamps.length === 0) {
      throw new Error("No playable tab notes were found in this transcription.");
    }
    if (targetEditorId) {
      await gteApi.appendImportTab(targetEditorId, { stamps, totalFrames });
      return {
        editorId: targetEditorId,
        importFormat: "tab_stamps",
        target: "existing",
        href: `/gte/${targetEditorId}?source=job`,
      };
    }

    const created = await gteApi.createEditor(undefined, importSourceLabel);
    await gteApi.appendImportTab(created.editorId, { stamps, totalFrames });
    return {
      editorId: created.editorId,
      importFormat: "tab_stamps",
      target: "new",
      href: `/gte/${created.editorId}?source=job`,
    };
  };

  const importJobToEditor = async (
    jobToImport: JobResponse | null,
    targetEditorChoice: string,
    quantize: boolean
  ): Promise<boolean> => {
    const target =
      canOpenGuestEditor
        ? "guest"
        : targetEditorChoice && targetEditorChoice !== "new"
        ? "existing"
        : "new";
    const eventProperties = {
      target,
      selection: "all",
      mode: modeHint || undefined,
      source: "job",
      job_id: typeof job_id === "string" ? job_id : undefined,
      quantize,
    };
    sendEvent(ANALYTICS_EVENTS.transcriptionEditorImportStarted, eventProperties);
    try {
      const result = await performJobImportToEditor(jobToImport, targetEditorChoice, quantize);
      if (!result) return false;
      sendEvent(ANALYTICS_EVENTS.transcriptionImportedToEditor, {
        ...eventProperties,
        target: result.target,
        import_format: result.importFormat,
        editor_id: result.editorId,
      });
      await router.push(result.href);
      return true;
    } catch (error: any) {
      sendEvent(ANALYTICS_EVENTS.transcriptionEditorImportFailed, {
        ...eventProperties,
        error_code: categorizeAnalyticsError(error, "editor_import_failed"),
      });
      throw error;
    }
  };

  const automaticallyOpenEditor = async () => {
    if (!showReviewUi || typeof job_id !== "string" || reviewBusy) return;
    setReviewBusy(true);
    setReviewError(null);
    let importedSuccessfully = false;
    const targetEditorChoice = appendEditorId ?? "new";
    try {
      if (isFinalizedStatus) {
        const importableJob = await waitForImportableJob(displayJob);
        if (!importableJob) {
          throw new Error("Tabs are still getting ready for the editor. Please try again in a moment.");
        }
        importedSuccessfully = await importJobToEditor(importableJob, targetEditorChoice, true);
        return;
      }

      const finalizeMultipleGuitars = loadedMultipleGuitars ?? multipleGuitarsHint ?? false;
      const response = await fetch(`/api/jobs/${encodeURIComponent(job_id)}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ multipleGuitars: finalizeMultipleGuitars }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const finalizePayload = await readJsonResponse(response);
      const finalizedResponseJob = mergeJobImportFallback(getFinalizedJobFromResponse(finalizePayload), displayJob);
      let finalizedJobForImport = await waitForImportableJob(finalizedResponseJob, displayJob);
      if (finalizedResponseJob) {
        setJob(finalizedResponseJob);
      }

      const deadline = Date.now() + FINALIZE_IMPORT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (finalizedJobForImport) break;
        const latestJob = await fetchJob(job_id);
        const normalizedLatest = mergeJobImportFallback(normalizeJobForDisplay(latestJob), displayJob);
        const latestWorkflowState = getWorkflowState(normalizedLatest);
        const hasLatestWorkflowState = Boolean(latestWorkflowState && latestWorkflowState.trim());
        const isLatestFinalized =
          normalizedLatest?.status === "done" &&
          (latestWorkflowState === "finalized" || !hasLatestWorkflowState);
        if (isLatestFinalized) {
          finalizedJobForImport = await waitForImportableJob(normalizedLatest, displayJob);
          if (finalizedJobForImport) break;

          const fullLatestJob = await fetchJob(job_id, { includeOutput: true });
          const normalizedFullLatest = mergeJobImportFallback(normalizeJobForDisplay(fullLatestJob), normalizedLatest);
          finalizedJobForImport = await waitForImportableJob(normalizedFullLatest, normalizedLatest);
          if (finalizedJobForImport) break;
        }
        if (normalizedLatest?.status === "error" || normalizedLatest?.status === "failed") {
          throw new Error(normalizedLatest.error_message || "Transcription failed during finalization.");
        }
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), FINALIZE_IMPORT_POLL_MS);
        });
      }

      if (!finalizedJobForImport) {
        throw new Error("Tabs are still finalizing. Please try again in a moment.");
      }

      importedSuccessfully = await importJobToEditor(finalizedJobForImport, targetEditorChoice, true);
    } catch (err: any) {
      const message =
        err?.message === "No importable tab groups are available for this transcription."
          ? "Tabs are still getting ready for the editor. Please try again in a moment."
          : err?.message || "Failed to finalize tab groups.";
      setReviewError(message);
    } finally {
      setReviewBusy(false);
      if (!importedSuccessfully) {
        await fetchJob(job_id);
      }
    }
  };

  useEffect(() => {
    if (!router.isReady || !showReviewUi || typeof job_id !== "string") return;
    if (sessionStatus === "loading" || automaticImportJobRef.current === job_id) return;
    automaticImportJobRef.current = job_id;
    void automaticallyOpenEditor();
    // The completed job id is the one-shot trigger. Import state changes must not start a duplicate editor import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job_id, router.isReady, sessionStatus, showReviewUi]);

  const handleRestart = () => {
    void router.push("/");
  };

  const handleSkipAd = () => {
    setHasWatchedAd(true);
  };

  const handleVideoComplete = () => {
    handleSkipAd();
  };

  // Completed tabs must never be gated behind an advertisement.
  const showAdGate = false;
  const title = showReviewUi ? "Opening editor - Note2Tabs" : "Preparing Tabs - Note2Tabs";

  return (
    <>
      <NoIndexHead
        title={title}
        canonicalPath={`/job/${encodeURIComponent(typeof job_id === "string" ? job_id : "")}`}
        description="Job status on Note2Tabs."
      />
      <main className="page page-tight">
        <div className="container stack">
          <div className="page-header job-route-header">
            <div>
              <h1 className="page-title">{showReviewUi ? "Opening your editor" : "Preparing your guitar tab"}</h1>
            </div>
            {!showReviewUi && (
              <button type="button" onClick={() => void router.push("/")} className="button-ghost button-small">
                Back
              </button>
            )}
          </div>

          <div className="job-route-content">
          {processingAdReady && hasPendingPresentation && isProcessingAdEligible && (
            <AdvertisementSlot placement="transcription-loading" />
          )}
          {showReviewUi ? (
            <div className="stack">
              <EditorLoadingState label="Quantizing transcription and opening your editor" />
              {reviewError ? (
                <div className="stack-tight">
                  <div className="error">{reviewError}</div>
                  <button
                    type="button"
                    className="button-primary button-small"
                    disabled={reviewBusy}
                    onClick={() => {
                      if (typeof job_id === "string") automaticImportJobRef.current = null;
                      setReviewError(null);
                      void automaticallyOpenEditor();
                    }}
                  >
                    Retry opening editor
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <JobStatusLayout
              job={displayJob}
              pendingPresentation={pendingPresentation}
              onDownloadTabs={handleDownloadTabs}
              onRestart={handleRestart}
              hasWatchedAd={hasWatchedAd}
              showAdGate={showAdGate}
              onRetryAd={() => setAdContainerKey((current) => current + 1)}
              adContainerKey={adContainerKey}
              onSkipAd={handleSkipAd}
              showFallbackVideo={showFallbackVideo}
              onVideoComplete={handleVideoComplete}
              shareUrls={shareUrls}
            />
          )}
          </div>
        </div>
      </main>
    </>
  );
}
