import type { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import NoIndexHead from "../components/NoIndexHead";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import { gteApi } from "../lib/gteApi";
import {
  invalidateEditorListCache,
  readEditorListCache,
  writeEditorListCache,
} from "../lib/gteEditorListCache";
import { hasPremiumEntitlement } from "../lib/premiumEntitlement";
import type { EditorListItem } from "../types/gte";
import { authOptions } from "./api/auth/[...nextauth]";

type ProductHomeProps = {
  userId: string;
  firstName: string;
  role: string;
  creditsRemaining: number | null;
  creditsLimit: number | null;
  creditsUnlimited: boolean;
  localPreview?: boolean;
  initialEditors?: EditorListItem[];
};

const editorName = (editor: EditorListItem) => editor.name?.trim() || "Untitled tab";

const editorLoadMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (!message || message.startsWith("{") || /authenticated|unauthorized/i.test(message)) {
    return "Your recent work could not be loaded.";
  }
  return message;
};

const editorActivity = (editor: EditorListItem) => {
  const notes = Math.max(0, editor.noteCount || 0);
  const chords = Math.max(0, editor.chordCount || 0);
  if (notes && chords) return `${notes} notes · ${chords} chords`;
  if (notes) return `${notes} ${notes === 1 ? "note" : "notes"}`;
  if (chords) return `${chords} ${chords === 1 ? "chord" : "chords"}`;
  return "Ready to edit";
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
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp))}`;
};

function ProductMark({ product }: { product: "transcriber" | "editor" }) {
  if (product === "transcriber") {
    return (
      <span className="product-home__product-mark product-home__product-mark--transcriber" aria-hidden="true">
        <svg viewBox="0 0 56 56" focusable="false">
          <path className="mark-guide" d="M11 18.5h34M11 28h34M11 37.5h34" />
          <path className="mark-wave" d="M13 30v-4M18 34V22M23 38V18M28 33V23M33 30v-4" />
          <path className="mark-route" d="M37 28h7m-3.5-3.5L44 28l-3.5 3.5" />
        </svg>
      </span>
    );
  }

  return (
    <span className="product-home__product-mark product-home__product-mark--editor" aria-hidden="true">
      <svg viewBox="0 0 56 56" focusable="false">
        <path className="mark-strings" d="M11 16h34M11 21h34M11 26h34M11 31h34M11 36h34M11 41h34" />
        <path className="mark-frets" d="M20 14v29M31 14v29M42 14v29" />
        <circle cx="25.5" cy="21" r="3" />
        <circle cx="36.5" cy="31" r="3" />
        <path className="mark-caret" d="M14 34.5v7" />
      </svg>
    </span>
  );
}

function SidebarIcon({ name }: { name: "home" | "transcriber" | "tabs" }) {
  if (name === "home") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3.5 9 6.5-5.5L16.5 9v7.5h-5v-4h-3v4h-5Z" /></svg>;
  }
  if (name === "transcriber") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h2m2-4v8m3-11v14m3-10v6m3-3h-1" /></svg>;
  }
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13m-13 4.5h13m-13 4.5h8" /></svg>;
}

function CurrentTabArtwork() {
  return (
    <span className="product-home__tab-art" aria-hidden="true">
      <span className="product-home__tab-art-title" />
      <span className="product-home__tab-art-staff">
        <i /><i /><i /><i /><i /><i />
        <b className="product-home__tab-note product-home__tab-note--one" />
        <b className="product-home__tab-note product-home__tab-note--two" />
        <b className="product-home__tab-note product-home__tab-note--three" />
      </span>
      <span className="product-home__tab-art-footer">TAB</span>
    </span>
  );
}

export default function ProductHome({
  userId,
  firstName,
  role,
  creditsRemaining,
  creditsLimit,
  creditsUnlimited,
  localPreview = false,
  initialEditors = [],
}: ProductHomeProps) {
  const router = useRouter();
  const [editors, setEditors] = useState<EditorListItem[]>(initialEditors);
  const [loading, setLoading] = useState(!localPreview);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const viewTrackedRef = useRef(false);
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
  const latestEditor = recentEditors[0] || null;
  const creditPercent =
    creditsLimit && creditsRemaining !== null
      ? Math.max(0, Math.min(100, (creditsRemaining / creditsLimit) * 100))
      : null;
  const hasCreditBalance = creditsRemaining !== null;
  const accountLabel = hasCreditBalance
    ? "Monthly credits"
    : isPremium
      ? "Premium plan"
      : "Free plan";
  const accountValue = creditsUnlimited
    ? "Unlimited"
    : hasCreditBalance
      ? `${creditsRemaining} left`
      : isPremium
        ? "Active"
        : "10 credits monthly";

  const loadEditors = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setLoadError(null);
      try {
        const response = await gteApi.listEditors();
        const nextEditors = response.editors || [];
        setEditors(nextEditors);
        writeEditorListCache(window.sessionStorage, userId, nextEditors);
      } catch (error: unknown) {
        setLoadError(editorLoadMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (localPreview) return;
    const cached = readEditorListCache(window.sessionStorage, userId);
    const hasCache = Boolean(cached.editors);
    if (cached.editors) {
      setEditors(cached.editors);
      setLoading(false);
    }
    if (!cached.isFresh) void loadEditors(!hasCache);
  }, [loadEditors, localPreview, userId]);

  useEffect(() => {
    if (loading || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    sendEvent(ANALYTICS_EVENTS.productHomeViewed, {
      has_recent_work: recentEditors.length > 0,
      plan: isPremium ? "premium" : "free",
    });
  }, [isPremium, loading, recentEditors.length]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setLoadError(null);
    trackCtaClick("product_home_new_tab", { surface: "product_home" });
    try {
      const created = await gteApi.createEditor();
      invalidateEditorListCache(window.sessionStorage, userId);
      await router.push(`/gte/${created.editorId}`);
    } catch {
      setLoadError("A new tab could not be created.");
      setCreating(false);
    }
  };

  const trackHomeCta = (cta: string) =>
    trackCtaClick(cta, { surface: "product_home", plan: isPremium ? "premium" : "free" });

  return (
    <>
      <NoIndexHead title="Home | Note2Tabs" canonicalPath="/home" />
      <main className="product-home product-home--studio">
        <div className="container product-studio-layout">
          <aside className="product-studio-sidebar" aria-label="Workspace navigation">
            <nav>
              <Link href="/home" className="is-active"><SidebarIcon name="home" />Home</Link>
              <Link href="/transcribe" onClick={() => trackHomeCta("product_home_sidebar_transcribe")}><SidebarIcon name="transcriber" />Transcriber</Link>
              <Link href="/gte" onClick={() => trackHomeCta("product_home_sidebar_editors")}><SidebarIcon name="tabs" />My tabs</Link>
            </nav>
            <div className="product-studio-sidebar__recent">
              <header><span>Recent tabs</span><Link href="/gte">View all</Link></header>
              {recentEditors.slice(0, 4).map((editor) => (
                <Link key={editor.id} href={`/gte/${editor.id}`} onPointerDown={() => void gteApi.prefetchEditor(editor.id).catch(() => {})}>{editorName(editor)}</Link>
              ))}
              {!loading && recentEditors.length === 0 && <small>No tabs yet</small>}
            </div>
            {!isPremium && <Link className="product-studio-sidebar__premium" href="/pricing?source=product_home" onClick={() => trackHomeCta("product_home_sidebar_premium")}><strong>Premium</strong><span>More credits and full-song uploads</span><i>Explore →</i></Link>}
          </aside>
          <div className="product-studio">
          <header className="product-studio__welcome">
            <div>
              <p>Your workspace</p>
              <h1>Welcome back{firstName ? `, ${firstName}` : ""}</h1>
            </div>
            <div className="product-studio__credits" role="status" aria-label="Account usage">
              <span>{accountLabel}</span>
              <strong>{accountValue}</strong>
              {creditPercent !== null && <i><b style={{ width: `${creditPercent}%` }} /></i>}
            </div>
          </header>

          <section className="product-studio__start" aria-labelledby="studio-start-title">
            <span className="product-hub__doodle product-hub__doodle--guitar" aria-hidden="true" />
            <span className="product-hub__doodle product-hub__doodle--notes" aria-hidden="true" />
            <div className="product-studio__start-copy">
              <p>Start creating</p>
              <h2 id="studio-start-title">What would you like to make?</h2>
              <span>Transcribe a recording or begin with a blank tab.</span>
              <div className="product-studio__actions" aria-label="Start creating">
                <Link href="/transcribe" onClick={() => trackHomeCta("product_home_transcribe")}>
                  <ProductMark product="transcriber" />
                  <span><strong>Transcribe a recording</strong><small>Turn audio or YouTube into an editable tab</small></span>
                  <i aria-hidden="true">→</i>
                </Link>
                <button type="button" onClick={handleCreate} disabled={creating}>
                  <ProductMark product="editor" />
                  <span><strong>{creating ? "Creating your tab…" : "Start a blank tab"}</strong><small>Write, arrange, play, and practice</small></span>
                  <i aria-hidden="true">→</i>
                </button>
              </div>
              {latestEditor && (
                <Link href={`/gte/${latestEditor.id}`} className="product-studio__continue" onPointerDown={() => void gteApi.prefetchEditor(latestEditor.id).catch(() => {})} onClick={() => trackHomeCta("product_home_continue_editor")}>
                  <span>Continue where you left off</span><strong>{editorName(latestEditor)}</strong><small>{relativeUpdatedAt(latestEditor.updatedAt)} · Open →</small>
                </Link>
              )}
            </div>
          </section>

          {loadError && recentEditors.length === 0 && <div className="product-home__error" role="alert"><span>{loadError}</span><button type="button" onClick={() => void loadEditors(true)}>Try again</button></div>}

          <section className="product-studio__library" aria-labelledby="recent-heading">
            <header><div><p>Your library</p><h2 id="recent-heading">Recent tabs</h2></div><Link href="/gte" onClick={() => trackHomeCta("product_home_view_all_editors")}>View all tabs →</Link></header>
            {loading && !latestEditor ? (
              <div className="product-studio__grid" aria-live="polite" aria-busy="true">{[0, 1, 2].map((item) => <div className="product-hub__skeleton" key={item} aria-hidden="true" />)}<span className="sr-only">Loading your recent tabs</span></div>
            ) : recentEditors.length > 0 ? (
              <div className="product-studio__grid">
                {recentEditors.map((editor) => (
                  <Link key={editor.id} href={`/gte/${editor.id}`} className="product-studio__tab" onPointerDown={() => void gteApi.prefetchEditor(editor.id).catch(() => {})} onClick={() => trackHomeCta("product_home_recent_editor")}>
                    <CurrentTabArtwork />
                    <span><strong>{editorName(editor)}</strong><small>{editorActivity(editor)}</small><em>{relativeUpdatedAt(editor.updatedAt)}</em></span>
                  </Link>
                ))}
                <button className="product-studio__new" type="button" onClick={handleCreate} disabled={creating}><i aria-hidden="true">+</i><span><strong>New tab</strong><small>Start with a clean canvas</small></span></button>
              </div>
            ) : (
              <div className="product-home__empty-recents"><span className="product-home__empty-paper" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span><div><h3>Your tabs will live here.</h3><p>Anything you transcribe or create is saved to your library.</p></div></div>
            )}
          </section>
          {!isPremium && <Link href="/pricing?source=product_home" className="product-studio__premium" onClick={() => trackHomeCta("product_home_premium_footer")}><span><strong>Need more transcription room?</strong><small>Premium includes 100 monthly credits, rollover, and full-length uploads.</small></span><i>Explore Premium →</i></Link>}
          </div>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ProductHomeProps> = async (ctx) => {
  if (process.env.NODE_ENV === "development") {
    const now = Date.now();
    return {
      props: {
        userId: "local-home-preview",
        firstName: "Alex",
        role: "USER",
        creditsRemaining: 7,
        creditsLimit: 10,
        creditsUnlimited: false,
        localPreview: true,
        initialEditors: [
          {
            id: "local-preview-1",
            name: "Midnight practice",
            updatedAt: new Date(now - 55 * 60_000).toISOString(),
            noteCount: 84,
            chordCount: 12,
          },
          {
            id: "local-preview-2",
            name: "New idea",
            updatedAt: new Date(now - 24 * 60 * 60_000).toISOString(),
            noteCount: 28,
          },
          {
            id: "local-preview-3",
            name: "Acoustic arrangement",
            updatedAt: new Date(now - 2 * 24 * 60 * 60_000).toISOString(),
            chordCount: 18,
          },
        ],
      },
    };
  }

  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login?next=%2Fhome",
        permanent: false,
      },
    };
  }

  const rawName = session.user.name?.trim() || "";
  const firstName = rawName.split(/\s+/)[0]?.slice(0, 40) || "";
  return {
    props: {
      userId: session.user.id,
      firstName,
      role: session.user.role || "USER",
      creditsRemaining: session.user.monthlyCreditsRemaining ?? null,
      creditsLimit: session.user.monthlyCreditsLimit ?? null,
      creditsUnlimited: Boolean(session.user.monthlyCreditsUnlimited),
    },
  };
};
