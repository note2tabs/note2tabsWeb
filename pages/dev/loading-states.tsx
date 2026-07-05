import { useMemo, useState, type CSSProperties } from "react";
import NoIndexHead from "../../components/NoIndexHead";

const STATUS_MESSAGES = [
  "Uploading audio...",
  "Transcribing audio and finding guitar parts...",
  "Getting things started. Opening progress screen...",
  "Importing...",
];

export default function LoadingStatesPreviewPage() {
  const [message, setMessage] = useState(STATUS_MESSAGES[1]);
  const [duration, setDuration] = useState(2.6);
  const [contrast, setContrast] = useState(1.08);
  const [saturation, setSaturation] = useState(1.2);

  const shimmerStyle = useMemo(
    () =>
      ({
        "--thinking-shimmer-duration": `${duration}s`,
        "--thinking-shimmer-contrast": String(contrast),
        "--thinking-shimmer-saturation": String(saturation),
      }) as CSSProperties,
    [contrast, duration, saturation]
  );

  return (
    <>
      <NoIndexHead
        title="Loading State Preview | Note2Tabs"
        canonicalPath="/dev/loading-states"
        description="Internal preview for loading state animation."
      />
      <main className="page page-tight" style={shimmerStyle}>
        <div className="container stack" style={{ maxWidth: 900 }}>
          <div className="page-header">
            <div>
              <h1 className="page-title">Loading State Preview</h1>
              <p className="page-subtitle">Preview the transcription and import shimmer without starting a job.</p>
            </div>
          </div>

          <section className="card stack">
            <div className="form-grid">
              <label className="form-group">
                <span className="label">Message</span>
                <select className="form-select" value={message} onChange={(event) => setMessage(event.target.value)}>
                  {STATUS_MESSAGES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-group">
                <span className="label">Speed ({duration.toFixed(1)}s)</span>
                <input
                  type="range"
                  min={1.5}
                  max={5}
                  step={0.1}
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                />
              </label>

              <label className="form-group">
                <span className="label">Contrast ({contrast.toFixed(2)})</span>
                <input
                  type="range"
                  min={1}
                  max={1.5}
                  step={0.01}
                  value={contrast}
                  onChange={(event) => setContrast(Number(event.target.value))}
                />
              </label>

              <label className="form-group">
                <span className="label">Saturation ({saturation.toFixed(2)})</span>
                <input
                  type="range"
                  min={1}
                  max={1.8}
                  step={0.01}
                  value={saturation}
                  onChange={(event) => setSaturation(Number(event.target.value))}
                />
              </label>
            </div>
          </section>

          <section className="card stack">
            <h2 className="section-title">Transcription Status</h2>
            <div className="status">
              <span className="transcription-thinking-text">{message}</span>
            </div>
          </section>

          <section className="card stack">
            <h2 className="section-title">Import Buttons</h2>
            <div className="button-row">
              <button type="button" className="button-secondary button-small">
                <span className="import-thinking-text">Importing...</span>
              </button>
              <button type="button" className="button-primary button-small">
                <span className="import-thinking-text">Importing...</span>
              </button>
              <button type="button" className="button-save button-small">
                <span className="import-thinking-text">Saving...</span>
              </button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
