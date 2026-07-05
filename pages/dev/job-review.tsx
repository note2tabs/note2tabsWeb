import { useState } from "react";
import NoIndexHead from "../../components/NoIndexHead";

const EDITOR_CHOICES = [
  { id: "new", name: "New editor" },
  { id: "acoustic-idea", name: "Acoustic idea" },
  { id: "solo-draft", name: "Solo draft" },
] as const;

type PreviewState = "ready" | "importing" | "error" | "guest";

const TAB_PREVIEW = `e|----------------|----------------|--------3---5---|7---5---3-------|
B|--------3---5---|6---5---3-------|----3-----------|----------6---5-|
G|----4-----------|----------5---4-|4h5---5---4-----|----------------|
D|5---------------|----------------|------------5---|----------------|
A|----------------|----------------|----------------|----------------|
E|----------------|----------------|----------------|----------------|`;

export default function JobReviewPreviewPage() {
  const [previewState, setPreviewState] = useState<PreviewState>("ready");
  const [editorChoice, setEditorChoice] = useState("new");
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
              <h1 className="page-title">Your tab is ready</h1>
            </div>
          </div>

          <div className="review-shell" aria-busy={isImporting}>
            <section className="card review-import-card">
              <div className="review-import-header">
                <div className="stack" style={{ gap: "8px" }}>
                  <h2 className="review-hero-title">Midnight Practice Loop</h2>
                </div>
                <span className="review-count-pill">{noteCount.toLocaleString()} notes</span>
              </div>

              <div className="review-value-preview" aria-label="Tab preview">
                <p className="review-value-title">Preview</p>
                <pre>{TAB_PREVIEW}</pre>
              </div>

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
                  {isImporting ? "Opening..." : "Open in editor"}
                </button>
                <p className="review-cta-note">You can edit everything after opening.</p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
