import { useMemo, useState } from "react";

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
      await navigator.clipboard.writeText(joinedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy tabs", err);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[320px,1fr]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/40">
        <h3 className="text-sm font-semibold text-slate-100">Details</h3>
        <p className="mt-2 text-sm text-slate-400">
          Source: {sourceLabel || "Unknown source"}
        </p>
        {audioUrl ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-400">Preview</p>
            <audio controls src={audioUrl} className="w-full rounded-lg border border-slate-800" />
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 md:p-6 shadow-lg shadow-black/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-100">Generated Tabs</h3>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-700"
          >
            {copied ? "Copied" : "Copy tabs"}
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {segments.map((segment, idx) => (
            <div key={idx} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs font-semibold text-slate-400 mb-2">Segment {idx + 1}</p>
              <pre className="max-h-[320px] overflow-auto whitespace-pre font-mono text-sm leading-relaxed text-slate-100">
{segment.join("\n")}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
