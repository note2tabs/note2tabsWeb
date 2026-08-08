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

export default function ProductHome({
  userId,
  firstName,
  role,
  creditsRemaining,
  creditsLimit,
  creditsUnlimited,
}: ProductHomeProps) {
  const router = useRouter();
  const [editors, setEditors] = useState<EditorListItem[]>([]);
  const [loading, setLoading] = useState(true);
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
        .slice(0, 3),
    [editors]
  );
  const latestEditor = recentEditors[0] || null;
  const creditPercent =
    creditsLimit && creditsRemaining !== null
      ? Math.max(0, Math.min(100, (creditsRemaining / creditsLimit) * 100))
      : null;

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
    const cached = readEditorListCache(window.sessionStorage, userId);
    const hasCache = Boolean(cached.editors);
    if (cached.editors) {
      setEditors(cached.editors);
      setLoading(false);
    }
    if (!cached.isFresh) void loadEditors(!hasCache);
  }, [loadEditors, userId]);

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
      <main className="product-home">
        <div className="product-home__wash" aria-hidden="true">
          <span className="product-home__wash-note product-home__wash-note--one" />
          <span className="product-home__wash-note product-home__wash-note--two" />
        </div>
        <div className="container product-home__shell">
          <header className="product-home__header">
            <div>
              <p>Welcome back{firstName ? `, ${firstName}` : ""}</p>
            </div>
            <div className="product-home__account" role="status" aria-label="Account usage">
              <div className="product-home__account-heading">
                <span>{isPremium ? "Premium plan" : "Monthly credits"}</span>
                <strong>
                  {creditsUnlimited
                    ? "Unlimited"
                    : creditsRemaining !== null
                      ? `${creditsRemaining} left`
                      : isPremium
                        ? "Active"
                        : "Free"}
                </strong>
              </div>
              {creditPercent !== null && (
                <div className="product-home__credit-track" aria-hidden="true">
                  <span style={{ width: `${creditPercent}%` }} />
                </div>
              )}
            </div>
          </header>

          <section className="product-home__hero" aria-labelledby="product-home-title">
            <div className="product-home__hero-copy">
              <p className="product-home__eyebrow">Your music, ready when you are</p>
              <h1 id="product-home-title">What will you play next?</h1>
              <p>Transcribe a recording or shape an idea into a tab.</p>
            </div>

            <div className="product-home__launcher">
              <Link
                href="/transcribe"
                className="product-home__launch-option product-home__launch-option--transcribe"
                onClick={() => trackHomeCta("product_home_transcribe")}
              >
                <span className="product-home__launch-art product-home__launch-art--wave" aria-hidden="true">
                  <i /><i /><i /><i /><i /><i /><i />
                </span>
                <span className="product-home__launch-copy">
                  <strong>Transcribe audio</strong>
                  <small>Audio file or YouTube</small>
                </span>
                <span className="product-home__launch-arrow" aria-hidden="true">→</span>
              </Link>
              <button
                className="product-home__launch-option"
                type="button"
                onClick={handleCreate}
                disabled={creating}
              >
                <span className="product-home__launch-art product-home__launch-art--tab" aria-hidden="true">
                  <i /><i /><i /><i /><i /><i />
                </span>
                <span className="product-home__launch-copy">
                  <strong>{creating ? "Creating your tab…" : "Start a blank tab"}</strong>
                  <small>Write, arrange, and practice</small>
                </span>
                <span className="product-home__launch-arrow" aria-hidden="true">→</span>
              </button>
            </div>

            <div className="product-home__hero-links">
              <Link href="/gte" onClick={() => trackHomeCta("product_home_editor_library")}>
                Open editor library
              </Link>
              {!isPremium && (
                <Link href="/pricing?source=product_home" onClick={() => trackHomeCta("product_home_premium_hero")}>
                  See what Premium unlocks
                </Link>
              )}
            </div>
          </section>

          {loadError && recentEditors.length === 0 && (
            <div className="product-home__error" role="alert">
              <span>{loadError}</span>
              <button type="button" onClick={() => void loadEditors(true)}>Try again</button>
            </div>
          )}

          <section className="product-home__section product-home__recents" aria-labelledby="recent-heading">
            <div className="product-home__section-heading">
              <div>
                <h2 id="recent-heading">Recent tabs</h2>
                <p>Continue from where you left off.</p>
              </div>
              {recentEditors.length > 0 && (
                <Link href="/gte" onClick={() => trackHomeCta("product_home_view_all_editors")}>View all</Link>
              )}
            </div>
            {loading && !latestEditor ? (
              <div className="product-home__recent-grid" aria-live="polite" aria-busy="true">
                {[0, 1, 2].map((item) => (
                  <div className="product-home__recent-skeleton" key={item} aria-hidden="true" />
                ))}
                <span className="sr-only">Loading your recent tabs</span>
              </div>
            ) : recentEditors.length > 0 ? (
              <div className="product-home__recent-grid">
                {recentEditors.map((editor, index) => (
                  <Link
                    key={editor.id}
                    href={`/gte/${editor.id}`}
                    className={index === 0 ? "product-home__recent-card product-home__recent-card--latest" : "product-home__recent-card"}
                    onPointerDown={() => void gteApi.prefetchEditor(editor.id).catch(() => {})}
                    onClick={() => trackHomeCta(index === 0 ? "product_home_continue_editor" : "product_home_recent_editor")}
                  >
                    <span className="product-home__recent-paper" aria-hidden="true">
                      <span className="product-home__paper-title" />
                      <i /><i /><i /><i /><i /><i />
                      <b className="product-home__paper-note product-home__paper-note--one" />
                      <b className="product-home__paper-note product-home__paper-note--two" />
                      <b className="product-home__paper-note product-home__paper-note--three" />
                    </span>
                    <span className="product-home__recent-details">
                      <strong>{editorName(editor)}</strong>
                      <small>{editorActivity(editor)}</small>
                      <span>{relativeUpdatedAt(editor.updatedAt)}</span>
                    </span>
                  </Link>
                ))}
                <button className="product-home__recent-card product-home__recent-card--new" type="button" onClick={handleCreate} disabled={creating}>
                  <span className="product-home__new-mark" aria-hidden="true" />
                  <span>
                    <strong>{creating ? "Creating…" : "New tab"}</strong>
                    <small>Start with a clean canvas</small>
                  </span>
                </button>
              </div>
            ) : (
              <div className="product-home__empty-recents">
                <span className="product-home__empty-paper" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
                <div>
                  <h3>Your tabs will live here.</h3>
                  <p>Anything you transcribe or create is saved to your library.</p>
                </div>
              </div>
            )}
          </section>

          {!isPremium && recentEditors.length > 0 && (
            <aside className="product-home__premium" aria-label="Premium plan">
              <div>
                <span>Note2Tabs Premium</span>
                <p>100 monthly credits, more room for Heavy, and full-length audio files.</p>
              </div>
              <Link
                href="/pricing?source=product_home"
                onClick={() => trackHomeCta("product_home_premium")}
              >
                Explore Premium <span aria-hidden="true">→</span>
              </Link>
            </aside>
          )}
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ProductHomeProps> = async (ctx) => {
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
