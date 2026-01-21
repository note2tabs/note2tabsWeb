export default function TermsPage() {
  return (
    <main className="page">
      <div className="container stack" style={{ maxWidth: "820px" }}>
        <h1 className="page-title">Terms of Service</h1>
        <p className="page-subtitle">
          This is a placeholder Terms of Service for the local Note2Tab app. Use is provided as-is,
          without warranty. Do not upload content you do not have rights to. Audio processing is handled
          locally against your FastAPI server.
        </p>
        <p className="muted text-small">
          For production, replace this copy with your own legal text and consult counsel.
        </p>
      </div>
    </main>
  );
}
