import { useMemo, useState } from "react";
import { copyText } from "../lib/clipboard";

type TabsResultProps = {
  segments: string[][];
  sourceLabel?: string;
  audioUrl?: string | null;
};

export default function TabsResult({ segments, sourceLabel, audioUrl }: TabsResultProps) {
  const [copied, setCopied] = useState(false);

  const joinedText = useMemo(
    () => segments.map((segment) => segment.join("\n")).join("\n\n---\n\n"),
    [segments]
  );

  const handleCopy = async () => {
    try {
      const ok = await copyText(joinedText);
      if (ok) setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy tabs", err);
    }
  };

  return (
    <div className="stack" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      <div className="card stack">
        <h3 className="label">Details</h3>
        <p className="muted text-small">Source: {sourceLabel || "Unknown source"}</p>
        {audioUrl ? (
          <div className="stack" style={{ gap: "8px" }}>
            <p className="label">Preview</p>
            <audio controls src={audioUrl} className="card-outline" />
          </div>
        ) : null}
      </div>

      <div className="card stack">
        <div className="page-header">
          <h3 className="section-title" style={{ margin: 0 }}>
            Generated Tabs
          </h3>
          <button type="button" onClick={handleCopy} className="button-secondary button-small">
            {copied ? "Copied" : "Copy tabs"}
          </button>
        </div>
        <div className="stack">
          {segments.map((segment, idx) => (
            <div key={idx} className="card-outline">
              <p className="muted text-small" style={{ marginBottom: "8px" }}>
                Segment {idx + 1}
              </p>
              <pre className="tab-block">
{segment.join("\n")}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
