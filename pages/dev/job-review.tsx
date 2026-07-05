import { useMemo, useState } from "react";
import NoIndexHead from "../../components/NoIndexHead";

const EDITOR_CHOICES = [
  { id: "new", name: "New editor" },
  { id: "acoustic-idea", name: "Acoustic idea" },
  { id: "solo-draft", name: "Solo draft" },
] as const;

type PreviewState = "ready" | "importing" | "error" | "guest";

function getReviewBusyCopy(state: PreviewState) {
  if (state === "importing") {
    return {
      badge: "Importing",
      title: "Opening your tab",
      detail: "We are putting the notes into the editor.",
    };
  }
  return null;
}

export default function JobReviewPreviewPage() {
  const [previewState, setPreviewState] = useState<PreviewState>("ready");
  const [editorChoice, setEditorChoice] = useState("new");
  const reviewBusyCopy = useMemo(() => getReviewBusyCopy(previewState), [previewState]);
  const isImporting = previewState === "importing";
  const isGuest = previewState === "guest";
  const noteCount = 184;

  return (
    <>
      <NoIndexHead
        title="Job Review Preview | Note2Tabs"
        canonicalPath="/dev/job-review"
        description="Internal preview for the post-transcription review screen."
      />
      <main className="page page-tight">
        <div className="container stack">
          <section className="card stack">
            <label className="form-group">
              <span className="label">Preview state</span>
              <select
                className="form-select"
                value={previewState}
                onChange={(event) => setPreviewState(event.target.value as PreviewState)}
              >
                <option value="ready">Ready</option>
                <option value="importing">Importing</option>
                <option value="error">Error</option>
                <option value="guest">Guest</option>
              </select>
            </label>
          </section>

          <div className="page-header">
            <div>
              <h1 className="page-title">Choose where to import</h1>
            </div>
            <button type="button" className="button-ghost button-small">
              Back
            </button>
          </div>

          <div className="review-shell" aria-busy={isImporting}>
            <section className="card review-import-card">
              <div className="review-import-header">
                <div className="stack" style={{ gap: "8px" }}>
                  <h2 className="review-hero-title">Midnight Practice Loop</h2>
                </div>
                <span className="review-count-pill">{noteCount.toLocaleString()} notes</span>
              </div>

              {reviewBusyCopy ? (
                <div className="review-import-progress">
                  <div className="job-progress-shell">
                    <div className="job-progress-header">
                      <div className="stack" style={{ gap: "8px" }}>
                        <span className="badge">{reviewBusyCopy.badge}</span>
                        <p className="job-progress-phase">{reviewBusyCopy.title}</p>
                        <p className="muted text-small" style={{ margin: 0 }}>
                          {reviewBusyCopy.detail}
                        </p>
                      </div>
                    </div>
                    <div
                      className="job-progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuetext={reviewBusyCopy.title}
                      aria-label={reviewBusyCopy.title}
                    >
                      <div className="job-progress-fill" style={{ width: "100%" }} />
                    </div>
                    <div className="job-progress-meta">
                      <span>Importing into editor</span>
                      <span>This can take a moment</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {previewState === "error" ? (
                <div className="error">We could not open the editor. Please try again.</div>
              ) : null}

              <div className="review-import-options">
                {!isGuest ? (
                  <div className="review-editor-target">
                    <p className="label" style={{ margin: 0 }}>
                      Import to guitar tab editor
                    </p>
                    <select
                      className="form-select"
                      value={editorChoice}
                      onChange={(event) => setEditorChoice(event.target.value)}
                      disabled={isImporting}
                    >
                      {EDITOR_CHOICES.map((editor) => (
                        <option key={editor.id} value={editor.id}>
                          {editor.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="muted text-small" style={{ margin: 0 }}>
                    Tabs will be opened in the guest editor.
                  </p>
                )}
              </div>

              <div className="button-row review-actions review-import-actions">
                <button type="button" className="button-primary button-small" disabled={isImporting}>
                  {isImporting ? "Importing..." : "Continue to editor"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
