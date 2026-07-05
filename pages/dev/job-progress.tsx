import { useMemo, useState } from "react";
import JobStatusLayout, {
  type JobResponse,
  type PendingJobPresentation,
} from "../../components/JobStatusLayout";
import NoIndexHead from "../../components/NoIndexHead";

const PREVIEW_STATES = [
  {
    key: "queued",
    label: "Preview 1",
    jobStatus: "queued",
    phaseLabel: "Transcription is running",
    progressPercent: 8,
  },
  {
    key: "preparing",
    label: "Preview 2",
    jobStatus: "processing",
    phaseLabel: "Transcription is running",
    progressPercent: 28,
  },
  {
    key: "transcribing",
    label: "Preview 3",
    jobStatus: "running",
    phaseLabel: "Transcription is running",
    progressPercent: 62,
  },
  {
    key: "tabs",
    label: "Preview 4",
    jobStatus: "processing",
    phaseLabel: "Transcription is running",
    progressPercent: 88,
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
      currentStepDetail: "Your transcription is still running. This page updates automatically.",
      createdAt: new Date(Date.now() - 38_000).toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [previewState]
  );

  const pendingPresentation = useMemo<PendingJobPresentation>(
    () => ({
      badgeLabel: "Loading",
      phaseLabel: previewState.phaseLabel,
      detail: "Your transcription is still running. This page updates automatically.",
      progressPercent: previewState.progressPercent,
      elapsedLabel: "",
      typicalDurationLabel: "",
      stepSummary: null,
      stages: [],
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
          <section className="card stack">
            <label className="form-group">
              <span className="label">Preview timing</span>
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
