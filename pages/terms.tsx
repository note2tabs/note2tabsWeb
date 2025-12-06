export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <h1 className="text-3xl font-semibold">Terms of Service</h1>
        <p className="text-slate-300 text-sm">
          This is a placeholder Terms of Service for the local Note2Tabs app. Use is provided as-is,
          without warranty. Do not upload content you do not have rights to. Audio processing is handled
          locally against your FastAPI server.
        </p>
        <p className="text-slate-300 text-sm">
          For production, replace this copy with your own legal text and consult counsel.
        </p>
      </div>
    </main>
  );
}
