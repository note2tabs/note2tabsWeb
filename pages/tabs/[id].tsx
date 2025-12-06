import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import TabViewer from "../../components/TabViewer";

type Props = {
  id: string;
  sourceLabel: string;
  createdAt: string;
  tabs: string[][];
};

export default function TabDetailPage({ id, sourceLabel, createdAt, tabs }: Props) {
  const joined = tabs.map((s) => s.join("\n")).join("\n\n---\n\n");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-slate-800 grid place-items-center text-xs font-bold text-white">
              N2T
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Saved tabs</h1>
              <p className="text-sm text-slate-300">{sourceLabel}</p>
              <p className="text-xs text-slate-500">{new Date(createdAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/tabs/${id}/edit`}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
            >
              Edit tabs
            </Link>
            <Link href="/account" className="text-sm text-blue-400 hover:text-blue-300">
              ← Back to account
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Generated Tabs</h2>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(joined)}
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              Copy
            </button>
          </div>
          <TabViewer segments={tabs} />
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
  let tabs: string[][] = [];
  try {
    const parsed = JSON.parse(job.resultJson);
    if (Array.isArray(parsed)) {
      tabs = parsed as string[][];
    }
  } catch (error) {
    console.error("Failed to parse tabs", error);
  }
  return {
    props: {
      id,
      sourceLabel: job.sourceLabel || "Unknown source",
      createdAt: job.createdAt.toISOString(),
      tabs,
    },
  };
};
