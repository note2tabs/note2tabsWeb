import { useMemo, useState } from "react";
import JobStatusLayout, {
  type JobResponse,
  type PendingJobPresentation,
} from "../../components/JobStatusLayout";
import NoIndexHead from "../../components/NoIndexHead";

const PREVIEW_STATES = [
  {
    key: "queued",
    label: "Queued",
    jobStatus: "queued",
    badgeLabel: "In line",
    phaseLabel: "Waiting for transcription worker",
    detail: "Your request is saved and will start automatically when a worker is ready.",
    progressPercent: 8,
    elapsedLabel: "Just started",
    stepSummary: "Queued",
    stages: [
      { label: "Queued", state: "active" },
      { label: "Preparing audio", state: "upcoming" },
      { label: "Finding notes", state: "upcoming" },
      { label: "Writing tabs", state: "upcoming" },
    ],
  },
  {
    key: "preparing",
    label: "Preparing audio",
    jobStatus: "processing",
    badgeLabel: "Working",
    phaseLabel: "Preparing audio",
    detail: "We are reading the audio and preparing it for transcription.",
    progressPercent: 28,
    elapsedLabel: "About 12 seconds elapsed",
    stepSummary: "Audio setup",
    stages: [
      { label: "Queued", state: "complete" },
      { label: "Preparing audio", state: "active" },
      { label: "Finding notes", state: "upcoming" },
      { label: "Writing tabs", state: "upcoming" },
    ],
  },
  {
    key: "transcribing",
    label: "Transcribing",
    jobStatus: "running",
    badgeLabel: "Working",
    phaseLabel: "Finding guitar notes",
    detail: "The backend is listening for notes and estimating timing.",
    progressPercent: 62,
    elapsedLabel: "About 38 seconds elapsed",
    stepSummary: "Note detection",
    stages: [
      { label: "Queued", state: "complete" },
      { label: "Preparing audio", state: "complete" },
      { label: "Finding notes", state: "active" },
      { label: "Writing tabs", state: "upcoming" },
    ],
  },
  {
    key: "tabs",
    label: "Writing tabs",
    jobStatus: "processing",
    badgeLabel: "Almost there",
    phaseLabel: "Writing guitar tabs",
    detail: "We are arranging the detected notes into editable guitar tablature.",
    progressPercent: 88,
    elapsedLabel: "About 56 seconds elapsed",
    stepSummary: "Tab generation",
    stages: [
      { label: "Queued", state: "complete" },
      { label: "Preparing audio", state: "complete" },
      { label: "Finding notes", state: "complete" },
      { label: "Writing tabs", state: "active" },
    ],
  },
] as const;

export default function JobProgressPreviewPage() {
  const [stateKey, setStateKey] = useState<(typeof PREVIEW_STATES)[number]["key"]>("transcribing");
  const previewState = PREVIEW_STATES.find((item) => item.key === stateKey) || PREVIEW_STATES[0];

  const job = useMemo<JobResponse>(
    () => ({
      job_id: "preview-job",
      status: previewState.jobStatus as JobResponse["status"],
      song_title: "Preview transcription",
      artist: "Note2Tabs",
      progress: previewState.progressPercent,
      currentStepLabel: previewState.phaseLabel,
      currentStepDetail: previewState.detail,
      createdAt: new Date(Date.now() - 38_000).toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [previewState]
  );

  const pendingPresentation = useMemo<PendingJobPresentation>(
    () => ({
      badgeLabel: previewState.badgeLabel,
      phaseLabel: previewState.phaseLabel,
      detail: previewState.detail,
      progressPercent: previewState.progressPercent,
      elapsedLabel: previewState.elapsedLabel,
      typicalDurationLabel: "Usually under a minute",
      stepSummary: previewState.stepSummary,
      stages: previewState.stages.map((stage) => ({
        label: stage.label,
        state: stage.state,
      })),
    }),
    [previewState]
  );

  return (
    <>
      <NoIndexHead
        title="Job Progress Preview | Note2Tabs"
        canonicalPath="/dev/job-progress"
        description="Internal preview for transcription progress states."
      />
      <main className="page page-tight">
        <div className="container stack">
          <div className="page-header">
            <div>
              <h1 className="page-title">Job Progress Preview</h1>
              <p className="page-subtitle">Preview the backend transcription progress page without starting a job.</p>
            </div>
          </div>

          <section className="card stack">
            <label className="form-group">
              <span className="label">Progress state</span>
              <select
                className="form-select"
                value={stateKey}
                onChange={(event) => setStateKey(event.target.value as typeof stateKey)}
              >
                {PREVIEW_STATES.map((state) => (
                  <option key={state.key} value={state.key}>
                    {state.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <JobStatusLayout
            job={job}
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
        </div>
      </main>
    </>
  );
}
