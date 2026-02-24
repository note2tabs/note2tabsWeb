import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";

type TabJob = {
  id: string;
  sourceType: string;
  sourceLabel: string | null;
  createdAt: string;
  gteEditorId?: string | null;
};

type Props = {
  tabs: TabJob[];
};

export default function SavedTabsPage({ tabs }: Props) {
  return (
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Saved tabs</h1>
            <p className="page-subtitle">Your transcription history.</p>
          </div>
          <div className="button-row">
            <Link href="/account" className="button-ghost button-small">
              Account
            </Link>
            <Link href="/settings" className="button-ghost button-small">
              Settings
            </Link>
          </div>
        </div>

        <section className="card stack">
          <div className="page-header">
            <h2 className="section-title" style={{ margin: 0 }}>
              History
            </h2>
            <span className="muted text-small">{tabs.length} jobs</span>
          </div>
          {tabs.length === 0 && <p className="muted text-small">No transcriptions yet.</p>}
          <div className="stack">
            {tabs.map((job) => (
              <div key={job.id} className="card-outline">
                <div className="page-header" style={{ gap: "12px" }}>
                  <Link href={`/tabs/${job.id}`} className="stack" style={{ gap: "4px" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {job.sourceLabel || "Unknown source"}
                    </p>
                    <p className="muted text-small" style={{ margin: 0 }}>
                      {job.sourceType} - {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </Link>
                  <Link
                    href={job.gteEditorId ? `/gte/${job.gteEditorId}` : `/tabs/${job.id}/edit`}
                    className="button-secondary button-small"
                  >
                    {job.gteEditorId ? "Open GTE" : "Edit in GTE"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
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

  const tabs = await prisma.tabJob.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, sourceType: true, sourceLabel: true, createdAt: true, gteEditorId: true },
  });

  return {
    props: {
      tabs: tabs.map((job) => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
      })),
    },
  };
};
