import AdvertisementSlot from "../../components/AdvertisementSlot";
import JobStatusLayout, { type JobResponse, type PendingJobPresentation } from "../../components/JobStatusLayout";
import NoIndexHead from "../../components/NoIndexHead";

const previewJob: JobResponse = {
  job_id: "ad-placement-preview",
  status: "processing",
  progress: 54,
};

const previewProgress: PendingJobPresentation = {
  badgeLabel: "Working",
  phaseLabel: "Finding the notes",
  detail: "Listening closely and turning the recording into an editable tab.",
  progressPercent: 54,
  elapsedLabel: "Elapsed 42s",
  typicalDurationLabel: "54%",
  stepSummary: "Step 3 of 5",
  stages: [
    { label: "Get audio ready", state: "complete" },
    { label: "Focus on guitar", state: "complete" },
    { label: "Find the notes", state: "active" },
    { label: "Build your tab", state: "upcoming" },
    { label: "Get preview ready", state: "upcoming" },
  ],
};

export default function AdPlacementsPreviewPage() {
  return (
    <>
      <NoIndexHead title="Ad placement review | Note2Tabs" canonicalPath="/dev/ad-placements" />
      <main className="page page-tight">
        <div className="container stack">
          <header className="page-header">
            <div>
              <p className="eyebrow">Review only</p>
              <h1 className="page-title">Ad placements</h1>
              <p className="muted">No ad network is loaded on this page. Resize the browser to review mobile behavior.</p>
            </div>
          </header>

          <section className="stack">
            <div>
              <h2 className="section-title">Transcription processing</h2>
              <p className="muted text-small">In production this appears after 12 seconds for eligible free users.</p>
            </div>
            <JobStatusLayout
              job={previewJob}
              pendingPresentation={previewProgress}
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
            <AdvertisementSlot placement="transcription-loading" preview />
          </section>

          <section className="stack">
            <div>
              <h2 className="section-title">Free editor</h2>
              <p className="muted text-small">A single quiet unit above the workspace. Premium and Practice mode remain ad-free.</p>
            </div>
            <div className="card stack" style={{ padding: 16 }}>
              <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                <strong className="text-slate-800">Untitled tab</strong>
                <span>120 BPM · 4/4</span>
              </div>
              <AdvertisementSlot placement="editor" preview />
              <div className="rounded-xl border border-slate-200 bg-white p-4" aria-hidden="true">
                <div className="grid gap-3 opacity-60">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} className="block h-px bg-slate-300" />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
