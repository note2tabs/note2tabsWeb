import { useLocale } from "../../lib/i18n/react";
import { GetServerSideProps } from "next";
import Link from "../../components/LocaleLink";
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
  const { t, locale } = useLocale();
  return (
    <>
      <NoIndexHead title={t("Transcription history | Note2Tabs")} canonicalPath="/tabs" />
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">{t("Transcription history")}</h1>
            <p className="page-subtitle">{t("Reopen a previous result or continue working in the editor.")}</p>
          </div>
          <div className="button-row">
            <Link href="/transcribe" className="button-primary button-small">{t("New transcription")}</Link>
            <Link href="/gte" className="button-secondary button-small">{t("Open my tabs")}</Link>
          </div>
        </div>

        <section className="card stack">
          <div className="page-header">
            <h2 className="section-title section-title--tight">
              {t("History")}</h2>
            <span className="muted text-small">{tabs.length} {t(" transcriptions")}</span>
          </div>
          {tabs.length === 0 && (
            <div className="blog-empty stack-tight">
              <strong>{t("Your transcription history is empty.")}</strong>
              <span>{t("When you transcribe a recording, you can reopen the result from here.")}</span>
              <div className="button-row">
                <Link href="/transcribe" className="button-primary button-small">{t("Transcribe a recording")}</Link>
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
                          {t(sourceTypeLabel(job.sourceType))} {t(" · ")}<time dateTime={job.createdAt}>{t(new Date(job.createdAt).toLocaleString(locale === "pt-BR" ? "pt-BR" : "en-US"))}</time>
                        </p>
                      </Link>
                    ) : (
                      <div className="tabs-row-main">
                        <p className="tabs-row-main-title">{job.sourceLabel || "Untitled recording"}</p>
                        <p className="muted text-small tabs-row-main-meta">
                          {t(sourceTypeLabel(job.sourceType))} {t(" · ")}<time dateTime={job.createdAt}>{t(new Date(job.createdAt).toLocaleString(locale === "pt-BR" ? "pt-BR" : "en-US"))}</time>
                        </p>
                      </div>
                    )}
                    {reviewHref ? (
                      <div className="button-row">
                        <Link href={reviewHref} className="button-secondary button-small">
                          {t("Edit transcription")}</Link>
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
