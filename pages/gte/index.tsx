import { GetServerSideProps } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useRouter } from "next/router";
import { gteApi } from "../../lib/gteApi";
import type { EditorListItem } from "../../types/gte";

export default function GteIndexPage() {
  const [editors, setEditors] = useState<EditorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  const loadEditors = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gteApi.listEditors();
      setEditors(data.editors || []);
    } catch (err: any) {
      setError(err?.message || "Could not load editors.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEditors();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const data = await gteApi.createEditor();
      await router.push(`/gte/${data.editorId}`);
    } catch (err: any) {
      setError(err?.message || "Could not create editor.");
      setCreating(false);
    }
  };

  const handleDelete = async (editor: EditorListItem) => {
    if (deletingId) return;
    const label = editor.name ? `"${editor.name}"` : `Editor ${editor.id.slice(0, 8)}`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeletingId(editor.id);
    setError(null);
    try {
      await gteApi.deleteEditor(editor.id);
      setEditors((prev) => prev.filter((item) => item.id !== editor.id));
    } catch (err: any) {
      setError(err?.message || "Could not delete editor.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Guitar Tab Editor</h1>
            <p className="page-subtitle">Manage your saved GTE projects.</p>
          </div>
          <div className="button-row">
            <Link href="/account" className="button-secondary button-small">
              Back to account
            </Link>
            <button type="button" onClick={handleCreate} disabled={creating} className="button-primary button-small">
              {creating ? "Creating..." : "New editor"}
            </button>
          </div>
        </div>

        <section className="card stack">
          {loading && <p className="muted text-small">Loading editors...</p>}
          {error && <div className="error">{error}</div>}
          {!loading && !editors.length && (
            <p className="muted text-small">No editors yet. Create your first GTE.</p>
          )}
          <div className="stack" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {editors.map((editor) => (
              <div key={editor.id} className="card-outline">
                <div className="page-header" style={{ gap: "12px" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "1rem" }}>
                      <Link href={`/gte/${editor.id}`}>
                        {editor.name ? editor.name : `Editor ${editor.id.slice(0, 8)}`}
                      </Link>
                    </h2>
                    <p className="muted text-small" style={{ margin: 0 }}>
                      {editor.id.slice(0, 8)}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="muted text-small">v{editor.version || 1}</span>
                    <button
                      type="button"
                      className="button-secondary button-small"
                      onClick={() => void handleDelete(editor)}
                      disabled={deletingId === editor.id}
                    >
                      {deletingId === editor.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
                <div className="muted text-small" style={{ marginTop: "8px" }}>
                  <p>Notes: {editor.noteCount ?? 0} - Chords: {editor.chordCount ?? 0}</p>
                  <p>Frames: {editor.totalFrames ?? 0} - Bar size: {editor.framesPerMessure ?? 0}</p>
                  {editor.updatedAt && <p>Updated: {new Date(editor.updatedAt).toLocaleString()}</p>}
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
  return { props: {} };
};
