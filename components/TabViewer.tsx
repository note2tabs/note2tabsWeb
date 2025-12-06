type TabViewerProps = {
  tabText?: string;
  songTitle?: string;
  segments?: string[][];
};

export default function TabViewer({ tabText, songTitle, segments }: TabViewerProps) {
  const text =
    tabText ??
    (segments && segments.length
      ? segments.map((s) => s.join("\n")).join("\n\n")
      : "");

  if (!text) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
        >
          Copy tabs
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-800 hover:border-blue-500 hover:text-blue-600"
        >
          Download TXT
        </button>
      </div>
      <pre className="bg-white text-slate-900 border rounded p-4 font-mono text-sm overflow-auto max-h-[60vh] whitespace-pre">
{text}
      </pre>
    </div>
  );
}
