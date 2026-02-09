import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import JobStatusLayout, { JobResponse } from "../../components/JobStatusLayout";
import { saveJobToHistory } from "../../lib/history";
import { getAppBaseUrl } from "../../lib/urls";

const POLL_INTERVAL = 3000;
const PRIMIS_CHANNEL_ID = "YOUR_PRIMIS_CHANNEL_ID";
const ADS_AVAILABLE = PRIMIS_CHANNEL_ID && PRIMIS_CHANNEL_ID !== "YOUR_PRIMIS_CHANNEL_ID";

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
    if (job?.status === "done") {
      if (!hasWatchedAd && ADS_AVAILABLE) setLoadAdScript(true);
      if (!savedHistory && job_id && typeof job_id === "string") {
        saveJobToHistory({
          jobId: job_id,
          songTitle: job.song_title,
          artist: job.artist,
          createdAt: new Date().toISOString(),
        });
        setSavedHistory(true);
      }
    }
  }, [job?.status, hasWatchedAd, savedHistory, job_id, job?.song_title, job?.artist]);

  useEffect(() => {
    setHasWatchedAd(false);
    setShowFallbackVideo(true);
    setLoadAdScript(false);
    setAdContainerKey(0);
  }, [job_id]);

  useEffect(() => {
    if (job?.status !== "done" || !job_id) return;
    const resolvedTabId =
      (job as any).tab_job_id ||
      (job as any).tabJobId ||
      (job as any).tab_id ||
      (job as any).tabId ||
      (job as any)?.result?.tab_job_id ||
      (job as any)?.result?.tabJobId;
    const resolvedGteId =
      (job as any).gte_editor_id ||
      (job as any).gteEditorId ||
      (job as any)?.result?.gte_editor_id ||
      (job as any)?.result?.gteEditorId;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (resolvedGteId) {
      router.replace(`/gte/${resolvedGteId}`);
      return;
    }
    if (resolvedTabId) {
      router.replace(`/tabs/${resolvedTabId}`);
    }
  }, [job?.status, job_id, job, router]);

  useEffect(() => {
    if (job?.status !== "done" || !job_id) return;
    const base =
      typeof window !== "undefined"
        ? window.location.href
        : `${getAppBaseUrl()}/job/${job_id}`;
    const text = encodeURIComponent("Check out these tabs I generated with Note2Tabs!");
    setShareUrls({
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(base)}`,
      reddit: `https://reddit.com/submit?url=${encodeURIComponent(base)}&title=${text}`,
    });
  }, [job?.status, job_id]);

  useEffect(() => {
    if (job?.status === "done" && !savedHistory && job_id && typeof job_id === "string") {
      saveJobToHistory({
        jobId: job_id,
        songTitle: job.song_title,
        artist: job.artist,
        createdAt: new Date().toISOString(),
      });
      setSavedHistory(true);
    }
  }, [job?.status, savedHistory, job_id, job?.song_title, job?.artist]);

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
    const content = job?.tab_text || "";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${job?.song_title || "note2tabs"}.txt`;
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

  const showAdGate = job?.status === "done" && !hasWatchedAd;
  const title =
    job?.status === "done" && job?.song_title
      ? `${job.song_title} - Note2Tabs`
      : job?.status === "done"
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
            job={job}
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
