import TabViewer from "./TabViewer";
import StemsList from "./StemsList";

export type JobStatus = "pending" | "processing" | "done" | "error";

export type Stem = {
  name: string;
  url: string;
};

export type JobResponse = {
  job_id: string;
  status: JobStatus;
  song_title?: string | null;
  artist?: string | null;
  tab_text?: string | null;
  audio_preview_url?: string | null;
  stems?: Stem[] | null;
  error_message?: string | null;
};

type JobStatusLayoutProps = {
  job: JobResponse | null;
  onRestart: () => void;
  onDownloadTabs: () => void;
  hasWatchedAd: boolean;
  showAdGate: boolean;
  onRetryAd: () => void;
  adContainerKey: number;
  onSkipAd: () => void;
  showFallbackVideo: boolean;
  enablePrimis?: boolean;
  onVideoComplete: () => void;
  shareUrls?: { twitter: string; reddit: string } | null;
};

export default function JobStatusLayout({
  job,
  onRestart,
  onDownloadTabs,
  hasWatchedAd,
  showAdGate,
  onRetryAd,
  adContainerKey,
  onSkipAd,
  showFallbackVideo,
  enablePrimis = false,
  onVideoComplete,
  shareUrls,
}: JobStatusLayoutProps) {
  if (!job || job.status === "pending" || job.status === "processing") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
          <div>
            <p className="text-sm font-semibold text-gray-800">Analyzing audio…</p>
            <p className="text-xs text-gray-600">
              Separating guitar stems and generating tabs. This usually takes less than a minute.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (job.status === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-base font-semibold text-red-700">Something went wrong.</p>
        <p className="mt-2 text-sm text-red-600">{job.error_message || "Please try again."}</p>
        <button
          type="button"
          onClick={onRestart}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Back to home
        </button>
      </div>
    );
  }

  const hasAudio = Boolean(job.audio_preview_url);
  const stems = job.stems || [];

  if (showAdGate && !hasWatchedAd) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Watch this short video to unlock your guitar tabs</h2>
        <p className="text-sm text-gray-600">The tab will unlock automatically when the video ends.</p>
        <div className="w-full max-w-xl mx-auto space-y-3">
          <video
            key={adContainerKey}
            src="/video.mp4"
            controls
            className="w-full rounded-lg border border-gray-200 bg-gray-50"
            onEnded={onVideoComplete}
            onError={onSkipAd}
          />
          {enablePrimis && showFallbackVideo && (
            <div
              key={`${adContainerKey}-primis`}
              id="primis-ad-container"
              className="w-full max-w-xl mx-auto rounded-lg border border-gray-200 bg-gray-50 p-2"
            />
          )}
        </div>
        {enablePrimis && (
          <button
            type="button"
            onClick={onRetryAd}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:border-blue-500 hover:text-blue-600"
          >
            Retry ad
          </button>
        )}
        <button
          type="button"
          onClick={onSkipAd}
          className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
        >
          Skip ad (unlock now)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-lg font-semibold text-gray-900">
            {job.song_title || "Untitled"}{" "}
            {job.artist ? <span className="text-gray-600">– {job.artist}</span> : null}
          </p>
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
            Ready
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Preview</h3>
            {hasAudio ? (
              <audio
                controls
                src={job.audio_preview_url || undefined}
                className="mt-3 w-full"
              >
                Your browser does not support the audio element.
              </audio>
            ) : (
              <p className="mt-3 text-sm text-gray-600">No audio preview available.</p>
            )}
          </div>
          <StemsList stems={stems.filter(Boolean) as Stem[]} />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <TabViewer tabText={job.tab_text || ""} songTitle={job.song_title || undefined} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onDownloadTabs}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:border-blue-500 hover:text-blue-600"
        >
          Download Tab (TXT)
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Start a new transcription
        </button>
        {shareUrls && (
          <div className="flex flex-wrap gap-2">
            <a
              href={shareUrls.twitter}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-800 hover:border-blue-500 hover:text-blue-600"
            >
              Share on X
            </a>
            <a
              href={shareUrls.reddit}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-800 hover:border-blue-500 hover:text-blue-600"
            >
              Share on Reddit
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
