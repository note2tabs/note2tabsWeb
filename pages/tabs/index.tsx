import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { parseStoredTabPayload } from "../../lib/storedTabs";
import NoIndexHead from "../../components/NoIndexHead";

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

const sourceTypeLabel = (sourceType: string) => {
  const normalized = sourceType.trim().toUpperCase();
  if (normalized === "YOUTUBE") return "YouTube";
  if (normalized === "FILE" || normalized === "AUDIO") return "Audio file";
  return "Recording";
};

export default function SavedTabsPage({ tabs }: Props) {
  return (
    <>
      <NoIndexHead title="Transcription history | Note2Tabs" canonicalPath="/tabs" />
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Transcription history</h1>
            <p className="page-subtitle">Reopen a previous result or continue working in the editor.</p>
          </div>
          <div className="button-row">
            <Link href="/transcribe" className="button-primary button-small">New transcription</Link>
            <Link href="/gte" className="button-secondary button-small">Open my tabs</Link>
          </div>
        </div>

        <section className="card stack">
          <div className="page-header">
            <h2 className="section-title section-title--tight">
              History
            </h2>
            <span className="muted text-small">{tabs.length} transcriptions</span>
          </div>
          {tabs.length === 0 && (
            <div className="blog-empty stack-tight">
              <strong>Your transcription history is empty.</strong>
              <span>When you transcribe a recording, you can reopen the result from here.</span>
              <div className="button-row">
                <Link href="/transcribe" className="button-primary button-small">Transcribe a recording</Link>
              </div>
            </div>
          )}
          <div className="tabs-list">
            {tabs.map((job) => {
              const reviewHref = job.backendJobId ? `/job/${encodeURIComponent(job.backendJobId)}?review=1` : null;
              return (
                <div key={job.id} className="card-outline">
                  <div className="tabs-row">
                    {reviewHref ? (
                      <Link href={reviewHref} className="tabs-row-main">
                        <p className="tabs-row-main-title">{job.sourceLabel || "Untitled recording"}</p>
                        <p className="muted text-small tabs-row-main-meta">
                          {sourceTypeLabel(job.sourceType)} · <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString()}</time>
                        </p>
                      </Link>
                    ) : (
                      <div className="tabs-row-main">
                        <p className="tabs-row-main-title">{job.sourceLabel || "Untitled recording"}</p>
                        <p className="muted text-small tabs-row-main-meta">
                          {sourceTypeLabel(job.sourceType)} · <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString()}</time>
                        </p>
                      </div>
                    )}
                    {reviewHref ? (
                      <div className="button-row">
                        <Link href={reviewHref} className="button-secondary button-small">
                          Edit transcription
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: `/auth/login?next=${encodeURIComponent(ctx.resolvedUrl || "/tabs")}`,
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
