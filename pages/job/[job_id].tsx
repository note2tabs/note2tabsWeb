import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import JobStatusLayout, { JobResponse } from "../../components/JobStatusLayout";
import Header from "../../components/Header";
import { saveJobToHistory } from "../../lib/history";
import { apiFetch } from "../../lib/apiClient";

const POLL_INTERVAL = 3000;
const PRIMIS_CHANNEL_ID = process.env.NEXT_PUBLIC_PRIMIS_CHANNEL_ID || "";
const ADS_AVAILABLE = Boolean(PRIMIS_CHANNEL_ID);

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
  const [savedTabId, setSavedTabId] = useState<string | null>(null);
  const [shareUrls, setShareUrls] = useState<{ twitter: string; reddit: string } | null>(null);
  const adStorageKey = typeof job_id === "string" ? `note2tabs_ad_watched_${job_id}` : "";

  const fetchJob = async (id: string) => {
    try {
      const data = await apiFetch<JobResponse>(`/api/backend/v1/jobs/${id}`, {
        method: "GET",
        retries: 1,
      });
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
        jobId: id,
        status: "error",
        error: { message: "Could not fetch job status." },
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
          songTitle: job.result?.sourceLabel || undefined,
          createdAt: new Date().toISOString(),
        });
        setSavedHistory(true);
      }
    }
  }, [job?.status, hasWatchedAd, savedHistory, job_id, job?.result?.sourceLabel]);

  useEffect(() => {
    if (job?.status !== "done" || savedTabId) return;
    const tabStrings = job.result?.tabStrings;
    if (!tabStrings || tabStrings.length === 0) return;
    const save = async () => {
      try {
        const payload = {
          sourceLabel: job.result?.sourceLabel,
          sourceType: "JOB",
          durationSec: job.result?.durationSec,
          resultJson: JSON.stringify(tabStrings),
        };
        const response = await fetch("/api/tabs/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data?.jobId) {
          setSavedTabId(data.jobId);
        }
      } catch (err) {
        // silently ignore save failures
      }
    };
    void save();
  }, [job?.status, savedTabId, job?.result?.tabStrings, job?.result?.sourceLabel, job?.result?.durationSec]);

  // Reset ad gate when job changes
  useEffect(() => {
    setHasWatchedAd(false);
    setShowFallbackVideo(true);
    setLoadAdScript(false);
    setAdContainerKey(0);
  }, [job_id]);

  // Compute share URLs once job is done
  useEffect(() => {
    if (job?.status !== "done" || !job_id) return;
    const base =
      typeof window !== "undefined"
        ? window.location.href
        : `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/job/${job_id}`;
    const text = encodeURIComponent(`Check out these tabs I generated with Note2Tabs!`);
    setShareUrls({
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(base)}`,
      reddit: `https://reddit.com/submit?url=${encodeURIComponent(base)}&title=${text}`
    });
  }, [job?.status, job_id]);

  // Fallback to ensure history is captured even if other effects miss
  useEffect(() => {
    if (job?.status === "done" && !savedHistory && job_id && typeof job_id === "string") {
      saveJobToHistory({
        jobId: job_id,
        songTitle: job.result?.sourceLabel || undefined,
        createdAt: new Date().toISOString()
      });
      setSavedHistory(true);
    }
  }, [job?.status, savedHistory, job_id, job?.result?.sourceLabel]);

  useEffect(() => {
    if (!loadAdScript) return;
    const handleEnd = () => {
      setHasWatchedAd(true);
      if (adStorageKey && typeof window !== "undefined") {
        window.localStorage.setItem(adStorageKey, "true");
      }
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
  }, [loadAdScript, adStorageKey]);

  const handleDownloadTabs = () => {
    const content = job?.result?.tabStrings
      ? job.result.tabStrings.map((segment) => segment.join("\n")).join("\n\n")
      : "";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${job?.result?.sourceLabel || "note2tabs"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestart = () => router.push("/");
  const handleSkipAd = () => {
    setHasWatchedAd(true);
    if (adStorageKey && typeof window !== "undefined") {
      window.localStorage.setItem(adStorageKey, "true");
    }
  };
  const handleVideoComplete = () => {
    handleSkipAd();
  };

  const showAdGate = job?.status === "done" && !hasWatchedAd;
  const title =
    job?.status === "done" && job?.result?.sourceLabel
      ? `${job.result.sourceLabel} – Note2Tabs`
      : job?.status === "done"
      ? "Tabs Ready – Note2Tabs"
      : "Processing – Note2Tabs";

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
      <Header />
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              ← Back
            </button>
            <p className="text-sm text-gray-600">Job ID: {job_id}</p>
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
            audioPreviewUrl={job?.status === "done" ? `/api/backend/v1/jobs/${job?.jobId}/download` : null}
            editorIds={job?.result?.editorIds || []}
          />
          {savedTabId && (
            <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Saved to your library.{" "}
              <a href={`/tabs/${savedTabId}`} className="underline underline-offset-2">
                View tab
              </a>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }
  return { props: {} };
};
