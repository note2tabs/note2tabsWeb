import type { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { useCallback, useEffect, useState } from "react";
import NoIndexHead from "../components/NoIndexHead";
import { gteApi } from "../lib/gteApi";
import type { PendingCanvasShare, SharedEditorListItem } from "../types/gte";
import { authOptions } from "./api/auth/[...nextauth]";

type Props = {
  userId: string;
};

const relativeUpdatedAt = (value?: string) => {
  if (!value) return "Recently edited";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently edited";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Updated ${days}d ago`;
  return `Updated ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(timestamp)
  )}`;
};

export default function SharedWithYouPage({ userId }: Props) {
  const [pending, setPending] = useState<PendingCanvasShare[]>([]);
  const [shared, setShared] = useState<SharedEditorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [decliningId, setDecliningId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, editorsRes] = await Promise.all([
        gteApi.listPendingShares(),
        gteApi.listEditors(),
      ]);
      setPending(pendingRes.pending || []);
      setShared(editorsRes.sharedEditors || []);
    } catch {
      setError("Could not load your shared tabs. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccept = useCallback(
    async (share: PendingCanvasShare) => {
      setAcceptingId(share.shareId);
      try {
        await gteApi.acceptShare(share.shareId);
        setPending((prev) => prev.filter((item) => item.shareId !== share.shareId));
        setShared((prev) => [
          {
            id: share.canvasId,
            name: share.name,
            role: share.role,
            updatedAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      } catch {
        setError("Could not accept that invite. Try again.");
      } finally {
        setAcceptingId(null);
      }
    },
    []
  );

  const handleDecline = useCallback(async (share: PendingCanvasShare) => {
    setDecliningId(share.shareId);
    try {
      await gteApi.revokeShare(share.canvasId, share.shareId);
      setPending((prev) => prev.filter((item) => item.shareId !== share.shareId));
    } catch {
      setError("Could not decline that invite. Try again.");
    } finally {
      setDecliningId(null);
    }
  }, []);

  return (
    <>
      <NoIndexHead title="Shared with you | Note2Tabs" canonicalPath="/shared" />
      <main className="product-home product-home--studio">
        <div className="container product-studio-layout">
          <aside className="product-studio-sidebar" aria-label="Workspace navigation">
            <nav>
              <Link href="/home">Home</Link>
              <Link href="/transcribe">Transcriber</Link>
              <Link href="/gte">My tabs</Link>
              <Link href="/shared" className="is-active">
                Shared with you
              </Link>
            </nav>
          </aside>
          <div className="product-studio">
            <header className="product-studio__welcome">
              <h1>Shared with you</h1>
              <p>Invites to editors other people have shared with you, and everything you've already accepted.</p>
            </header>

            {error && <p className="product-home__error">{error}</p>}

            <section className="product-studio__library" aria-labelledby="pending-heading">
              <header>
                <div>
                  <h2 id="pending-heading">Pending invites</h2>
                </div>
              </header>
              {loading ? (
                <p>Loading...</p>
              ) : pending.length === 0 ? (
                <p>No pending invites right now.</p>
              ) : (
                <ul style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {pending.map((share) => (
                    <li
                      key={share.shareId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        gap: "12px",
                      }}
                    >
                      <span>
                        <strong>{share.name || "Untitled"}</strong> — invited as{" "}
                        {share.role === "editor" ? "an editor" : "a viewer"}
                      </span>
                      <span style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => void handleAccept(share)}
                          disabled={acceptingId === share.shareId}
                        >
                          {acceptingId === share.shareId ? "Accepting..." : "Accept"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDecline(share)}
                          disabled={decliningId === share.shareId}
                        >
                          {decliningId === share.shareId ? "Declining..." : "Decline"}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="product-studio__library" aria-labelledby="shared-heading">
              <header>
                <div>
                  <h2 id="shared-heading">Editors shared with you</h2>
                </div>
              </header>
              {loading ? (
                <p>Loading...</p>
              ) : shared.length === 0 ? (
                <p>Nothing here yet. Accepted invites will show up in this list.</p>
              ) : (
                <div className="product-studio__grid">
                  {shared.map((editor) => (
                    <Link
                      key={editor.id}
                      href={`/gte/${editor.id}`}
                      className="product-studio__tab"
                      onPointerDown={() => void gteApi.prefetchEditor(editor.id).catch(() => {})}
                    >
                      <span>
                        <strong>{editor.name || "Untitled"}</strong>
                        <small>{editor.role === "editor" ? "Can edit" : "Can view"}</small>
                        <em>{relativeUpdatedAt(editor.updatedAt)}</em>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login?next=%2Fshared",
        permanent: false,
      },
    };
  }
  return { props: { userId: session.user.id } };
};
