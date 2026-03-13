import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import JobStatusLayout, { JobResponse } from "../../components/JobStatusLayout";
import { saveJobToHistory } from "../../lib/history";
import { tabsToTabText } from "../../lib/tabTextToStamps";
import { getAppBaseUrl } from "../../lib/urls";

const POLL_INTERVAL = 3000;
const PRIMIS_CHANNEL_ID = "YOUR_PRIMIS_CHANNEL_ID";
const ADS_AVAILABLE = PRIMIS_CHANNEL_ID && PRIMIS_CHANNEL_ID !== "YOUR_PRIMIS_CHANNEL_ID";

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
  if (!Array.isArray(value)) return "";
  const segments = value
    .map((segment) =>
      Array.isArray(segment)
        ? segment.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
        : []
    )
    .filter((segment) => segment.length > 0);
  return segments.length > 0 ? tabsToTabText(segments) : "";
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
  const displayJob = useMemo(() => normalizeJobForDisplay(job), [job]);

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
    const resolvedGteId = getFirstJobValue(displayJob, ["gte_editor_id", "gteEditorId"]);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (typeof resolvedGteId === "string" && resolvedGteId) {
      router.replace(`/gte/${resolvedGteId}`);
      return;
    }
    if (typeof resolvedTabId === "string" && resolvedTabId) {
      router.replace(`/tabs/${resolvedTabId}`);
    }
  }, [displayJob?.status, job_id, displayJob, router]);

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
