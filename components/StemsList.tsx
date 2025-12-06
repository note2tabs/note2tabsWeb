type Stem = {
  name: string;
  url: string;
};

type StemsListProps = {
  stems: Stem[];
};

export default function StemsList({ stems }: StemsListProps) {
  if (!stems || stems.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Stems</h3>
      <div className="space-y-2">
        {stems.map((stem) => (
          <div
            key={stem.url}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
          >
            <span className="text-sm font-medium text-gray-800">{stem.name}</span>
            <a
              href={stem.url}
              download
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-blue-500 hover:text-blue-600"
            >
              Download stem
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
