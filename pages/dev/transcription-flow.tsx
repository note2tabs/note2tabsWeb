import { useEffect, useMemo, useState, type CSSProperties } from "react";
import JobStatusLayout, {
  type JobResponse,
  type PendingJobPresentation,
} from "../../components/JobStatusLayout";
import NoIndexHead from "../../components/NoIndexHead";
import TranscriptionStartStatus from "../../components/TranscriptionStartStatus";

type PreviewStage = "file-start" | "youtube-start" | "queued" | "listening" | "tabbing" | "review" | "opening" | "error";

const STAGES: Array<{ key: PreviewStage; label: string }> = [
  { key: "file-start", label: "Upload starts" },
  { key: "youtube-start", label: "YouTube starts" },
  { key: "queued", label: "Progress: early" },
  { key: "listening", label: "Progress: listening" },
  { key: "tabbing", label: "Progress: writing tabs" },
  { key: "review", label: "Review ready" },
  { key: "opening", label: "Opening editor" },
  { key: "error", label: "Error" },
];

const TAB_PREVIEW = `e|----------------|----------------|--------3---5---|7---5---3-------|
B|--------3---5---|6---5---3-------|----3-----------|----------6---5-|
G|----4-----------|----------5---4-|4h5---5---4-----|----------------|
D|5---------------|----------------|------------5---|----------------|
A|----------------|----------------|----------------|----------------|
E|----------------|----------------|----------------|----------------|`;

const PROGRESS_COPY: Record<PreviewStage, { progress: number; status: JobResponse["status"] }> = {
  "file-start": { progress: 4, status: "queued" },
  "youtube-start": { progress: 4, status: "queued" },
  queued: { progress: 12, status: "queued" },
  listening: { progress: 48, status: "running" },
  tabbing: { progress: 84, status: "processing" },
  review: { progress: 100, status: "done" },
  opening: { progress: 100, status: "done" },
  error: { progress: 0, status: "error" },
};

function buildPendingPresentation(stage: PreviewStage): PendingJobPresentation {
  const progress = PROGRESS_COPY[stage].progress;
  return {
    badgeLabel: "Loading",
    phaseLabel: "Transcription is running",
    detail: "Your transcription is still running. This page updates automatically.",
    progressPercent: progress,
    elapsedLabel: "Elapsed 38s",
    typicalDurationLabel: `${progress}%`,
    stepSummary: null,
    stages: [],
  };
}

function buildProgressJob(stage: PreviewStage): JobResponse {
  return {
    job_id: "simulated-transcription",
    status: PROGRESS_COPY[stage].status,
    song_title: "Midnight Practice Loop",
    artist: "Note2Tabs",
    progress: PROGRESS_COPY[stage].progress,
    currentStepLabel: "Transcription is running",
    currentStepDetail: "Your transcription is still running. This page updates automatically.",
    createdAt: new Date(Date.now() - 44_000).toISOString(),
    updatedAt: new Date().toISOString(),
    error_message: stage === "error" ? "The preview is showing the error state." : null,
  };
}

function InputStartPreview({ mode }: { mode: "file" | "youtube" }) {
  return (
    <section className="card stack" style={{ maxWidth: 760 }}>
      <div className="mode-switch" role="tablist" aria-label="Input mode preview">
        <button type="button" className={mode === "file" ? "active" : ""}>
          Audio file
        </button>
        <button type="button" className={mode === "youtube" ? "active" : ""}>
          YouTube link
        </button>
      </div>
      <div className="prompt-field">
        <TranscriptionStartStatus
          status={mode === "file" ? "Uploading audio..." : "Preparing YouTube download..."}
          compact
        />
        <div className="transcriber-checkbox-row">
          <label className="checkbox">
            <input type="checkbox" checked readOnly />
            <span>Does your audio include other instruments?</span>
          </label>
        </div>
      </div>
      <div className="prompt-actions">
        <button type="button" className="button-primary" disabled>
          {mode === "file" ? "Generating..." : "Downloading..."}
        </button>
      </div>
    </section>
  );
}

function ReviewPreview({ opening }: { opening: boolean }) {
  return (
    <div className="container stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Your tab is ready</h1>
        </div>
      </div>
      <div className="review-shell" aria-busy={opening}>
        <section className="card review-import-card">
          <div className="review-import-header">
            <div className="stack" style={{ gap: "8px" }}>
              <h2 className="review-hero-title">Midnight Practice Loop</h2>
            </div>
            <span className="review-count-pill">184 notes</span>
          </div>
          <div className="review-value-preview" aria-label="Tab preview">
            <p className="review-value-title">Preview</p>
            <pre>{TAB_PREVIEW}</pre>
          </div>
          <div className="review-import-options">
            <div className="review-editor-target">
              <p className="label" style={{ margin: 0 }}>
                Import to guitar tab editor
              </p>
              <select className="form-select" value="new" disabled={opening} onChange={() => {}}>
                <option value="new">New editor</option>
                <option value="acoustic">Acoustic idea</option>
              </select>
            </div>
          </div>
          <div className="button-row review-actions review-import-actions">
            <button type="button" className="button-primary button-small" disabled={opening}>
              {opening ? "Opening..." : "Open in editor"}
            </button>
            <p className="review-cta-note">You can edit everything after opening.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function TranscriptionFlowPreviewPage() {
  const [stage, setStage] = useState<PreviewStage>("file-start");
  const [playing, setPlaying] = useState(false);
  const stageIndex = STAGES.findIndex((item) => item.key === stage);
  const progressJob = useMemo(() => buildProgressJob(stage), [stage]);
  const pendingPresentation = useMemo(() => buildPendingPresentation(stage), [stage]);

  useEffect(() => {
    if (!playing) return undefined;
    const intervalId = window.setInterval(() => {
      setStage((current) => {
        const currentIndex = STAGES.findIndex((item) => item.key === current);
        return STAGES[(currentIndex + 1) % STAGES.length].key;
      });
    }, 3600);
    return () => window.clearInterval(intervalId);
  }, [playing]);

  const pageStyle = {
    "--thinking-shimmer-duration": "3s",
    "--thinking-shimmer-contrast": "1.18",
    "--thinking-shimmer-saturation": "1.3",
  } as CSSProperties;

  return (
    <>
      <NoIndexHead
        title="Transcription Flow Preview | Note2Tabs"
        canonicalPath="/dev/transcription-flow"
        description="Internal preview for the full transcription loading flow."
      />
      <main className="page page-tight" style={pageStyle}>
        <div className="container stack">
          <section className="card stack">
            <div className="button-row" style={{ justifyContent: "space-between" }}>
              <label className="form-group" style={{ minWidth: 260, margin: 0 }}>
                <span className="label">Preview stage</span>
                <select
                  className="form-select"
                  value={stage}
                  onChange={(event) => setStage(event.target.value as PreviewStage)}
                >
                  {STAGES.map((item, index) => (
                    <option key={item.key} value={item.key}>
                      {index + 1}. {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="button-secondary button-small" onClick={() => setPlaying((value) => !value)}>
                {playing ? "Pause" : "Play stages"}
              </button>
            </div>
            <p className="muted text-small" style={{ margin: 0 }}>
              Stage {stageIndex + 1} of {STAGES.length}
            </p>
          </section>

          {stage === "file-start" ? <InputStartPreview mode="file" /> : null}
          {stage === "youtube-start" ? <InputStartPreview mode="youtube" /> : null}
          {stage === "queued" || stage === "listening" || stage === "tabbing" ? (
            <JobStatusLayout
              job={progressJob}
              pendingPresentation={pendingPresentation}
              onRestart={() => {}}
              onDownloadTabs={() => {}}
              hasWatchedAd
              showAdGate={false}
              onRetryAd={() => {}}
              adContainerKey={0}
              onSkipAd={() => {}}
              showFallbackVideo={false}
              onVideoComplete={() => {}}
            />
          ) : null}
          {stage === "review" || stage === "opening" ? <ReviewPreview opening={stage === "opening"} /> : null}
          {stage === "error" ? (
            <JobStatusLayout
              job={progressJob}
              onRestart={() => {}}
              onDownloadTabs={() => {}}
              hasWatchedAd
              showAdGate={false}
              onRetryAd={() => {}}
              adContainerKey={0}
              onSkipAd={() => {}}
              showFallbackVideo={false}
              onVideoComplete={() => {}}
            />
          ) : null}
        </div>
      </main>
    </>
  );
}
