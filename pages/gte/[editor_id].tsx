import { GetServerSideProps } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useRouter } from "next/router";
import { gteApi } from "../../lib/gteApi";
import type { EditorSnapshot } from "../../types/gte";
import GteWorkspace from "../../components/GteWorkspace";

type Props = {
  editorId: string;
};

export default function GteEditorPage({ editorId }: Props) {
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const loadEditor = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gteApi.getEditor(editorId);
      setSnapshot(data);
    } catch (err: any) {
      setError(err?.message || "Could not load editor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (editorId) {
      void loadEditor();
    }
  }, [editorId]);

  return (
    <main className="page page-tight">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">GTE Workspace</h1>
            <p className="page-subtitle">Editor {editorId.slice(0, 8)}</p>
          </div>
          <div className="button-row">
            <button type="button" onClick={() => router.push("/gte")} className="button-secondary button-small">
              Back to editors
            </button>
            <Link href="/account" className="button-secondary button-small">
              Account
            </Link>
          </div>
        </div>

        {loading && <p className="muted text-small">Loading editor...</p>}
        {error && <div className="error">{error}</div>}
        {snapshot && <GteWorkspace editorId={editorId} snapshot={snapshot} onSnapshotChange={setSnapshot} />}
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
  const editorId = ctx.params?.editor_id as string;
  return { props: { editorId } };
};
