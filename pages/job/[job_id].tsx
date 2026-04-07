import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import { signIn, useSession } from "next-auth/react";
import JobStatusLayout, {
  type JobResponse,
  type PendingJobPresentation,
} from "../../components/JobStatusLayout";
import { isLocalNoDbClientMode } from "../../lib/clientDevMode";
import { buildLaneEditorRef, gteApi, type TranscriberSegmentGroup } from "../../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../../lib/gteGuestDraft";
import { saveJobToHistory } from "../../lib/history";
import { normalizeTabSegments, tabSegmentsToStamps, tabsToTabText } from "../../lib/tabTextToStamps";
import { getAppBaseUrl } from "../../lib/urls";

const POLL_INTERVAL = 3000;
const PRIMIS_CHANNEL_ID = "YOUR_PRIMIS_CHANNEL_ID";
const ADS_AVAILABLE = PRIMIS_CHANNEL_ID && PRIMIS_CHANNEL_ID !== "YOUR_PRIMIS_CHANNEL_ID";
const PENDING_JOB_STATUSES = new Set(["queued", "pending", "processing", "running"]);

type JobModeHint = "FILE" | "YOUTUBE";
type PendingStageKey = "queue" | "download" | "prepare" | "separate" | "predict" | "note_events" | "format";
type ReviewAction = "redo" | "finalize" | null;
type ReviewParams = {
  onsetThresh: number;
  frameThresh: number;
  minNoteLen: number;
  minFreq: number;
  maxFreq: number;
};

const REVIEW_SLIDERS: Array<{
  key: keyof ReviewParams;
  label: string;
  min: number;
  max: number;
  step: number;
  description: string;
  format: (value: number) => string;
}> = [
  {
    key: "onsetThresh",
    label: "Pick attack sensitivity",
    min: 0,
    max: 1,
    step: 0.01,
    description: "Higher catches more note starts. Lower is stricter.",
    format: (value) => value.toFixed(2),
  },
  {
    key: "frameThresh",
    label: "Note hold sensitivity",
    min: 0,
    max: 1,
    step: 0.01,
    description: "Higher lets notes ring longer. Lower cuts them off sooner.",
    format: (value) => value.toFixed(2),
  },
  {
    key: "minNoteLen",
    label: "Minimum note length",
    min: 1,
    max: 32,
    step: 1,
    description: "Ignore tiny blips and accidental hits.",
    format: (value) => `${Math.round(value)} frames`,
  },
  {
    key: "minFreq",
    label: "Lowest note",
    min: 40,
    max: 400,
    step: 1,
    description: "Ignore notes below this range.",
    format: (value) => `${Math.round(value)} Hz`,
  },
  {
    key: "maxFreq",
    label: "Highest note",
    min: 500,
    max: 2000,
    step: 1,
    description: "Ignore notes above this range.",
    format: (value) => `${Math.round(value)} Hz`,
  },
];

function getQueryStringValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function isSignedAssetUrl(url: string) {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    return (
      params.has("X-Goog-Algorithm") ||
      params.has("X-Goog-Signature") ||
      params.has("GoogleAccessId") ||
      params.has("X-Amz-Algorithm") ||
      params.has("X-Amz-Signature") ||
      params.has("Signature")
    );
  } catch {
    return false;
  }
}

function parseBooleanFlag(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
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
  if (stageKey === "note_events") return "Build first draft";
  if (stageKey === "format") return "Get preview ready";
  return "In line";
}

function buildPendingPresentation(
  job: JobResponse | null,
  nowMs: number,
  modeHint: JobModeHint | null,
  separateGuitarHint: boolean | null
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
    const progressPercent = progressValue ?? clamp(stageBasedProgress, isQueued ? 4 : 8, 100);
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
      typicalDurationLabel: "",
      attemptLabel,
      warningLabel: null,
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
  const estimatedDurationSeconds = isYoutube
    ? separateGuitar
      ? 90
      : 55
    : separateGuitar
    ? 70
    : 40;

  let progressPercent = isQueued ? 8 : 12;
  if (progressValue !== null && !isQueued) {
    progressPercent = clamp(progressValue, 8, 96);
  } else if (!isQueued) {
    const normalized = estimatedDurationSeconds > 0 ? elapsedSeconds / estimatedDurationSeconds : 0;
    progressPercent = clamp(Math.round(12 + Math.min(normalized, 0.94) * 82), 12, 96);
  }

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
      phaseLabel: "Building the first draft",
      detail: "Turning what we heard into a first pass.",
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
    typicalDurationLabel: separateGuitar
      ? isYoutube
        ? "Typical time: 60-120 seconds"
        : "Typical time: 45-90 seconds"
      : isYoutube
      ? "Typical time: 35-60 seconds"
      : "Typical time: 25-45 seconds",
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

function defaultReviewParams(): ReviewParams {
  return {
    onsetThresh: 0.45,
    frameThresh: 0.25,
    minNoteLen: 8,
    minFreq: 82.41,
    maxFreq: 1318.51,
  };
}

function getReviewBusyCopy(action: ReviewAction) {
  if (action === "finalize") {
    return {
      badge: "Building tabs",
      title: "Building tabs from your selected sound",
      detail: "Preparing the tab options now.",
    };
  }
  return {
    badge: "Updating sound",
    title: "Refreshing your preview",
    detail: "Generating a new preview with your current settings.",
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

function getReviewParams(job: JobResponse | null): ReviewParams | null {
  const review = getReviewInfo(job);
  const raw =
    review && review.params && typeof review.params === "object" && !Array.isArray(review.params)
      ? (review.params as Record<string, unknown>)
      : getFirstJobValue(job, ["reviewParams", "params"]);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const onsetThresh = Number(record.onsetThresh);
  const frameThresh = Number(record.frameThresh);
  const minNoteLen = Number(record.minNoteLen);
  const minFreq = Number(record.minFreq);
  const maxFreq = Number(record.maxFreq);
  if (
    !Number.isFinite(onsetThresh) ||
    !Number.isFinite(frameThresh) ||
    !Number.isFinite(minNoteLen) ||
    !Number.isFinite(minFreq) ||
    !Number.isFinite(maxFreq)
  ) {
    return null;
  }
  return {
    onsetThresh,
    frameThresh,
    minNoteLen,
    minFreq,
    maxFreq,
  };
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

function getJobTabSegments(job: JobResponse | null): string[][] {
  const structuredSegments = tabsValueToSegments(getFirstJobValue(job, ["tabs"]));
  if (structuredSegments.length > 0) return structuredSegments;
  const tabText =
    typeof getFirstJobValue(job, ["tab_text", "tabText"]) === "string"
      ? (getFirstJobValue(job, ["tab_text", "tabText"]) as string)
      : job?.tab_text;
  return tabTextToSegments(tabText);
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

export default function JobPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { job_id } = router.query;
  const [job, setJob] = useState<JobResponse | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasWatchedAd, setHasWatchedAd] = useState(false);
  const [showFallbackVideo, setShowFallbackVideo] = useState(true);
  const [adContainerKey, setAdContainerKey] = useState(0);
  const [loadAdScript, setLoadAdScript] = useState(false);
  const [savedHistory, setSavedHistory] = useState(false);
  const [shareUrls, setShareUrls] = useState<{ twitter: string; reddit: string } | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [reviewParams, setReviewParams] = useState<ReviewParams>(defaultReviewParams);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [previewReloadToken, setPreviewReloadToken] = useState<string>("0");
  const [progressClock, setProgressClock] = useState(() => Date.now());
  const displayJob = useMemo(() => normalizeJobForDisplay(job), [job]);
  const workflowState = useMemo(() => getWorkflowState(displayJob), [displayJob]);
  const reviewInfo = useMemo(() => getReviewInfo(displayJob), [displayJob]);
  const reviewNoteCount = useMemo(() => {
    const value = Number(reviewInfo?.noteEventCount);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  }, [reviewInfo]);
  const modeHint = useMemo<JobModeHint | null>(() => {
    if (!router.isReady) return null;
    const rawMode = getQueryStringValue(router.query.mode);
    return rawMode === "YOUTUBE" || rawMode === "FILE" ? rawMode : null;
  }, [router.isReady, router.query.mode]);
  const separateGuitarHint = useMemo(() => {
    if (!router.isReady) return null;
    return parseBooleanFlag(getQueryStringValue(router.query.separateGuitar));
  }, [router.isReady, router.query.separateGuitar]);
  const appendEditorId = useMemo(() => {
    if (!router.isReady) return null;
    const value = router.query.appendEditorId;
    if (Array.isArray(value)) return value[0]?.trim() || null;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }, [router.isReady, router.query.appendEditorId]);
  const reviewModeRequested = useMemo(() => {
    if (!router.isReady) return false;
    return parseBooleanFlag(getQueryStringValue(router.query.review)) ?? false;
  }, [router.isReady, router.query.review]);
  const isSignedIn = Boolean(session);
  const canOpenGuestEditor = !isSignedIn && isLocalNoDbClientMode;
  const importButtonLabel = canOpenGuestEditor ? "Open in guest editor" : "Import to editor";
  const hasWorkflowState = Boolean(workflowState && workflowState.trim());
  const isWorkflowProcessing = workflowState === "processing";
  const isReviewReady = displayJob?.status === "done" && workflowState === "review_ready";
  const isRecoverableReview =
    displayJob?.status === "done" && workflowState === "processing" && Boolean(displayJob?.audio_preview_url);
  const isReopenedFinalizedReview =
    reviewModeRequested &&
    displayJob?.status === "done" &&
    workflowState === "finalized" &&
    (Boolean(displayJob?.audio_preview_url) || Boolean(reviewInfo));
  const showReviewUi = isReviewReady || isRecoverableReview || isReopenedFinalizedReview;
  const isFinalizedJob =
    displayJob?.status === "done" && (workflowState === "finalized" || !hasWorkflowState) && !showReviewUi;
  const tabSegments = useMemo(() => getJobTabSegments(displayJob), [displayJob]);
  const transcriberGroups = useMemo(() => getJobTranscriberGroups(displayJob), [displayJob]);
  const canImportToEditor = isFinalizedJob && (tabSegments.length > 0 || transcriberGroups.length > 0);
  const pendingPresentation = useMemo(
    () => buildPendingPresentation(displayJob, progressClock, modeHint, separateGuitarHint),
    [displayJob, progressClock, modeHint, separateGuitarHint]
  );
  const reviewBusyCopy = useMemo(() => getReviewBusyCopy(reviewAction), [reviewAction]);
  const previewAudioUrl = useMemo(() => {
    if (!displayJob?.audio_preview_url) return null;
    if (isSignedAssetUrl(displayJob.audio_preview_url)) {
      // Do not append custom query params to signed URLs or the signature becomes invalid.
      return displayJob.audio_preview_url;
    }
    const versionSeed = [displayJob.updatedAt, displayJob.finishedAt, String(reviewNoteCount ?? ""), previewReloadToken]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(":");
    return versionSeed ? appendQueryParam(displayJob.audio_preview_url, "reload", versionSeed) : displayJob.audio_preview_url;
  }, [displayJob?.audio_preview_url, displayJob?.finishedAt, displayJob?.updatedAt, previewReloadToken, reviewNoteCount]);

  useEffect(() => {
    const next = getReviewParams(displayJob);
    if (next) {
      setReviewParams(next);
    } else if (showReviewUi) {
      setReviewParams(defaultReviewParams());
    }
  }, [displayJob, showReviewUi]);

  const fetchJob = async (id: string) => {
    try {
      const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch");
      const data: JobResponse = await response.json();
      setJob(data);
      if (data.status === "error") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch (err) {
      console.error(err);
      setJob({
        job_id: id,
        status: "error",
        error_message: "Could not fetch job status.",
      });
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!job_id || typeof job_id !== "string") return;
    void fetchJob(job_id);
    const shouldPoll = !showReviewUi && !isFinalizedJob;
    if (!shouldPoll) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      void fetchJob(job_id);
    }, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [job_id, showReviewUi, isFinalizedJob]);

  useEffect(() => {
    if (!pendingPresentation) return;
    setProgressClock(Date.now());
    const tick = window.setInterval(() => setProgressClock(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [pendingPresentation, job_id]);

  useEffect(() => {
    if (!isFinalizedJob) return;
    if (!hasWatchedAd && ADS_AVAILABLE) {
      setLoadAdScript(true);
    }
    if (!savedHistory && job_id && typeof job_id === "string") {
      saveJobToHistory({
        jobId: job_id,
        songTitle: displayJob?.song_title,
        artist: displayJob?.artist,
        createdAt: new Date().toISOString(),
      });
      setSavedHistory(true);
    }
  }, [isFinalizedJob, hasWatchedAd, savedHistory, job_id, displayJob?.song_title, displayJob?.artist]);

  useEffect(() => {
    setHasWatchedAd(false);
    setShowFallbackVideo(true);
    setLoadAdScript(false);
    setAdContainerKey(0);
    setSavedHistory(false);
    setShareUrls(null);
    setImportError(null);
    setReviewError(null);
    setReviewBusy(false);
    setReviewAction(null);
    setPreviewReloadToken("0");
  }, [job_id]);

  useEffect(() => {
    if (!isFinalizedJob || !job_id) return;
    const resolvedTabId = getFirstJobValue(displayJob, ["tab_job_id", "tabJobId", "tab_id", "tabId"]);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (typeof resolvedTabId === "string" && resolvedTabId) {
      void router.replace(
        appendEditorId
          ? `/tabs/${resolvedTabId}?appendEditorId=${encodeURIComponent(appendEditorId)}`
          : `/tabs/${resolvedTabId}`
      );
    }
  }, [isFinalizedJob, job_id, displayJob, router, appendEditorId]);

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

  useEffect(() => {
    if (!loadAdScript) return;
    const handleEnd = () => {
      setHasWatchedAd(true);
    };
    const handleRetry = () => {
      setAdContainerKey((current) => current + 1);
      setShowFallbackVideo(true);
    };
    document.addEventListener("PrimisOnAdEnded", handleEnd);
    document.addEventListener("PrimisOnAdSkipped", handleRetry);
    document.addEventListener("PrimisOnAdError", handleRetry);
    return () => {
      document.removeEventListener("PrimisOnAdEnded", handleEnd);
      document.removeEventListener("PrimisOnAdSkipped", handleRetry);
      document.removeEventListener("PrimisOnAdError", handleRetry);
    };
  }, [loadAdScript]);

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

  const handleImportToEditor = async () => {
    if (!displayJob || importBusy) return;
    if (transcriberGroups.length === 0 && tabSegments.length === 0) {
      setImportError("No importable tab groups are available for this transcription.");
      return;
    }
    setImportBusy(true);
    setImportError(null);
    try {
      if (canOpenGuestEditor) {
        await gteApi.deleteEditor(GTE_GUEST_EDITOR_ID).catch(() => {});
        if (transcriberGroups.length > 0) {
          const imported = await gteApi.importTranscriberToGuest({
            editorId: GTE_GUEST_EDITOR_ID,
            name: displayJob.song_title || "Imported transcription",
            segmentGroups: transcriberGroups,
          });
          await router.push(`/gte/${imported.editorId}?source=job`);
          return;
        }
        const { stamps, totalFrames } = tabSegmentsToStamps(tabSegments);
        if (stamps.length === 0) {
          throw new Error("No playable tab notes were found in this transcription.");
        }
        const guestLaneEditorId = buildLaneEditorRef(GTE_GUEST_EDITOR_ID, "ed-1");
        await gteApi.importTab(guestLaneEditorId, { stamps, totalFrames });
        await router.push(`/gte/${GTE_GUEST_EDITOR_ID}?source=job`);
        return;
      }

      if (!isSignedIn) {
        await signIn(undefined, {
          callbackUrl:
            typeof window !== "undefined"
              ? window.location.href
              : `${getAppBaseUrl()}/job/${displayJob.job_id}`,
        });
        return;
      }

      if (transcriberGroups.length > 0) {
        const imported = await gteApi.importTranscriberToSaved({
          target: appendEditorId ? "existing" : "new",
          editorId: appendEditorId ?? undefined,
          name: displayJob.song_title || "Imported transcription",
          segmentGroups: transcriberGroups,
        });
        await router.push(`/gte/${imported.editorId}?source=job`);
        return;
      }

      const { stamps, totalFrames } = tabSegmentsToStamps(tabSegments);
      if (stamps.length === 0) {
        throw new Error("No playable tab notes were found in this transcription.");
      }
      if (appendEditorId) {
        await gteApi.appendImportTab(appendEditorId, { stamps, totalFrames });
        await router.push(`/gte/${appendEditorId}?source=job`);
        return;
      }
      const created = await gteApi.createEditor(undefined, displayJob.song_title || "Imported transcription");
      await gteApi.appendImportTab(created.editorId, { stamps, totalFrames });
      await router.push(`/gte/${created.editorId}?source=job`);
    } catch (err: any) {
      setImportError(err?.message || "Failed to import tabs into the editor.");
    } finally {
      setImportBusy(false);
    }
  };

  const handleReviewParamChange = (key: keyof ReviewParams, value: number) => {
    setReviewParams((current) => ({ ...current, [key]: value }));
  };

  const handleRedoTranscription = async () => {
    if (!showReviewUi || typeof job_id !== "string" || reviewBusy) return;
    setReviewBusy(true);
    setReviewAction("redo");
    setReviewError(null);
    let redoSucceeded = false;
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(job_id)}/redo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewParams),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      redoSucceeded = true;
    } catch (err: any) {
      setReviewError(err?.message || "Failed to regenerate note events.");
    } finally {
      if (redoSucceeded) {
        setPreviewReloadToken(String(Date.now()));
      }
      setReviewBusy(false);
      setReviewAction(null);
      await fetchJob(job_id);
    }
  };

  const handleContinue = async () => {
    if (!showReviewUi || typeof job_id !== "string" || reviewBusy) return;
    setReviewBusy(true);
    setReviewAction("finalize");
    setReviewError(null);
    let finalizeSucceeded = false;
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(job_id)}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      finalizeSucceeded = true;
    } catch (err: any) {
      setReviewError(err?.message || "Failed to finalize tab groups.");
    } finally {
      if (finalizeSucceeded && reviewModeRequested) {
        const nextQuery = { ...router.query };
        delete nextQuery.review;
        await router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
      }
      setReviewBusy(false);
      setReviewAction(null);
      await fetchJob(job_id);
    }
  };

  const handleRestart = () => {
    void router.push("/");
  };

  const handleSkipAd = () => {
    setHasWatchedAd(true);
  };

  const handleVideoComplete = () => {
    handleSkipAd();
  };

  const showAdGate = isFinalizedJob && !hasWatchedAd;
  const title = showReviewUi
    ? displayJob?.song_title
      ? `Review ${displayJob.song_title} - Note2Tabs`
      : "Review transcription - Note2Tabs"
    : isFinalizedJob && displayJob?.song_title
    ? `${displayJob.song_title} - Note2Tabs`
    : isFinalizedJob
    ? "Tabs Ready - Note2Tabs"
    : "Preparing Tabs - Note2Tabs";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="Preparing your tabs on Note2Tabs." />
      </Head>
      {loadAdScript && (
        <Script
          src={`https://live.primis.tech/live/liveView.php?s=${PRIMIS_CHANNEL_ID}`}
          strategy="afterInteractive"
        />
      )}
      <main className="page page-tight">
        <div className="container stack">
          <div className="page-header">
            <div>
              <h1 className="page-title">{showReviewUi ? "Tune your sound" : "Preparing your tabs"}</h1>
              <p className="page-subtitle">
                {showReviewUi
                  ? "Play the preview, tweak controls, then continue."
                  : "Live updates while your tabs are processing."}
              </p>
            </div>
            <button type="button" onClick={() => void router.push("/")} className="button-ghost button-small">
              Back
            </button>
          </div>

          {showReviewUi ? (
            <div className="review-shell" aria-busy={reviewBusy}>
              <div className="review-top-grid">
                <section className="card review-intro-card">
                  <div className="review-hero-copy">
                    <span className="badge">Sound check</span>
                    <div className="stack" style={{ gap: "8px" }}>
                      <h2 className="review-hero-title">{displayJob?.song_title || "Shape your guitar preview"}</h2>
                      <p className="review-hero-lead">
                        Focus on the sound, then continue once it feels right.
                      </p>
                      {isRecoverableReview ? (
                        <p className="muted text-small" style={{ margin: 0 }}>
                          The last update did not finish cleanly. Your previous sound is still here, so you can try
                          again or move on from this version.
                        </p>
                      ) : null}
                    </div>
                    <div className="review-guide">
                      <div className="review-guide-step">
                        <span className="review-guide-number">1</span>
                        <p>Play the preview and note anything off.</p>
                      </div>
                      <div className="review-guide-step">
                        <span className="review-guide-number">2</span>
                        <p>Adjust controls, then press <strong>Update sound</strong>.</p>
                      </div>
                      <div className="review-guide-step">
                        <span className="review-guide-number">3</span>
                        <p>Press <strong>Continue to tabs</strong> when satisfied.</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="card review-preview-card">
                  <div className="review-preview-shell">
                    <div className="review-audio-header">
                      <div>
                        <p className="review-audio-label">Preview sound</p>
                        <p className="review-audio-caption">This is the version the tab builder will use next.</p>
                      </div>
                      {reviewNoteCount !== null ? (
                        <span className="review-count-pill">{reviewNoteCount.toLocaleString()} notes</span>
                      ) : null}
                    </div>
                    <div className="review-player-box">
                      {previewAudioUrl ? (
                        <audio key={previewAudioUrl} controls src={previewAudioUrl} className="review-audio-player">
                          Your browser does not support the audio element.
                        </audio>
                      ) : (
                        <p className="muted text-small" style={{ margin: 0 }}>
                          Preview audio is not available yet.
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              {reviewBusy ? (
                <div className="card">
                  <div className="job-progress-shell">
                    <div className="job-progress-header">
                      <div className="stack" style={{ gap: "8px" }}>
                        <span className="badge">{reviewBusyCopy.badge}</span>
                        <p className="job-progress-phase">{reviewBusyCopy.title}</p>
                        <p className="muted text-small" style={{ margin: 0 }}>
                          {reviewBusyCopy.detail}
                        </p>
                      </div>
                    </div>
                    <div
                      className="job-progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuetext={reviewBusyCopy.title}
                      aria-label={reviewBusyCopy.title}
                    >
                      <div className="job-progress-fill" style={{ width: "100%" }} />
                    </div>
                    <div className="job-progress-meta">
                      <span>Updating your preview</span>
                      <span>Runs in background</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <section
                className="card review-controls-section"
                style={{
                  opacity: reviewBusy ? 0.72 : 1,
                  transition: "opacity 0.2s ease",
                }}
              >
                <div className="review-controls-header">
                  <div className="stack" style={{ gap: "8px" }}>
                    <span className="badge">Controls</span>
                    <div>
                      <h3 className="label" style={{ marginBottom: "6px" }}>
                        Shape the guitar preview
                      </h3>
                      <p className="muted text-small" style={{ margin: 0 }}>
                        Adjust as needed, then continue.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="review-slider-grid">
                  {REVIEW_SLIDERS.map((slider) => (
                    <div key={slider.key} className="review-slider-card">
                      <div className="review-slider-header">
                        <div className="stack" style={{ gap: "4px" }}>
                          <p style={{ margin: 0, fontWeight: 600 }}>{slider.label}</p>
                          <p className="muted text-small" style={{ margin: 0 }}>
                            {slider.description}
                          </p>
                        </div>
                        <span className="badge">{slider.format(reviewParams[slider.key])}</span>
                      </div>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={slider.step}
                        value={reviewParams[slider.key]}
                        disabled={reviewBusy}
                        onChange={(event) => handleReviewParamChange(slider.key, Number(event.target.value))}
                        className="review-slider-input"
                      />
                      <div className="job-progress-meta" style={{ justifyContent: "space-between" }}>
                        <span>{slider.format(slider.min)}</span>
                        <span>{slider.format(slider.max)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {reviewError ? <div className="error">{reviewError}</div> : null}

              <div className="button-row review-actions">
                <button
                  type="button"
                  onClick={() => void handleRedoTranscription()}
                  className="button-secondary button-small"
                  disabled={reviewBusy}
                >
                  {reviewAction === "redo" ? "Updating..." : "Update sound"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleContinue()}
                  className="button-primary button-small"
                  disabled={reviewBusy}
                >
                  {reviewAction === "finalize" ? "Building tabs..." : "Continue to tabs"}
                </button>
                <button type="button" onClick={handleRestart} className="button-ghost button-small" disabled={reviewBusy}>
                  Start over
                </button>
              </div>
            </div>
          ) : (
            <JobStatusLayout
              job={displayJob}
              pendingPresentation={pendingPresentation}
              onImportToEditor={canImportToEditor ? () => void handleImportToEditor() : null}
              importBusy={importBusy}
              importButtonLabel={importButtonLabel}
              importError={importError}
              onDownloadTabs={handleDownloadTabs}
              onRestart={handleRestart}
              hasWatchedAd={hasWatchedAd}
              showAdGate={showAdGate}
              onRetryAd={() => setAdContainerKey((current) => current + 1)}
              adContainerKey={adContainerKey}
              onSkipAd={handleSkipAd}
              showFallbackVideo={showFallbackVideo}
              enablePrimis={ADS_AVAILABLE}
              onVideoComplete={handleVideoComplete}
              shareUrls={hasWatchedAd ? shareUrls : null}
            />
          )}
        </div>
      </main>
    </>
  );
}
