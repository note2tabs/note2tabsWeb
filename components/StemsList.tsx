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
    <div className="stack">
      <h3 className="label">Stems</h3>
      <div className="stack">
        {stems.map((stem) => (
          <div key={stem.url} className="card-outline">
            <div className="page-header" style={{ gap: "12px" }}>
              <span style={{ fontWeight: 600 }}>{stem.name}</span>
              <a href={stem.url} download className="button-secondary button-small">
                Download stem
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
