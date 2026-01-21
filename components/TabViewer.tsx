import { useState } from "react";
import { copyText } from "../lib/clipboard";

type TabViewerProps = {
  tabText?: string;
  songTitle?: string;
  segments?: string[][];
};

export default function TabViewer({ tabText, songTitle, segments }: TabViewerProps) {
  const [copied, setCopied] = useState(false);
  const text =
    tabText ??
    (segments && segments.length ? segments.map((s) => s.join("\n")).join("\n\n") : "");

  if (!text) return null;

  const handleCopy = async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${songTitle || "note2tabs"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <div className="button-row">
        <button type="button" onClick={handleCopy} className="button-primary button-small">
          {copied ? "Copied" : "Copy tabs"}
        </button>
        <button type="button" onClick={handleDownload} className="button-secondary button-small">
          Download TXT
        </button>
      </div>
      <pre className="tab-block">
{text}
      </pre>
    </div>
  );
}
