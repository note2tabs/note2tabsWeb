import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Header from "../components/Header";
import { getJobHistory } from "../lib/history";

type HistoryEntry = ReturnType<typeof getJobHistory>[number];

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getJobHistory());
  }, []);

  return (
    <>
      <Head>
        <title>History – Note2Tabs</title>
        <meta name="description" content="Recent transcriptions saved locally on this device." />
      </Head>
      <Header />
      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Recent transcriptions</h1>
              <p className="text-sm text-slate-400">
                Saved locally in your browser (up to 20 entries).
              </p>
            </div>
            <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">
              ← Back to home
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
            {history.length === 0 && (
              <p className="text-sm text-slate-400">No history yet. Complete a transcription to see it here.</p>
            )}
            <div className="space-y-2">
              {history.map((entry) => (
                <Link
                  key={entry.jobId}
                  href={`/job/${entry.jobId}`}
                  className="block rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 hover:border-blue-500"
                >
                  <p className="text-sm font-semibold text-slate-100">
                    {entry.songTitle || "Untitled"} {entry.artist ? `– ${entry.artist}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
