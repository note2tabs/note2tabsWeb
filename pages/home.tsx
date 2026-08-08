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
        .slice(0, 4),
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
        <div className="container product-home__shell">
          <header className="product-home__header">
            <div>
              <p className="product-home__eyebrow">Your workspace</p>
              <h1>Welcome back{firstName ? `, ${firstName}` : ""}.</h1>
              <p>Pick up where you left off or start something new.</p>
            </div>
            <div className="product-home__account" role="status" aria-label="Account usage">
              <div className="product-home__account-heading">
                <span>{isPremium ? "Premium" : "Monthly credits"}</span>
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

          {loading && !latestEditor ? (
            <section className="product-home__loading" aria-live="polite" aria-busy="true">
              <span className="product-home__loading-line product-home__loading-line--wide" />
              <span className="product-home__loading-line" />
              <span className="product-home__loading-line product-home__loading-line--button" />
              <span className="sr-only">Loading your workspace</span>
            </section>
          ) : latestEditor ? (
            <section className="product-home__continue">
              <div className="product-home__continue-copy">
                <p className="product-home__label">Continue editing</p>
                <h2>{editorName(latestEditor)}</h2>
                <p>
                  {editorActivity(latestEditor)} <span aria-hidden="true">·</span>{" "}
                  {relativeUpdatedAt(latestEditor.updatedAt)}
                </p>
                <Link
                  href={`/gte/${latestEditor.id}`}
                  className="button-primary"
                  onPointerDown={() => void gteApi.prefetchEditor(latestEditor.id).catch(() => {})}
                  onClick={() => trackHomeCta("product_home_continue_editor")}
                >
                  Continue
                </Link>
              </div>
              <div className="product-home__tab-preview" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <i className="product-home__preview-note product-home__preview-note--one" />
                <i className="product-home__preview-note product-home__preview-note--two" />
                <i className="product-home__preview-note product-home__preview-note--three" />
              </div>
            </section>
          ) : (
            <section className="product-home__activation">
              <div>
                <p className="product-home__label">Create your first tab</p>
                <h2>Turn a recording into something you can play.</h2>
                <p>Start with audio, or open a blank tab and build it yourself.</p>
              </div>
              <div className="product-home__activation-actions">
                <Link
                  href="/transcribe"
                  className="button-primary"
                  onClick={() => trackHomeCta("product_home_first_transcription")}
                >
                  Transcribe audio
                </Link>
                <button className="button-secondary" type="button" onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating…" : "Start a blank tab"}
                </button>
              </div>
            </section>
          )}

          {loadError && (
            <div className="product-home__error" role="alert">
              <span>{loadError}</span>
              <button type="button" onClick={() => void loadEditors(true)}>Try again</button>
            </div>
          )}

          <section className="product-home__section" aria-labelledby="start-heading">
            <div className="product-home__section-heading">
              <div>
                <p className="product-home__label">Start</p>
                <h2 id="start-heading">What would you like to make?</h2>
              </div>
            </div>
            <div className="product-home__actions-grid">
              <Link
                href="/transcribe"
                className="product-home__action product-home__action--primary"
                onClick={() => trackHomeCta("product_home_transcribe")}
              >
                <span>Transcribe audio</span>
                <p>Turn a recording or YouTube clip into an editable tab.</p>
                <strong>Open transcriber</strong>
              </Link>
              <button className="product-home__action" type="button" onClick={handleCreate} disabled={creating}>
                <span>Create a tab</span>
                <p>Write from scratch with notes, chords, playback, and practice tools.</p>
                <strong>{creating ? "Creating…" : "Open a blank editor"}</strong>
              </button>
              <Link
                href="/gte"
                className="product-home__action"
                onClick={() => trackHomeCta("product_home_editor_library")}
              >
                <span>Open your library</span>
                <p>Find every saved tab or import a tab file.</p>
                <strong>View all editors</strong>
              </Link>
            </div>
          </section>

          {recentEditors.length > 1 && (
            <section className="product-home__section" aria-labelledby="recent-heading">
              <div className="product-home__section-heading">
                <div>
                  <p className="product-home__label">Recent work</p>
                  <h2 id="recent-heading">Your tabs</h2>
                </div>
                <Link href="/gte" onClick={() => trackHomeCta("product_home_view_all_editors")}>View all</Link>
              </div>
              <div className="product-home__recent-list">
                {recentEditors.map((editor) => (
                  <Link
                    key={editor.id}
                    href={`/gte/${editor.id}`}
                    onPointerDown={() => void gteApi.prefetchEditor(editor.id).catch(() => {})}
                    onClick={() => trackHomeCta("product_home_recent_editor")}
                  >
                    <span className="product-home__recent-mark" aria-hidden="true" />
                    <span className="product-home__recent-copy">
                      <strong>{editorName(editor)}</strong>
                      <small>{editorActivity(editor)}</small>
                    </span>
                    <span className="product-home__recent-time">{relativeUpdatedAt(editor.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!isPremium && recentEditors.length > 0 && (
            <aside className="product-home__premium" aria-label="Premium plan">
              <div>
                <p className="product-home__label">Note2Tabs Premium</p>
                <h2>More room for the recordings that need it.</h2>
                <p>Get 100 monthly credits, use Heavy more often, and transcribe full-length audio files.</p>
              </div>
              <Link
                href="/pricing?source=product_home"
                className="button-secondary"
                onClick={() => trackHomeCta("product_home_premium")}
              >
                Explore Premium
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
