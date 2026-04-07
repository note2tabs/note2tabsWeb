import TabViewer from "./TabViewer";
import StemsList from "./StemsList";

export type JobStatus = "queued" | "pending" | "processing" | "running" | "done" | "error" | "failed";

export type Stem = {
  name: string;
  url: string;
};

export type JobResponse = {
  job_id: string;
  status: JobStatus;
  type?: string | null;
  rawStatus?: string | null;
  progress?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  workflowState?: string | null;
  currentStepKey?: string | null;
  currentStepLabel?: string | null;
  currentStepDetail?: string | null;
  steps?: Array<Record<string, any>> | null;
  attempts?: number | null;
  lastError?: string | null;
  output?: Record<string, any> | null;
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

export type PendingJobStage = {
  label: string;
  state: "complete" | "active" | "upcoming";
};

export type PendingJobPresentation = {
  badgeLabel: string;
  phaseLabel: string;
  detail: string;
  progressPercent: number;
  elapsedLabel: string;
  typicalDurationLabel: string;
  stepSummary?: string | null;
  attemptLabel?: string | null;
  warningLabel?: string | null;
  stages: PendingJobStage[];
};

type JobStatusLayoutProps = {
  job: JobResponse | null;
  pendingPresentation?: PendingJobPresentation | null;
  onRestart: () => void;
  onDownloadTabs: () => void;
  onImportToEditor?: (() => void) | null;
  importBusy?: boolean;
  importButtonLabel?: string;
  importError?: string | null;
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
  pendingPresentation,
  onRestart,
  onDownloadTabs,
  onImportToEditor,
  importBusy = false,
  importButtonLabel = "Import to editor",
  importError,
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
  if (!job || job.status === "queued" || job.status === "pending" || job.status === "processing" || job.status === "running") {
    const pending = pendingPresentation;
    const currentStage =
      pending?.stages.find((stage) => stage.state === "active") ||
      pending?.stages.find((stage) => stage.state === "complete") ||
      null;
    const nextStage = pending?.stages.find((stage) => stage.state === "upcoming") || null;
    const workingOnLabel = job?.song_title
      ? `${job.song_title}${job.artist ? ` - ${job.artist}` : ""}`
      : "Your track";
    const currentStepLabel = currentStage?.label || pending?.phaseLabel || "Preparing";
    const nextStepLabel =
      nextStage?.label || (pending?.progressPercent && pending.progressPercent >= 92 ? "Almost there" : "Next step");
    const updateLabel =
      pending?.badgeLabel === "In line"
        ? "Queue status updates automatically."
        : "Updates every few seconds. The next screen opens when ready.";
    return (
      <div className="card">
        <div className="job-progress-shell">
          <div className="job-progress-header">
            <div className="stack" style={{ gap: "8px" }}>
              <span className="badge">{pending?.badgeLabel || "Working"}</span>
              <p className="job-progress-phase">{pending?.phaseLabel || "Preparing tabs"}</p>
              <p className="muted text-small" style={{ margin: 0 }}>
                {pending?.detail || "This usually takes under a minute."}
              </p>
            </div>
            {pending ? (
              <div className="job-progress-stat">
                <span className="job-progress-value">{pending.progressPercent}%</span>
                {pending.stepSummary ? <span className="muted text-small">{pending.stepSummary}</span> : null}
              </div>
            ) : null}
          </div>
          {pending ? (
            <>
              <div
                className="job-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pending.progressPercent}
                aria-label="Job progress"
              >
                <div className="job-progress-fill" style={{ width: `${pending.progressPercent}%` }} />
              </div>
              <div className="job-progress-meta">
                <span>{pending.elapsedLabel}</span>
                {pending.typicalDurationLabel ? <span>{pending.typicalDurationLabel}</span> : null}
              </div>
              <div className="job-progress-facts" aria-label="Processing details">
                <div className="job-progress-fact">
                  <span className="job-progress-fact-label">Working on</span>
                  <strong className="job-progress-fact-value">{workingOnLabel}</strong>
                </div>
                <div className="job-progress-fact">
                  <span className="job-progress-fact-label">Current step</span>
                  <strong className="job-progress-fact-value">{currentStepLabel}</strong>
                </div>
                <div className="job-progress-fact">
                  <span className="job-progress-fact-label">Up next</span>
                  <strong className="job-progress-fact-value">{nextStepLabel}</strong>
                  {pending.typicalDurationLabel ? (
                    <span className="job-progress-fact-note">{pending.typicalDurationLabel}</span>
                  ) : null}
                </div>
              </div>
              <div className="job-progress-note">
                <p>{updateLabel}</p>
              </div>
              {pending.attemptLabel ? (
                <p className="muted text-small" style={{ margin: 0 }}>
                  {pending.attemptLabel}
                </p>
              ) : null}
              {pending.warningLabel ? <p className="job-progress-warning">{pending.warningLabel}</p> : null}
              <div className="job-progress-steps" aria-label="Processing stages">
                {pending.stages.map((stage) => (
                  <span key={stage.label} className={`job-progress-step is-${stage.state}`}>
                    {stage.label}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  if (job.status === "error" || job.status === "failed") {
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
        {onImportToEditor && (
          <button type="button" onClick={onImportToEditor} className="button-primary button-small" disabled={importBusy}>
            {importBusy ? "Importing..." : importButtonLabel}
          </button>
        )}
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
      {importError ? <div className="error">{importError}</div> : null}
    </div>
  );
}
