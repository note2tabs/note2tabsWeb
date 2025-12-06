import { GetServerSideProps } from "next";
import Link from "next/link";
import { useState } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import TabEditor from "../../../components/TabEditor";
import TabViewer from "../../../components/TabViewer";

type Props = {
  id: string;
  sourceLabel: string;
  rawJson: string;
};

export default function TabEditPage({ id, sourceLabel, rawJson }: Props) {
  const [name, setName] = useState(sourceLabel);
  const [segments, setSegments] = useState<string[][]>(() => {
    try {
      const parsed = JSON.parse(rawJson);
      return Array.isArray(parsed) ? (parsed as string[][]) : [];
    } catch {
      return [];
    }
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setMessage(null);
    try {
      JSON.stringify(segments);
    } catch (err: any) {
      setError(err?.message || "Invalid JSON.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/tabs/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sourceLabel: name, resultJson: JSON.stringify(segments) }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Could not save tab.");
      return;
    }
    setMessage("Saved!");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-slate-800 grid place-items-center text-xs font-bold text-white">
              N2T
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Edit tabs</h1>
              <p className="text-xs text-slate-500">Fullscreen editor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/tabs/${id}`}
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              ← Back to view
            </Link>
            <Link
              href="/account"
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              Account
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4 min-h-[70vh]">
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <TabEditor segments={segments} onChange={setSegments} />
          <div className="space-y-2">
            <p className="text-sm text-slate-300">Preview</p>
            <TabViewer segments={segments} />
          </div>
          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {message}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <Link
              href={`/tabs/${id}`}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }
  const id = ctx.params?.id as string;
  const job = await prisma.tabJob.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!job) {
    return { notFound: true };
  }
  return {
    props: {
      id,
      sourceLabel: job.sourceLabel || "Unknown source",
      rawJson: job.resultJson,
    },
  };
};
