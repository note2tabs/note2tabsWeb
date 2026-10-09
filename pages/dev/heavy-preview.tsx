import { useState } from "react";
import HeavyPreviewEditorPrompt from "../../components/HeavyPreviewEditorPrompt";
import HeavyPreviewIntroDialog from "../../components/HeavyPreviewIntroDialog";
import HeavyPreviewOffer from "../../components/HeavyPreviewOffer";
import NoIndexHead from "../../components/NoIndexHead";
import TranscriptionModelDropdown from "../../components/TranscriptionModelDropdown";
import type { TranscriptionModelChoice } from "../../lib/transcriptionModels";

export default function HeavyPreviewDesignPage() {
  const [model, setModel] = useState<TranscriptionModelChoice>("light");
  const [mode, setMode] = useState<"FILE" | "YOUTUBE">("FILE");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [editorPromptOpen, setEditorPromptOpen] = useState(false);

  const chooseModel = (nextModel: TranscriptionModelChoice) => {
    if (nextModel === "super_heavy") {
      setConfirmationOpen(true);
      return;
    }
    setModel(nextModel);
  };

  return (
    <>
      <NoIndexHead
        title="Heavy Preview Design | Note2Tabs"
        canonicalPath="/dev/heavy-preview"
        description="Internal preview of the Note2Tabs Heavy model offer."
      />

      <main className="page page-home">
        <section className="hero hero--landing-funnel" id="hero">
          <div className="hero-doodle-field" aria-hidden="true">
            <span className="hero-doodle hero-doodle--guitar" />
            <span className="hero-doodle hero-doodle--notes" />
            <span className="hero-doodle hero-doodle--fretboard" />
            <span className="hero-doodle hero-doodle--picks" />
          </div>

          <div className="container hero-stack hero-stack--centered">
            <div className="hero-heading">
              <p className="hero-eyebrow">AI tabs built for guitarists</p>
              <div className="hero-title-row">
                <h1 className="hero-title">Convert Any Song to Guitar Tabs</h1>
              </div>
              <p className="hero-subtitle hero-subtitle--conversion">
                Turn recordings into guitar tab you can edit, practice, and export.
              </p>
            </div>

            <form className="prompt-shell prompt-shell--funnel" onSubmit={(event) => event.preventDefault()}>
              <div className="prompt-meta-row">
                <div className="prompt-meta-left">
                  <div className="model-choice model-choice--meta">
                    <TranscriptionModelDropdown
                      id="preview-transcription-model"
                      value={model}
                      onChange={chooseModel}
                      canUseHeavy
                      heavyPreviewAvailable
                    />
                  </div>
                </div>
                <p className="hero-credits-inline">
                  Credits: <strong>10/10</strong>
                  <span className="hero-credits-next">• Resets Oct 1</span>
                </p>
              </div>

              <HeavyPreviewOffer selected={model === "super_heavy"} onSelect={() => setConfirmationOpen(true)} />

              <div className="funnel-panel">
                <div className="funnel-row">
                  <div className={`funnel-input ${mode === "FILE" ? "is-file" : "is-url"}`}>
                    <span className={`funnel-icon ${mode === "YOUTUBE" ? "funnel-icon--youtube" : ""}`} aria-hidden="true">
                      {mode === "YOUTUBE" ? (
                        <svg className="youtube-mark" viewBox="0 0 28 20" fill="none">
                          <path d="M27.4 3.1c-.32-1.2-1.24-2.15-2.4-2.48C22.9 0 14 0 14 0S5.1 0 3 .62C1.84.95.92 1.9.6 3.1.03 5.28.03 10 .03 10s0 4.72.57 6.9c.32 1.2 1.24 2.15 2.4 2.48C5.1 20 14 20s8.9 0 11-.62c1.16-.33 2.08-1.28 2.4-2.48.57-2.18.57-6.9.57-6.9s0-4.72-.57-6.9Z" fill="currentColor" />
                          <path d="M11.2 14.25V5.75L18.45 10l-7.25 4.25Z" fill="#fff" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10-6.5-10-6.5z" /></svg>
                      )}
                    </span>
                    {mode === "FILE" ? (
                      <span className="funnel-file-label">Upload audio file or drop it here</span>
                    ) : (
                      <input aria-label="YouTube link" type="url" placeholder="https://www.youtube.com/..." />
                    )}
                  </div>
                </div>

                <div className="funnel-toolbar">
                  <div className="mode-switch mode-switch--hero" role="group" aria-label="Input mode">
                    <button type="button" className={mode === "FILE" ? "active" : ""} onClick={() => setMode("FILE")}>Audio file</button>
                    <button type="button" className={mode === "YOUTUBE" ? "active" : ""} onClick={() => setMode("YOUTUBE")}>YouTube link</button>
                  </div>
                  <button type="button" className="button-primary funnel-submit">Start transcription</button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <button type="button" className="heavy-preview-dev-trigger" onClick={() => setEditorPromptOpen(true)}>
          Preview post-transcription message
        </button>

        <HeavyPreviewIntroDialog
          open={confirmationOpen}
          onCancel={() => setConfirmationOpen(false)}
          onConfirm={() => {
            setModel("super_heavy");
            setConfirmationOpen(false);
          }}
        />
        <HeavyPreviewEditorPrompt
          open={editorPromptOpen}
          onClose={() => setEditorPromptOpen(false)}
          onUpgrade={() => setEditorPromptOpen(false)}
        />
      </main>
    </>
  );
}
