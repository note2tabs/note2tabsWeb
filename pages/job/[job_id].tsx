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
import { buildLaneEditorRef, gteApi } from "../../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../../lib/gteGuestDraft";
import { saveJobToHistory } from "../../lib/history";
import { normalizeTabSegments, tabSegmentsToStamps, tabsToTabText } from "../../lib/tabTextToStamps";
import { getAppBaseUrl } from "../../lib/urls";

const POLL_INTERVAL = 3000;
const PRIMIS_CHANNEL_ID = "YOUR_PRIMIS_CHANNEL_ID";
const ADS_AVAILABLE = PRIMIS_CHANNEL_ID && PRIMIS_CHANNEL_ID !== "YOUR_PRIMIS_CHANNEL_ID";
const PENDING_JOB_STATUSES = new Set(["queued", "pending", "processing", "running"]);

type JobModeHint = "FILE" | "YOUTUBE";
type PendingStageKey = "queue" | "download" | "prepare" | "separate" | "transcribe" | "format";

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

function buildPendingPresentation(
  job: JobResponse | null,
  nowMs: number,
  modeHint: JobModeHint | null,
  separateGuitarHint: boolean | null
): PendingJobPresentation | null {
  if (!job || !PENDING_JOB_STATUSES.has(job.status)) return null;

  const isQueued = job.status === "queued" || job.status === "pending";
  const isYoutube = modeHint === "YOUTUBE";
  const separateGuitar = separateGuitarHint ?? false;
  const progressValue = normalizeProgressValue(job.progress);
  const createdMs = parseIsoToMs(job.createdAt) ?? nowMs;
  const startedMs = parseIsoToMs(job.startedAt);
  const elapsedSeconds = Math.max(0, Math.round((nowMs - (startedMs ?? createdMs)) / 1000));
  const attempts = Number.isFinite(Number(job.attempts)) ? Math.max(0, Number(job.attempts)) : 0;

  const stageKeys: PendingStageKey[] = separateGuitar
    ? isYoutube
      ? (["download", "separate", "transcribe", "format"] as PendingStageKey[])
      : (["prepare", "separate", "transcribe", "format"] as PendingStageKey[])
    : isYoutube
    ? (["download", "transcribe", "format"] as PendingStageKey[])
    : (["prepare", "transcribe", "format"] as PendingStageKey[]);
  const stageThresholds = stageKeys.length === 4 ? [18, 56, 86, 100] : [28, 84, 100];
  const estimatedDurationSeconds = isYoutube
    ? separateGuitar
      ? 75
      : 48
    : separateGuitar
    ? 58
    : 32;

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
      phaseLabel: "Queued for processing",
      detail: "Your transcription is waiting for an available worker. It should start automatically in a few seconds.",
    },
    download: {
      phaseLabel: "Downloading the YouTube clip",
      detail: "Fetching the requested segment with the backend downloader and preparing it for analysis.",
    },
    prepare: {
      phaseLabel: "Preparing the audio",
      detail: "Loading the audio and getting it into the shared transcription pipeline.",
    },
    separate: {
      phaseLabel: "Separating the guitar stem",
      detail: "Running Demucs so the transcription focuses on the isolated guitar.",
    },
    transcribe: {
      phaseLabel: "Transcribing notes and timing",
      detail: "Analyzing pitch, timing, and note groupings to build the playable tab.",
    },
    format: {
      phaseLabel: "Finalizing the tab output",
      detail: "Compiling the detected notes into tab text and saving the finished result.",
    },
  } as const;

  const warningLabel =
    !isQueued && elapsedSeconds > estimatedDurationSeconds + 20
      ? "This job is taking longer than usual, but it is still running."
      : null;
  const attemptLabel =
    attempts > 1 ? `Worker attempt ${attempts}. The backend may be retrying after an earlier failure.` : null;

  return {
    badgeLabel: isQueued ? "Queued" : "Processing",
    phaseLabel: phaseCopy[activeStage].phaseLabel,
    detail: phaseCopy[activeStage].detail,
    progressPercent,
    elapsedLabel: `Elapsed ${formatDuration(elapsedSeconds)}`,
    typicalDurationLabel: separateGuitar
      ? isYoutube
        ? "Typical time: 45-90 seconds"
        : "Typical time: 35-70 seconds"
      : isYoutube
      ? "Typical time: 30-50 seconds"
      : "Typical time: under 30 seconds",
    attemptLabel,
    warningLabel,
    stages: stageKeys.map((stageKey, index) => ({
      label:
        stageKey === "download"
          ? "Download clip"
          : stageKey === "prepare"
          ? "Prepare audio"
          : stageKey === "separate"
          ? "Separate guitar"
          : stageKey === "transcribe"
          ? "Transcribe notes"
          : "Build tabs",
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

function getJobSources(job: JobResponse | null) {
  if (!job) return [] as Record<string, unknown>[];
  const direct = job as unknown as Record<string, unknown>;
  const output = direct.output as Record<string, unknown> | undefined;
  const result = direct.result as Record<string, unknown> | undefined;
  return [direct, output, result, output?.result as Record<string, unknown> | undefined, result?.output as Record<string, unknown> | undefined]
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
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
  const [progressClock, setProgressClock] = useState(() => Date.now());
  const displayJob = useMemo(() => normalizeJobForDisplay(job), [job]);
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
  const isSignedIn = Boolean(session);
  const canOpenGuestEditor = !isSignedIn && isLocalNoDbClientMode;
  const importButtonLabel = canOpenGuestEditor ? "Open in guest editor" : "Import to editor";
  const canImportToEditor = displayJob?.status === "done" && getJobTabSegments(displayJob).length > 0;
  const pendingPresentation = useMemo(
    () => buildPendingPresentation(displayJob, progressClock, modeHint, separateGuitarHint),
    [displayJob, progressClock, modeHint, separateGuitarHint]
  );

  const fetchJob = async (id: string) => {
    try {
      const response = await fetch(`/api/jobs/${id}`);
      if (!response.ok) throw new Error("Failed to fetch");
      const data: JobResponse = await response.json();
      setJob(data);
      if (data.status === "done" || data.status === "error") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch (err) {
      console.error(err);
      setJob((prev) => ({
        job_id: id,
        status: "error",
        error_message: "Could not fetch job status.",
      }));
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!job_id || typeof job_id !== "string") return;
    fetchJob(job_id);
    intervalRef.current = setInterval(() => fetchJob(job_id), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [job_id]);

  useEffect(() => {
    if (!displayJob || !PENDING_JOB_STATUSES.has(displayJob.status)) return;
    setProgressClock(Date.now());
    const tick = window.setInterval(() => setProgressClock(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [displayJob?.status, job_id]);

  useEffect(() => {
    if (displayJob?.status === "done") {
      if (!hasWatchedAd && ADS_AVAILABLE) setLoadAdScript(true);
      if (!savedHistory && job_id && typeof job_id === "string") {
        saveJobToHistory({
          jobId: job_id,
          songTitle: displayJob.song_title,
          artist: displayJob.artist,
          createdAt: new Date().toISOString(),
        });
        setSavedHistory(true);
      }
    }
  }, [displayJob?.status, hasWatchedAd, savedHistory, job_id, displayJob?.song_title, displayJob?.artist]);

  useEffect(() => {
    setHasWatchedAd(false);
    setShowFallbackVideo(true);
    setLoadAdScript(false);
    setAdContainerKey(0);
  }, [job_id]);

  useEffect(() => {
    if (displayJob?.status !== "done" || !job_id) return;
    const resolvedTabId = getFirstJobValue(displayJob, ["tab_job_id", "tabJobId", "tab_id", "tabId"]);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (typeof resolvedTabId === "string" && resolvedTabId) {
      router.replace(
        appendEditorId
          ? `/tabs/${resolvedTabId}?appendEditorId=${encodeURIComponent(appendEditorId)}`
          : `/tabs/${resolvedTabId}`
      );
    }
  }, [displayJob?.status, job_id, displayJob, router, appendEditorId]);

  useEffect(() => {
    if (displayJob?.status !== "done" || !job_id) return;
    const base =
      typeof window !== "undefined"
        ? window.location.href
        : `${getAppBaseUrl()}/job/${job_id}`;
    const text = encodeURIComponent("Check out these tabs I generated with Note2Tabs!");
    setShareUrls({
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(base)}`,
      reddit: `https://reddit.com/submit?url=${encodeURIComponent(base)}&title=${text}`,
    });
  }, [displayJob?.status, job_id]);

  useEffect(() => {
    if (displayJob?.status === "done" && !savedHistory && job_id && typeof job_id === "string") {
      saveJobToHistory({
        jobId: job_id,
        songTitle: displayJob.song_title,
        artist: displayJob.artist,
        createdAt: new Date().toISOString(),
      });
      setSavedHistory(true);
    }
  }, [displayJob?.status, savedHistory, job_id, displayJob?.song_title, displayJob?.artist]);

  useEffect(() => {
    if (!loadAdScript) return;
    const handleEnd = () => {
      setHasWatchedAd(true);
    };
    const handleRetry = () => {
      setAdContainerKey((k) => k + 1);
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
    const segments = getJobTabSegments(displayJob);
    if (segments.length === 0) {
      setImportError("No tabs are available to import into the editor.");
      return;
    }
    setImportBusy(true);
    setImportError(null);
    try {
      const { stamps, totalFrames } = tabSegmentsToStamps(segments);
      if (stamps.length === 0) {
        throw new Error("No playable tab notes were found in this transcription.");
      }
      if (canOpenGuestEditor) {
        const guestLaneEditorId = buildLaneEditorRef(GTE_GUEST_EDITOR_ID, "ed-1");
        await gteApi.deleteEditor(GTE_GUEST_EDITOR_ID).catch(() => {});
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
      const created = await gteApi.createEditor(undefined, displayJob.song_title || "Imported transcription");
      await gteApi.appendImportTab(created.editorId, { stamps, totalFrames });
      await router.push(`/gte/${created.editorId}?source=job`);
    } catch (err: any) {
      setImportError(err?.message || "Failed to import tabs into the editor.");
    } finally {
      setImportBusy(false);
    }
  };

  const handleRestart = () => router.push("/");
  const handleSkipAd = () => {
    setHasWatchedAd(true);
  };
  const handleVideoComplete = () => {
    handleSkipAd();
  };

  const showAdGate = displayJob?.status === "done" && !hasWatchedAd;
  const title =
    displayJob?.status === "done" && displayJob?.song_title
      ? `${displayJob.song_title} - Note2Tabs`
      : displayJob?.status === "done"
      ? "Tabs Ready - Note2Tabs"
      : "Processing - Note2Tabs";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="Processing your transcription job on Note2Tabs." />
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
              <h1 className="page-title">Job status</h1>
              <p className="page-subtitle">Job ID: {job_id}</p>
            </div>
            <button type="button" onClick={() => router.push("/")} className="button-ghost button-small">
              Back
            </button>
          </div>
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
            onRetryAd={() => setAdContainerKey((k) => k + 1)}
            adContainerKey={adContainerKey}
            onSkipAd={handleSkipAd}
            showFallbackVideo={showFallbackVideo}
            enablePrimis={ADS_AVAILABLE}
            onVideoComplete={handleVideoComplete}
            shareUrls={hasWatchedAd ? shareUrls : null}
          />
        </div>
      </main>
    </>
  );
}
