import { translatedError } from "../lib/i18n/translate";
import { relativeUpdatedAt } from "../lib/i18n/dates";
import { useLocale } from "../lib/i18n/react";
import type { GetServerSideProps } from "next";
import Link from "../components/LocaleLink";
import { getServerSession } from "next-auth/next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocaleRouter as useRouter } from "../lib/i18n/react";
import NoIndexHead from "../components/NoIndexHead";
import WorkspaceSidebar from "../components/WorkspaceSidebar";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import { gteApi } from "../lib/gteApi";
import {
  invalidateEditorListCache,
  readEditorListCache,
  writeEditorListCache,
} from "../lib/gteEditorListCache";
import { hasPremiumEntitlement } from "../lib/premiumEntitlement";
import { getEditorThumbnail } from "../lib/editorThumbnail";
import {
  RETENTION_INTENT_OPTIONS,
  RETENTION_INTENT_RESEARCH_ENABLED,
  RETENTION_INTENT_PROMPT_DELAY_MS,
  RETENTION_INTENT_PROMPT_VERSION,
  retentionIntentPromptState,
  retentionIntentStorageKey,
  shouldOfferRetentionIntentPrompt,
  type RetentionIntent,
} from "../lib/retentionIntentResearch";
import type { EditorListItem } from "../types/gte";
import { authOptions } from "./api/auth/[...nextauth]";

type ProductHomeProps = {
  userId: string;
  role: string;
  subscriptionPlan: "FREE" | "PREMIUM" | "PRO";
  creditsRemaining: number | null;
  creditsLimit: number | null;
  creditsUnlimited: boolean;
  localPreview?: boolean;
  initialEditors?: EditorListItem[];
};

type PremiumSubscriptionStatus = {
  status: string;
  plan?: string;
  isTrial: boolean;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  accessEndsAt: string | null;
};

const trialDaysRemaining = (endsAt: string | null) => {
  if (!endsAt) return null;
  const remaining = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(remaining)) return null;
  return Math.max(0, Math.ceil(remaining / 86_400_000));
};

const shortDate = (value: string | null, locale: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "pt-BR" ? "pt-BR" : "en-US", { month: "short", day: "numeric" }).format(date);
};

const editorName = (editor: EditorListItem) => editor.name?.trim() || "Untitled tab";

const editorLoadMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (!message || message.startsWith("{") || /authenticated|unauthorized/i.test(message)) {
    return "We could not load your recent tabs. Check your connection and try again; your saved work is unchanged.";
  }
  return message;
};

const editorActivity = (editor: EditorListItem, t: (s: string, v?: Record<string, string | number>) => string) => {
  const notes = Math.max(0, editor.noteCount || 0);
  const chords = Math.max(0, editor.chordCount || 0);
  if (notes && chords) return t("{notes} notes · {chords} chords", {notes, chords});
  if (notes) return `${notes} ${t(notes === 1 ? "note" : "notes")}`;
  if (chords) return `${chords} ${t(chords === 1 ? "chord" : "chords")}`;
  return "Ready to edit";
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

function CurrentTabArtwork({ editor }: { editor: EditorListItem }) {
  const { t, locale } = useLocale();
  const { previewNotes, label } = getEditorThumbnail(editor);
  const firstFrame = previewNotes[0]?.startTime ?? 0;
  const lastFrame = previewNotes[previewNotes.length - 1]?.startTime ?? firstFrame;
  const frameRange = Math.max(1, lastFrame - firstFrame);

  return (
    <span className="product-home__tab-art product-home__tab-art--thumbnail" aria-hidden="true">
      <span className="product-home__tab-art-title">{t("Tab view")}</span>
      <span className="product-home__tab-art-staff">
        <i /><i /><i /><i /><i /><i />
        <b className="product-home__tab-preview-bar product-home__tab-preview-bar--one" />
        <b className="product-home__tab-preview-bar product-home__tab-preview-bar--two" />
        {previewNotes.map((note, index) => (
          <span
            className="product-home__tab-preview-note"
            key={`${note.startTime}-${note.string}-${note.fret}-${index}`}
            style={{
              left: `${5 + ((note.startTime - firstFrame) / frameRange) * 88}%`,
              top: `${note.string * 12 - 5}px`,
            }}
          >
            {note.fret}
          </span>
        ))}
      </span>
      <span className="product-home__tab-art-footer">
        {t(label)}
      </span>
    </span>
  );
}

export default function ProductHome({
  userId,
  role,
  creditsRemaining,
  creditsLimit,
  creditsUnlimited,
  localPreview = false,
  initialEditors = [],
  subscriptionPlan,
}: ProductHomeProps) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [editors, setEditors] = useState<EditorListItem[]>(initialEditors);
  const [loading, setLoading] = useState(!localPreview);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [subscription, setSubscription] = useState<PremiumSubscriptionStatus | null>(null);
  const [billingPortalBusy, setBillingPortalBusy] = useState(false);
  const [billingRecoveryError, setBillingRecoveryError] = useState<string | null>(null);
  const [showIntentPrompt, setShowIntentPrompt] = useState(false);
  const [intentAnswered, setIntentAnswered] = useState(false);
  const viewTrackedRef = useRef(false);
  const trialActivationTrackedRef = useRef(false);
  const paymentRecoveryTrackedRef = useRef(false);
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
      ? t("{plan} plan", {plan: subscriptionPlan === "PRO" ? "Pro" : "Premium"})
      : "Free plan";
  const accountValue = creditsUnlimited
    ? "Unlimited"
    : hasCreditBalance
      ? t("{count} left", {count: creditsRemaining ?? 0})
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
    if (localPreview || role !== "PREMIUM") return;
    const controller = new AbortController();
    void fetch("/api/stripe/subscription-status", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ subscription: PremiumSubscriptionStatus | null }>;
      })
      .then((payload) => setSubscription(payload?.subscription || null))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [localPreview, role]);

  useEffect(() => {
    if (!router.isReady || router.query.upgrade !== "confirmed") return;
    sendEvent(ANALYTICS_EVENTS.premiumTrialActivationLanded, {
      surface: "product_home",
    });
    // This marker is only analytics state. Removing it through Next's router can
    // fall back to a hard navigation while the route is already `/home`, which
    // Next rejects as an invariant violation. Update the visible URL without a
    // route transition instead.
    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== cleanUrl) {
      window.history.replaceState(window.history.state, "", cleanUrl);
    }
  }, [router.isReady, router.query.upgrade]);

  useEffect(() => {
    if (loading || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    sendEvent(ANALYTICS_EVENTS.productHomeViewed, {
      has_recent_work: recentEditors.length > 0,
      plan: isPremium ? "premium" : "free",
    });
  }, [isPremium, loading, recentEditors.length]);

  useEffect(() => {
    if (!RETENTION_INTENT_RESEARCH_ENABLED) return;
    if (loading || loadError || recentEditors.length > 0 || localPreview) return;

    const storageKey = retentionIntentStorageKey(userId);
    let storedValue: string | null = null;
    try {
      storedValue = window.localStorage.getItem(storageKey);
    } catch {
      // The prompt can still be shown when storage is unavailable.
    }
    if (!shouldOfferRetentionIntentPrompt(storedValue)) return;

    const timeout = window.setTimeout(() => {
      setShowIntentPrompt(true);
      sendEvent(ANALYTICS_EVENTS.retentionIntentPromptShown, {
        prompt_version: RETENTION_INTENT_PROMPT_VERSION,
        surface: "product_home_empty_state",
      });
    }, RETENTION_INTENT_PROMPT_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [loadError, loading, localPreview, recentEditors.length, userId]);

  useEffect(() => {
    if (!intentAnswered) return;
    const timeout = window.setTimeout(() => setShowIntentPrompt(false), 2_500);
    return () => window.clearTimeout(timeout);
  }, [intentAnswered]);

  useEffect(() => {
    if (!subscription?.isTrial || trialActivationTrackedRef.current) return;
    trialActivationTrackedRef.current = true;
    sendEvent(ANALYTICS_EVENTS.premiumTrialActivationShown, {
      has_recent_tab: Boolean(latestEditor),
      cancellation_scheduled: subscription.cancelAtPeriodEnd,
      days_remaining: trialDaysRemaining(subscription.trialEndsAt),
      surface: "product_home",
    });
  }, [latestEditor, subscription]);

  useEffect(() => {
    if (subscription?.status !== "past_due" || paymentRecoveryTrackedRef.current) return;
    paymentRecoveryTrackedRef.current = true;
    sendEvent(ANALYTICS_EVENTS.subscriptionPaymentRecoveryShown, {
      surface: "product_home",
    });
  }, [subscription?.status]);

  const handleBillingRecovery = async () => {
    if (billingPortalBusy) return;
    setBillingPortalBusy(true);
    setBillingRecoveryError(null);
    sendEvent(ANALYTICS_EVENTS.subscriptionPaymentRecoveryClicked, {
      surface: "product_home",
    });
    try {
      const response = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "/home", locale }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Could not open billing details.");
      }
      window.location.href = payload.url;
    } catch (error) {
      setBillingRecoveryError(
        error instanceof Error ? error.message : "Could not open billing details."
      );
      sendEvent(ANALYTICS_EVENTS.subscriptionPaymentRecoveryFailed, {
        surface: "product_home",
      });
      setBillingPortalBusy(false);
    }
  };

  const handleCancellationRecovery = async () => {
    if (billingPortalBusy) return;
    setBillingPortalBusy(true);
    setBillingRecoveryError(null);
    sendEvent(ANALYTICS_EVENTS.subscriptionCancellationRecoveryClicked, {
      surface: "product_home",
      trial: Boolean(subscription?.isTrial),
    });
    try {
      const response = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "/home", locale }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Could not open subscription details.");
      }
      window.location.href = payload.url;
    } catch (error) {
      setBillingRecoveryError(
        error instanceof Error ? error.message : "Could not open subscription details."
      );
      sendEvent(ANALYTICS_EVENTS.subscriptionCancellationRecoveryFailed, {
        surface: "product_home",
        trial: Boolean(subscription?.isTrial),
      });
      setBillingPortalBusy(false);
    }
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setLoadError(null);
    trackCtaClick("product_home_new_tab", { surface: "product_home" });
    try {
      const created = await gteApi.createEditor();
      invalidateEditorListCache(window.sessionStorage, userId);
      await router.push(`/gte/${created.editorId}`);
    } catch (error: unknown) {
      setLoadError(
        error instanceof Error
          ? editorLoadMessage(error)
          : "We could not create a new tab. Check your connection and try again."
      );
      setCreating(false);
    }
  };

  const trackHomeCta = (cta: string) =>
    trackCtaClick(cta, { surface: "product_home", plan: isPremium ? "premium" : "free" });

  const saveIntentPromptState = (status: "answered" | "dismissed") => {
    try {
      window.localStorage.setItem(
        retentionIntentStorageKey(userId),
        retentionIntentPromptState(status)
      );
    } catch {
      // Analytics still records the response when storage is unavailable.
    }
  };

  const handleIntentSelected = (intent: RetentionIntent) => {
    saveIntentPromptState("answered");
    setIntentAnswered(true);
    sendEvent(ANALYTICS_EVENTS.retentionIntentSelected, {
      intent,
      prompt_version: RETENTION_INTENT_PROMPT_VERSION,
      surface: "product_home_empty_state",
    });
  };

  const handleIntentDismissed = () => {
    saveIntentPromptState("dismissed");
    setShowIntentPrompt(false);
    sendEvent(ANALYTICS_EVENTS.retentionIntentPromptDismissed, {
      prompt_version: RETENTION_INTENT_PROMPT_VERSION,
      surface: "product_home_empty_state",
    });
  };

  return (
    <>
      <NoIndexHead title={t("Home | Note2Tabs")} canonicalPath="/home" />
      <main className="product-home product-home--studio">
        <div className="container product-studio-layout">
          <WorkspaceSidebar
            active="home"
            recentEditors={recentEditors}
            loading={loading}
            isPremium={isPremium}
            analyticsSurface="product_home"
          />
          <div className="product-studio">
          <header className="product-studio__welcome">
            <div className="product-studio__credits" role="status" aria-label={t("Account usage")}>
              <span>{t(accountLabel)}</span>
              <strong>{t(accountValue)}</strong>
              {creditPercent !== null && <i><b style={{ width: `${creditPercent}%` }} /></i>}
            </div>
          </header>

          {subscription?.status === "past_due" && (
            <aside className="product-studio__trial" aria-label={t("Premium payment needs attention")}>
              <div>
                <span>{t("Payment needs attention")}</span>
                <strong>{t("Keep your Premium access active")}</strong>
                <small>
                  {t("Update your payment details so your credits, Heavy model access, and full-song uploads continue uninterrupted.")}</small>
                {billingRecoveryError && <small role="alert">{translatedError(billingRecoveryError, locale)}</small>}
              </div>
              <div className="product-studio__trial-actions">
                <button type="button" onClick={handleBillingRecovery} disabled={billingPortalBusy}>
                  {t(billingPortalBusy ? "Opening billing…" : "Update payment")}
                </button>
              </div>
            </aside>
          )}

          {subscription?.isTrial && subscription.status !== "past_due" && (
            <aside className="product-studio__trial" aria-label={t("Premium trial")}>
              <div>
                <span>
                  {subscription.cancelAtPeriodEnd
                    ? t("Premium access until {date}", {date: shortDate(subscription.accessEndsAt, locale) || t("trial end")})
                    : t("Premium trial · {days} days left", {days: trialDaysRemaining(subscription.trialEndsAt) ?? t("A few")})}
                </span>
                <strong>
                  {latestEditor
                    ? t("Keep going with {name}", {name: latestEditor.name?.trim() || t("Untitled tab")})
                    : t("Make something you will want to play again")}
                </strong>
                <small>
                  {t(latestEditor
                    ? "Open your latest tab in Practice and hear how it feels under your fingers."
                    : "Transcribe one recording, then open it in the editor and try Practice.")}
                </small>
                {billingRecoveryError && <small role="alert">{translatedError(billingRecoveryError, locale)}</small>}
              </div>
              <div className="product-studio__trial-actions">
                <Link
                  href={latestEditor ? `/gte/${latestEditor.id}?mode=practice&source=trial_home` : "/transcribe?source=trial_home"}
                  onClick={() => trackHomeCta(latestEditor ? "trial_continue_practice" : "trial_start_transcription")}
                >
                  {t(latestEditor ? "Practice this tab" : "Transcribe a recording")}
                </Link>
                {subscription.cancelAtPeriodEnd && (
                  <button type="button" onClick={handleCancellationRecovery} disabled={billingPortalBusy}>
                    {t(billingPortalBusy ? "Opening…" : "Review subscription")}
                  </button>
                )}
              </div>
            </aside>
          )}

          <section className="product-studio__start" aria-labelledby="studio-start-title">
            <span className="product-hub__doodle product-hub__doodle--guitar" aria-hidden="true" />
            <span className="product-hub__doodle product-hub__doodle--notes" aria-hidden="true" />
            <div className="product-studio__start-copy">
              <h1 id="studio-start-title">{t("What would you like to play next?")}</h1>
              <span>{t("Transcribe a recording or begin with a blank tab.")}</span>
              <div className="product-studio__actions" aria-label={t("Start creating")}>
                <Link href="/transcribe" onClick={() => trackHomeCta("product_home_transcribe")}>
                  <ProductMark product="transcriber" />
                  <span><strong>{t("Transcribe a recording")}</strong><small>{t("Turn audio or YouTube into an editable tab")}</small></span>
                  <i aria-hidden="true">{t("→")}</i>
                </Link>
                <button type="button" onClick={handleCreate} disabled={creating}>
                  <ProductMark product="editor" />
                  <span><strong>{t(creating ? "Creating your tab…" : "Start a blank tab")}</strong><small>{t("Write, arrange, play, and practice")}</small></span>
                  <i aria-hidden="true">{t("→")}</i>
                </button>
              </div>
              {latestEditor && (
                <Link href={`/gte/${latestEditor.id}`} className="product-studio__continue" onPointerDown={() => void gteApi.prefetchEditor(latestEditor.id).catch(() => {})} onClick={() => trackHomeCta("product_home_continue_editor")}>
                  <span>{t("Continue where you left off")}</span><strong>{(latestEditor.name?.trim() || t("Untitled tab"))}</strong><small>{relativeUpdatedAt(latestEditor.updatedAt, locale)} {t(" · Open →")}</small>
                </Link>
              )}
            </div>
          </section>

          {loadError && recentEditors.length === 0 && <div className="product-home__error" role="alert"><span>{translatedError(loadError, locale)}</span><button type="button" onClick={() => void loadEditors(true)}>{t("Try again")}</button></div>}

          {RETENTION_INTENT_RESEARCH_ENABLED && showIntentPrompt && recentEditors.length === 0 && (
            <aside className="product-studio__intent" aria-labelledby="retention-intent-title">
              {intentAnswered ? (
                <div className="product-studio__intent-thanks" role="status">
                  <strong>{t("Thank you.")}</strong>
                  <span>{t("We’ll use that to make getting started more useful.")}</span>
                </div>
              ) : (
                <>
                  <div className="product-studio__intent-copy">
                    <strong id="retention-intent-title">{t("What brought you to Note2Tabs today?")}</strong>
                    <span>{t("One quick question to help us improve the first visit.")}</span>
                  </div>
                  <div className="product-studio__intent-options" aria-label={t("Choose your main goal")}>
                    {RETENTION_INTENT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleIntentSelected(option.value)}
                      >
                        {t(option.label)}
                      </button>
                    ))}
                  </div>
                  <button className="product-studio__intent-dismiss" type="button" onClick={handleIntentDismissed}>
                    {t("Not now")}</button>
                </>
              )}
            </aside>
          )}

          <section className="product-studio__library" aria-labelledby="recent-heading">
            <header><div><h2 id="recent-heading">{t("Recent tabs")}</h2></div><Link href="/gte" onClick={() => trackHomeCta("product_home_view_all_editors")}>{t("View all tabs →")}</Link></header>
            {loading && !latestEditor ? (
              <div className="product-studio__grid" aria-live="polite" aria-busy="true">{[0, 1, 2].map((item) => <div className="product-hub__skeleton" key={item} aria-hidden="true" />)}<span className="sr-only">{t("Loading your recent tabs")}</span></div>
            ) : recentEditors.length > 0 ? (
              <div className="product-studio__grid">
                {recentEditors.map((editor) => (
                  <Link key={editor.id} href={`/gte/${editor.id}`} className="product-studio__tab" onPointerDown={() => void gteApi.prefetchEditor(editor.id).catch(() => {})} onClick={() => trackHomeCta("product_home_recent_editor")}>
                    <CurrentTabArtwork editor={editor} />
                    <span><strong>{(editor.name?.trim() || t("Untitled tab"))}</strong><small>{t(editorActivity(editor, t))}</small><em>{relativeUpdatedAt(editor.updatedAt, locale)}</em></span>
                  </Link>
                ))}
                <button className="product-studio__new" type="button" onClick={handleCreate} disabled={creating}><i aria-hidden="true">{t("+")}</i><span><strong>{t("New tab")}</strong><small>{t("Start with a clean canvas")}</small></span></button>
              </div>
            ) : (
              <div className="product-home__empty-recents"><span className="product-home__empty-paper" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span><div><h3>{t("Your tabs will live here.")}</h3><p>{t("Anything you transcribe or create is saved to your library.")}</p></div></div>
            )}
          </section>

          {!isPremium && <Link href="/pricing?source=product_home" className="product-studio__premium" onClick={() => trackHomeCta("product_home_premium_footer")}><span><strong>{t("Need more transcription room?")}</strong><small>{t("Premium includes 100 monthly credits, rollover, and full-length uploads.")}</small></span><i>{t("Explore Premium →")}</i></Link>}
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
        role: "USER",
        subscriptionPlan: "FREE",
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
            previewNotes: [
              { startTime: 0, string: 1, fret: 3 },
              { startTime: 80, string: 2, fret: 5 },
              { startTime: 160, string: 1, fret: 7 },
              { startTime: 240, string: 3, fret: 7 },
              { startTime: 320, string: 2, fret: 5 },
              { startTime: 400, string: 0, fret: 3 },
            ],
          },
          {
            id: "local-preview-2",
            name: "New idea",
            updatedAt: new Date(now - 24 * 60 * 60_000).toISOString(),
            noteCount: 28,
            previewNotes: [
              { startTime: 0, string: 5, fret: 0 },
              { startTime: 120, string: 4, fret: 2 },
              { startTime: 240, string: 3, fret: 2 },
              { startTime: 360, string: 2, fret: 1 },
            ],
          },
          {
            id: "local-preview-3",
            name: "Acoustic arrangement",
            updatedAt: new Date(now - 2 * 24 * 60 * 60_000).toISOString(),
            chordCount: 18,
            previewNotes: [],
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

  return {
    props: {
      userId: session.user.id,
      role: session.user.role || "USER",
      subscriptionPlan: session.user.subscriptionPlan || (session.user.role === "PREMIUM" ? "PREMIUM" : "FREE"),
      creditsRemaining: session.user.monthlyCreditsRemaining ?? null,
      creditsLimit: session.user.monthlyCreditsLimit ?? null,
      creditsUnlimited: Boolean(session.user.monthlyCreditsUnlimited),
    },
  };
};
