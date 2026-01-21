type TabEditorProps = {
  segments: string[][];
  onChange: (segments: string[][]) => void;
};

export default function TabEditor({ segments, onChange }: TabEditorProps) {
  const handleChange = (index: number, value: string) => {
    const lines = value.split("\n");
    const next = segments.map((seg, idx) => (idx === index ? lines : seg));
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {segments.map((segment, idx) => (
        <div key={idx} className="space-y-2">
          <p className="text-xs text-slate-600">Segment {idx + 1}</p>
          <textarea
            value={segment.join("\n")}
            onChange={(e) => handleChange(idx, e.target.value)}
            className="w-full min-h-[140px] rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm md:text-base text-slate-900 whitespace-pre focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ))}
    </div>
  );
}
