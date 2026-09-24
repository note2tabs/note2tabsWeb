import { useState } from "react";
import HeavyPreviewEditorPrompt from "../../components/HeavyPreviewEditorPrompt";
import NoIndexHead from "../../components/NoIndexHead";

const strings = ["E", "B", "G", "D", "A", "E"];
const notes = [
  { string: 1, left: 12, label: "7" },
  { string: 2, left: 21, label: "9" },
  { string: 0, left: 31, label: "10" },
  { string: 3, left: 43, label: "9" },
  { string: 2, left: 56, label: "7" },
  { string: 1, left: 69, label: "8" },
  { string: 0, left: 82, label: "10" },
];

export default function HeavyPreviewEditorDesignPage() {
  const [promptOpen, setPromptOpen] = useState(true);

  return (
    <>
      <NoIndexHead
        title="Heavy Preview Editor Design | Note2Tabs"
        canonicalPath="/dev/heavy-preview-editor"
        description="Internal preview of the Heavy post-transcription offer."
      />
      <main className="heavy-preview-editor-demo">
        <header className="heavy-preview-editor-demo__header">
          <div>
            <h1>Heavy preview transcription</h1>
            <nav aria-label="Editor menu"><button>File</button><button>Tools</button><button>View</button><button>Help</button></nav>
          </div>
          <div className="heavy-preview-editor-demo__header-actions">
            <span>Saved just now</span>
            <button className="button-primary">Share tab</button>
            <button className="button-secondary">Back to editors</button>
          </div>
        </header>

        <section className="heavy-preview-editor-demo__workspace" aria-label="Guitar tab editor preview">
          <div className="heavy-preview-editor-demo__toolbar">
            <button>Song settings&nbsp;&nbsp; C Major · 120 BPM · 4/4</button>
            <button>Editing settings&nbsp;&nbsp; Note 1/4 · Cursor 1/4</button>
          </div>
          <div className="heavy-preview-editor-demo__canvas">
            <div className="heavy-preview-editor-demo__bar-label">Bar 1</div>
            {strings.map((string, index) => (
              <div className="heavy-preview-editor-demo__string" key={`${string}-${index}`}>
                <span>{string}</span><i />
              </div>
            ))}
            {notes.map((note, index) => (
              <b
                key={`${note.label}-${index}`}
                className="heavy-preview-editor-demo__note"
                style={{ left: `${note.left}%`, top: `${56 + note.string * 30}px` }}
              >
                {note.label}
              </b>
            ))}
          </div>
          <button className="heavy-preview-editor-demo__add" aria-label="Add bar">+</button>
        </section>

        <div className="heavy-preview-editor-demo__transport" aria-hidden="true">
          <button>‹</button><button className="is-play">▶</button><button>›</button>
        </div>

        {!promptOpen && (
          <button className="heavy-preview-dev-trigger" onClick={() => setPromptOpen(true)}>
            Show Heavy offer again
          </button>
        )}
        <HeavyPreviewEditorPrompt
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          onUpgrade={() => setPromptOpen(false)}
        />
      </main>
    </>
  );
}
