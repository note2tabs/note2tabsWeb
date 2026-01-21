import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import TabViewer from "../../components/TabViewer";
import { copyText } from "../../lib/clipboard";

type Props = {
  id: string;
  sourceLabel: string;
  createdAt: string;
  tabs: string[][];
  gteEditorId?: string | null;
};

export default function TabDetailPage({ id, sourceLabel, createdAt, tabs, gteEditorId }: Props) {
  const joined = tabs.map((s) => s.join("\n")).join("\n\n---\n\n");

  return (
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div className="stack" style={{ gap: "6px" }}>
            <h1 className="page-title">Saved tabs</h1>
            <p className="muted text-small">{sourceLabel}</p>
            <p className="muted text-small">{new Date(createdAt).toLocaleString()}</p>
          </div>
          <div className="button-row">
            <Link
              href={gteEditorId ? `/gte/${gteEditorId}` : `/tabs/${id}/edit`}
              className="button-primary button-small"
            >
              {gteEditorId ? "Open GTE" : "Edit tabs"}
            </Link>
            <Link href="/account" className="button-secondary button-small">
              Back to account
            </Link>
          </div>
        </div>

        <section className="card stack">
          <div className="page-header">
            <h2 className="section-title" style={{ margin: 0 }}>
              Generated Tabs
            </h2>
            <button type="button" onClick={() => void copyText(joined)} className="button-secondary button-small">
              Copy
            </button>
          </div>
          <TabViewer segments={tabs} />
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
      gteEditorId: job.gteEditorId,
    },
  };
};
