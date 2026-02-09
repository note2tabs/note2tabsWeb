import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { tabSegmentsToStamps } from "../../../lib/tabTextToStamps";

type Props = {
  error?: string;
};

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET = process.env.NOTE2TABS_BACKEND_SECRET;

export default function EditTabRedirect({ error }: Props) {
  if (error) {
    return (
      <main className="page">
        <div className="container stack">
          <h1 className="page-title">Could not open editor</h1>
          <p className="page-subtitle">{error}</p>
        </div>
      </main>
    );
  }
  return (
    <main className="page">
      <div className="container stack">
        <h1 className="page-title">Opening editor...</h1>
        <p className="page-subtitle">Preparing your tabs for editing.</p>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
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
    select: { id: true, resultJson: true, gteEditorId: true },
  });

  if (!job) {
    return { notFound: true };
  }

  if (job.gteEditorId) {
    return {
      redirect: {
        destination: `/gte/${job.gteEditorId}`,
        permanent: false,
      },
    };
  }

  let segments: string[][] = [];
  try {
    const parsed = JSON.parse(job.resultJson);
    if (Array.isArray(parsed)) {
      segments = parsed as string[][];
    }
  } catch (error) {
    return { props: { error: "Could not parse tab data for editing." } };
  }

  const { stamps, totalFrames } = tabSegmentsToStamps(segments);

  try {
    const createRes = await fetch(`${API_BASE}/gte/editors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": session.user.id,
        ...(BACKEND_SECRET ? { "X-Backend-Secret": BACKEND_SECRET } : {}),
      },
      body: JSON.stringify({}),
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      return { props: { error: text || "Failed to create GTE editor." } };
    }
    const created = (await createRes.json()) as { editorId?: string };
    if (!created?.editorId) {
      return { props: { error: "GTE editor creation returned no id." } };
    }

    if (stamps.length > 0) {
      const importRes = await fetch(`${API_BASE}/gte/editors/${created.editorId}/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": session.user.id,
          ...(BACKEND_SECRET ? { "X-Backend-Secret": BACKEND_SECRET } : {}),
        },
        body: JSON.stringify({ stamps, totalFrames }),
      });
      if (!importRes.ok) {
        const text = await importRes.text();
        return { props: { error: text || "Failed to import tabs into editor." } };
      }
    }

    await prisma.tabJob.update({
      where: { id: job.id },
      data: { gteEditorId: created.editorId },
    });

    return {
      redirect: {
        destination: `/gte/${created.editorId}`,
        permanent: false,
      },
    };
  } catch (error) {
    return { props: { error: "Could not reach the GTE backend." } };
  }
};
