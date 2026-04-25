import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { parseStoredTabPayload } from "../../lib/storedTabs";

type TabJob = {
  id: string;
  sourceType: string;
  sourceLabel: string | null;
  createdAt: string;
  gteEditorId?: string | null;
  backendJobId?: string | null;
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
            <h1 className="page-title">Transcriptions</h1>
            <p className="page-subtitle">Your transcription history.</p>
          </div>
        </div>

        <section className="card stack">
          <div className="page-header">
            <h2 className="section-title section-title--tight">
              History
            </h2>
            <span className="muted text-small">{tabs.length} transcriptions</span>
          </div>
          {tabs.length === 0 && <p className="muted text-small">No transcriptions yet.</p>}
          <div className="tabs-list">
            {tabs.map((job) => (
              <div key={job.id} className="card-outline">
                <div className="tabs-row">
                  <Link href={`/tabs/${job.id}`} className="tabs-row-main">
                    <p className="tabs-row-main-title">{job.sourceLabel || "Unknown source"}</p>
                    <p className="muted text-small tabs-row-main-meta">
                      {job.sourceType} - {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </Link>
                  <div className="button-row">
                    <Link href={`/tabs/${job.id}`} className="button-secondary button-small">
                      Open import page
                    </Link>
                    {job.backendJobId ? (
                      <Link
                        href={`/job/${encodeURIComponent(job.backendJobId)}?review=1`}
                        className="button-secondary button-small"
                      >
                        Edit transcription
                      </Link>
                    ) : null}
                  </div>
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
    select: { id: true, sourceType: true, sourceLabel: true, createdAt: true, gteEditorId: true, resultJson: true },
  });

  return {
    props: {
      tabs: tabs.map((job) => ({
        id: job.id,
        sourceType: job.sourceType,
        sourceLabel: job.sourceLabel,
        createdAt: job.createdAt.toISOString(),
        gteEditorId: job.gteEditorId,
        backendJobId: parseStoredTabPayload(job.resultJson).backendJobId,
      })),
    },
  };
};
