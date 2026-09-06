import type { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { useCallback, useEffect, useMemo, useState } from "react";
import NoIndexHead from "../components/NoIndexHead";
import WorkspaceSidebar from "../components/WorkspaceSidebar";
import { gteApi } from "../lib/gteApi";
import { hasPremiumEntitlement } from "../lib/premiumEntitlement";
import type { EditorListItem, OutgoingCanvasShare, PendingCanvasShare, SharedEditorListItem } from "../types/gte";
import { authOptions } from "./api/auth/[...nextauth]";

type Props = {
  userId: string;
  role?: string;
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

export default function SharedWithYouPage({ role }: Props) {
  const [pending, setPending] = useState<PendingCanvasShare[]>([]);
  const [shared, setShared] = useState<SharedEditorListItem[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingCanvasShare[]>([]);
  const [editors, setEditors] = useState<EditorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [decliningId, setDecliningId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const isPremium = hasPremiumEntitlement({ user: { role } });
  const recentEditors = useMemo(
    () =>
      [...editors]
        .sort((left, right) => {
          const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
          const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
          return rightTime - leftTime;
        })
        .slice(0, 6),
    [editors]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, editorsRes, outgoingRes] = await Promise.all([
        gteApi.listPendingShares(),
        gteApi.listEditors(),
        gteApi.listOutgoingShares(),
      ]);
      setPending(pendingRes.pending || []);
      setShared(editorsRes.sharedEditors || []);
      setEditors(editorsRes.editors || []);
      setOutgoing(outgoingRes.outgoing || []);
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

  const handleRevokeCollaborator = useCallback(
    async (canvasId: string, shareId: number) => {
      setRevokingId(shareId);
      try {
        await gteApi.revokeShare(canvasId, shareId);
        setOutgoing((prev) =>
          prev
            .map((entry) =>
              entry.canvasId === canvasId
                ? { ...entry, collaborators: entry.collaborators.filter((c) => c.shareId !== shareId) }
                : entry
            )
            .filter((entry) => entry.collaborators.length > 0)
        );
      } catch {
        setError("Could not remove that collaborator. Try again.");
      } finally {
        setRevokingId(null);
      }
    },
    []
  );

  return (
    <>
      <NoIndexHead title="Shared with you | Note2Tabs" canonicalPath="/shared" />
      <main className="product-home product-home--studio">
        <div className="container product-studio-layout">
          <WorkspaceSidebar
            active="shared"
            recentEditors={recentEditors}
            loading={loading}
            isPremium={isPremium}
            analyticsSurface="product_shared"
          />
          <div className="product-studio">
            <header className="product-studio__welcome" style={{ justifyContent: "center" }}>
              <h1 style={{ textAlign: "center", width: "100%" }}>Shared with you</h1>
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

            <section className="product-studio__library" aria-labelledby="outgoing-heading">
              <header>
                <div>
                  <h2 id="outgoing-heading">Tabs you've shared</h2>
                </div>
              </header>
              {loading ? (
                <p>Loading...</p>
              ) : outgoing.length === 0 ? (
                <p>You haven't shared any tabs yet.</p>
              ) : (
                <ul style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {outgoing.map((entry) => (
                    <li
                      key={entry.canvasId}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "10px 12px",
                      }}
                    >
                      <Link href={`/gte/${entry.canvasId}`}>
                        <strong>{entry.name || "Untitled"}</strong>
                      </Link>
                      <ul style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {entry.collaborators.map((collaborator) => (
                          <li
                            key={collaborator.shareId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "12px",
                            }}
                          >
                            <span>
                              {collaborator.email} — {collaborator.role === "editor" ? "can edit" : "can view"}
                              {collaborator.status === "pending" ? " · invite pending" : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleRevokeCollaborator(entry.canvasId, collaborator.shareId)}
                              disabled={revokingId === collaborator.shareId}
                            >
                              {revokingId === collaborator.shareId ? "Removing..." : "Remove"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
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
  return { props: { userId: session.user.id, role: session.user.role || "USER" } };
};
