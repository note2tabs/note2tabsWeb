import type { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { useCallback, useEffect, useMemo, useState } from "react";
import NoIndexHead from "../components/NoIndexHead";
import WorkspaceSidebar from "../components/WorkspaceSidebar";
import { gteApi } from "../lib/gteApi";
import { hasPremiumEntitlement } from "../lib/premiumEntitlement";
import type { EditorListItem, OutgoingCanvasShare, PendingCanvasShare, SharedEditorListItem, SharedEditorRole } from "../types/gte";
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

function SharedTabArtwork() {
  return (
    <span className="shared-page__art" aria-hidden="true">
      <span className="shared-page__art-lines">
        {[0, 1, 2, 3, 4, 5].map((line) => <i key={line} />)}
      </span>
      <span className="shared-page__art-notes">3&nbsp;&nbsp;5&nbsp;&nbsp;7&nbsp;&nbsp;5</span>
    </span>
  );
}

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
  const [view, setView] = useState<"with-me" | "by-me">("with-me");
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState<"all" | SharedEditorRole>("all");
  const [sort, setSort] = useState<"modified" | "name">("modified");

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
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredShared = useMemo(() => [...shared]
    .filter((editor) => !normalizedQuery || (editor.name || "Untitled").toLocaleLowerCase().includes(normalizedQuery))
    .filter((editor) => access === "all" || editor.role === access)
    .sort((left, right) => sort === "name"
      ? (left.name || "Untitled").localeCompare(right.name || "Untitled")
      : new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()),
  [access, normalizedQuery, shared, sort]);
  const filteredPending = useMemo(() => pending.filter((share) =>
    (!normalizedQuery || (share.name || "Untitled").toLocaleLowerCase().includes(normalizedQuery))
    && (access === "all" || share.role === access)), [access, normalizedQuery, pending]);
  const filteredOutgoing = useMemo(() => outgoing.map((entry) => {
    const tabMatches = !normalizedQuery || (entry.name || "Untitled").toLocaleLowerCase().includes(normalizedQuery);
    const visibleCollaborators = entry.collaborators.filter((collaborator) =>
      (access === "all" || collaborator.role === access)
      && (tabMatches || collaborator.email.toLocaleLowerCase().includes(normalizedQuery)));
    return { ...entry, visibleCollaborators };
  })
    .filter((entry) => entry.visibleCollaborators.length > 0)
    .sort((left, right) => sort === "name"
      ? (left.name || "Untitled").localeCompare(right.name || "Untitled")
      : new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()),
  [access, normalizedQuery, outgoing, sort]);

  const selectView = (next: "with-me" | "by-me") => setView(next);
  const clearFilters = () => { setQuery(""); setAccess("all"); };
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "ArrowLeft" || event.key === "Home" ? "with-me" : "by-me";
    selectView(next);
    document.getElementById(`shared-tab-${next}`)?.focus();
  };

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
          <div className="product-studio shared-page">
            <header className="shared-page__header">
              <div>
                <h1>Shared tabs</h1>
              </div>
              {!loading && (
                <div className="shared-page__summary" aria-label="Sharing summary">
                  <span><strong>{shared.length}</strong> shared with you</span>
                  <i aria-hidden="true" />
                  <span><strong>{outgoing.reduce((total, entry) => total + entry.collaborators.length, 0)}</strong> collaborators</span>
                </div>
              )}
            </header>

            <div className="shared-page__toolbar">
              <div className="shared-page__tabs" role="tablist" aria-label="Shared tab views">
                <button id="shared-tab-with-me" type="button" role="tab" aria-selected={view === "with-me"} aria-controls="shared-panel-with-me" tabIndex={view === "with-me" ? 0 : -1} onKeyDown={handleTabKeyDown} onClick={() => selectView("with-me")}>Shared with me</button>
                <button id="shared-tab-by-me" type="button" role="tab" aria-selected={view === "by-me"} aria-controls="shared-panel-by-me" tabIndex={view === "by-me" ? 0 : -1} onKeyDown={handleTabKeyDown} onClick={() => selectView("by-me")}>Shared by me</button>
              </div>
              <div className="shared-page__filters">
                <label className="shared-page__search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shared tabs" aria-label="Search shared tabs" /></label>
                <select value={access} onChange={(event) => setAccess(event.target.value as "all" | SharedEditorRole)} aria-label="Filter by access"><option value="all">All access</option><option value="editor">Can edit</option><option value="viewer">View only</option></select>
                <select value={sort} onChange={(event) => setSort(event.target.value as "modified" | "name")} aria-label="Sort shared tabs"><option value="modified">Last modified</option><option value="name">Name</option></select>
              </div>
            </div>

            {error && <div className="product-home__error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}

            {view === "with-me" && (loading || filteredPending.length > 0) && <section className="shared-page__section shared-page__section--invites" aria-labelledby="pending-heading">
              <header><div><h2 id="pending-heading">Invitations</h2></div>{!loading && <span>{filteredPending.length}</span>}</header>
              {loading ? (
                <div className="shared-page__skeleton" aria-label="Loading invitations" />
              ) : (
                <ul className="shared-page__invite-list">
                  {filteredPending.map((share) => (
                    <li key={share.shareId}>
                      <span className="shared-page__invite-icon" aria-hidden="true">↗</span>
                      <span className="shared-page__invite-copy"><strong>{share.name || "Untitled"}</strong><small>You were invited to {share.role === "editor" ? "edit this tab" : "view this tab"}</small></span>
                      <span className="shared-page__invite-actions">
                        <button
                          className="shared-page__button shared-page__button--primary"
                          type="button"
                          onClick={() => void handleAccept(share)}
                          disabled={acceptingId === share.shareId}
                        >
                          {acceptingId === share.shareId ? "Accepting..." : "Accept"}
                        </button>
                        <button
                          className="shared-page__button"
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
            </section>}

            {view === "with-me" && <section id="shared-panel-with-me" role="tabpanel" aria-labelledby="shared-tab-with-me" className="shared-page__section shared-page__section--table">
              {loading ? (
                <div className="shared-page__rows" aria-label="Loading shared tabs">{[0, 1, 2].map((item) => <div className="shared-page__row-skeleton" key={item} />)}</div>
              ) : filteredShared.length === 0 ? (
                <div className="shared-page__empty"><span aria-hidden="true">↗</span><div><h3>{query || access !== "all" ? "No matching tabs" : "No shared tabs yet"}</h3><p>{query || access !== "all" ? "Try changing your search or access filter." : "When someone invites you to a tab, it will appear here after you accept it."}</p></div>{(query || access !== "all") && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>
              ) : (
                <div className="shared-page__rows"><table><thead><tr><th>Tab</th><th>Access</th><th>Modified</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{filteredShared.map((editor) => (
                  <tr key={editor.id}>
                    <th scope="row"><Link href={`/gte/${editor.id}`} onPointerDown={() => void gteApi.prefetchEditor(editor.id).catch(() => {})}><SharedTabArtwork /><span className="shared-page__tab-copy"><strong>{editor.name || "Untitled"}</strong></span></Link></th>
                    <td><small>{editor.role === "editor" ? "Can edit" : "View only"}</small></td>
                    <td><em>{relativeUpdatedAt(editor.updatedAt)}</em></td>
                    <td><Link href={`/gte/${editor.id}`} aria-label={`Open ${editor.name || "Untitled"}`}>→</Link></td>
                  </tr>
                ))}</tbody></table></div>
              )}
            </section>}

            {view === "by-me" && <section id="shared-panel-by-me" role="tabpanel" aria-labelledby="shared-tab-by-me" className="shared-page__section shared-page__section--table">
              {loading ? (
                <div className="shared-page__skeleton" aria-label="Loading collaborators" />
              ) : filteredOutgoing.length === 0 ? (
                <div className="shared-page__empty"><span aria-hidden="true">＋</span><div><h3>{query || access !== "all" ? "No matching shared tabs" : "No collaborators yet"}</h3><p>{query || access !== "all" ? "Try changing your search or access filter." : "Open one of your tabs and choose Share to invite someone."}</p></div>{query || access !== "all" ? <button type="button" onClick={clearFilters}>Clear filters</button> : <Link href="/gte">View your tabs →</Link>}</div>
              ) : (
                <ul className="shared-page__outgoing">
                  {filteredOutgoing.map((entry) => (
                    <li key={entry.canvasId} className="shared-page__outgoing-card">
                      <details>
                        <summary>
                          <span className="shared-page__outgoing-name">{entry.name || "Untitled"}</span>
                          <span className="shared-page__outgoing-meta">
                          <span className="shared-page__outgoing-count">{entry.visibleCollaborators.length} {entry.visibleCollaborators.length === 1 ? "collaborator" : "collaborators"}</span>
                            <svg className="shared-page__chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
                          </span>
                        </summary>
                        <div className="shared-page__outgoing-body">
                          <Link href={`/gte/${entry.canvasId}`} className="shared-page__open-tab">Open tab →</Link>
                          <ul>
                            {entry.visibleCollaborators.map((collaborator) => (
                              <li key={collaborator.shareId}>
                                <span className="shared-page__avatar" aria-hidden="true">{collaborator.email.slice(0, 1).toUpperCase()}</span>
                                <span className="shared-page__person"><strong>{collaborator.email}</strong><small>{collaborator.role === "editor" ? "Can edit" : "View only"}{collaborator.status === "pending" ? " · Invitation pending" : ""}</small></span>
                                <button
                                  className="shared-page__remove"
                                  type="button"
                                  onClick={() => void handleRevokeCollaborator(entry.canvasId, collaborator.shareId)}
                                  disabled={revokingId === collaborator.shareId}
                                >
                                  {revokingId === collaborator.shareId ? "Removing..." : "Remove"}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </section>}
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
        destination: `/auth/login?next=${encodeURIComponent(ctx.resolvedUrl || "/shared")}`,
        permanent: false,
      },
    };
  }
  return { props: { userId: session.user.id, role: session.user.role || "USER" } };
};
