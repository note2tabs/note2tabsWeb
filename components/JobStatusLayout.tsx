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
  tab_job_id?: string | null;
  tab_id?: string | null;
  gte_editor_id?: string | null;
  result?: Record<string, any> | null;
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
      <div className="card">
        <div className="stack" style={{ gap: "10px" }}>
          <span className="badge">Analyzing audio</span>
          <p className="muted text-small">
            Separating guitar stems and generating tabs. This usually takes less than a minute.
          </p>
        </div>
      </div>
    );
  }

  if (job.status === "error") {
    return (
      <div className="card">
        <p style={{ fontWeight: 600, margin: 0 }}>Something went wrong.</p>
        <p className="muted text-small" style={{ margin: "8px 0 0" }}>
          {job.error_message || "Please try again."}
        </p>
        <div className="button-row" style={{ marginTop: "16px" }}>
          <button type="button" onClick={onRestart} className="button-primary button-small">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  const hasAudio = Boolean(job.audio_preview_url);
  const stems = job.stems || [];

  if (showAdGate && !hasWatchedAd) {
    return (
      <div className="card stack">
        <div className="stack" style={{ gap: "6px" }}>
          <h2 style={{ margin: 0 }}>Watch a short video to unlock your tabs</h2>
          <p className="muted text-small">The tab will unlock automatically when the video ends.</p>
        </div>
        <div className="stack" style={{ maxWidth: "560px" }}>
          <video
            key={adContainerKey}
            src="/video.mp4"
            controls
            className="card-outline"
            onEnded={onVideoComplete}
            onError={onSkipAd}
          />
          {enablePrimis && showFallbackVideo && (
            <div
              key={`${adContainerKey}-primis`}
              id="primis-ad-container"
              className="card-outline"
            />
          )}
        </div>
        <div className="button-row">
          {enablePrimis && (
            <button type="button" onClick={onRetryAd} className="button-secondary button-small">
              Retry ad
            </button>
          )}
          <button type="button" onClick={onSkipAd} className="button-secondary button-small">
            Skip ad (unlock now)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="page-header" style={{ gap: "12px" }}>
          <p style={{ fontWeight: 600, margin: 0 }}>
            {job.song_title || "Untitled"} {job.artist ? <span className="muted">- {job.artist}</span> : null}
          </p>
          <span className="badge">Ready</span>
        </div>
      </div>

      <div className="stack" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="card stack">
          <div>
            <h3 className="label">Preview</h3>
            {hasAudio ? (
              <audio controls src={job.audio_preview_url || undefined} className="card-outline">
                Your browser does not support the audio element.
              </audio>
            ) : (
              <p className="muted text-small">No audio preview available.</p>
            )}
          </div>
          <StemsList stems={stems.filter(Boolean) as Stem[]} />
        </div>

        <div className="card">
          <TabViewer tabText={job.tab_text || ""} songTitle={job.song_title || undefined} />
        </div>
      </div>

      <div className="button-row">
        <button type="button" onClick={onDownloadTabs} className="button-secondary button-small">
          Download Tab (TXT)
        </button>
        <button type="button" onClick={onRestart} className="button-primary button-small">
          Start a new transcription
        </button>
        {shareUrls && (
          <div className="button-row">
            <a
              href={shareUrls.twitter}
              target="_blank"
              rel="noreferrer"
              className="button-secondary button-small"
            >
              Share on X
            </a>
            <a
              href={shareUrls.reddit}
              target="_blank"
              rel="noreferrer"
              className="button-secondary button-small"
            >
              Share on Reddit
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
