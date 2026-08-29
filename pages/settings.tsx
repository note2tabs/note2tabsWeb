import { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { getServerSession } from "next-auth/next";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { authOptions } from "./api/auth/[...nextauth]";
import {
  buildCreditsSummary,
  calculateCreditsUsedFromDurationCounts,
  getCreditWindow,
  reconcileCreditsWithStoredBalance,
} from "../lib/credits";
import {
  buildBackendCreditHeaders,
  raiseBackendCreditsToFloor,
  withBackendRemainingCredits,
} from "../lib/backendCredits";
import { prisma } from "../lib/prisma";
import { resetPostHogIdentity, setPostHogConsent } from "../lib/posthogClient";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";
import { clearPendingTranscription } from "../lib/pendingTranscription";
import { ANALYTICS_ATTRIBUTION_COOKIE } from "../lib/acquisitionAttribution";
import {
  clearRecoverableCheckoutSessionId,
  confirmPremiumCheckout,
  getRecoverableCheckoutSessionId,
  hideCheckoutSessionIdFromAddressBar,
  waitForPremiumEntitlement,
} from "../lib/premiumEntitlement";
import NoIndexHead from "../components/NoIndexHead";
import PremiumConversionCard from "../components/PremiumConversionCard";
import SubscriptionRetentionDialog from "../components/SubscriptionRetentionDialog";
import type { SubscriptionRetentionGoal } from "../lib/subscriptionCancellationRetention";
import {
  getOrCreatePremiumFunnelContext,
  premiumFunnelProperties,
} from "../lib/premiumFunnel";

type Props = {
  user: {
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
    isEmailVerified: boolean;
  };
  stripeReady: boolean;
  credits: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
    unlimited: boolean;
  };
};

type SettingsSection = "account" | "plan" | "security" | "privacy" | "danger";
type DeleteGoal = "transcribe_songs" | "edit_tabs" | "practice" | "save_export" | "explore" | "skip";
type DeleteAlternative = { href: string; label: string; detail: string; section?: SettingsSection };

const deleteGoals: Array<{ value: DeleteGoal; label: string }> = [
  { value: "transcribe_songs", label: "Turn songs into editable tabs" },
  { value: "edit_tabs", label: "Create and arrange tabs in the editor" },
  { value: "practice", label: "Practice songs and improve my playing" },
  { value: "save_export", label: "Save, refine, and export my music" },
  { value: "explore", label: "Explore what Note2Tabs can do" },
  { value: "skip", label: "Prefer not to say" },
];

const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "account", label: "Account" },
  { id: "plan", label: "Plan and credits" },
  { id: "security", label: "Security" },
  { id: "privacy", label: "Privacy" },
  { id: "danger", label: "Danger zone" },
];

const accountRoleLabel = (role: string) => {
  if (role === "PREMIUM") return "Premium";
  if (role === "ADMIN") return "Administrator";
  if (role === "MODERATOR" || role === "MOD") return "Moderator";
  return "Free";
};

type SettingRowProps = {
  label: string;
  description?: string;
  value?: ReactNode;
  children?: ReactNode;
};

function SettingRow({ label, description, value, children }: SettingRowProps) {
  return (
    <div className="settingsRow">
      <div className="settingsRowMain">
        <p className="settingsRowLabel">{label}</p>
        {description && <p className="settingsRowDescription">{description}</p>}
      </div>
      {(value || children) && (
        <div className="settingsRowValue">
          {value}
          {children}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage({ user, stripeReady, credits }: Props) {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [selectedSection, setSelectedSection] = useState<SettingsSection>("account");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteFlowOpen, setDeleteFlowOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"retention" | "confirm">("retention");
  const [deleteGoal, setDeleteGoal] = useState<DeleteGoal | "">("");
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentMessage, setConsentMessage] = useState<string | null>(null);
  const [consentState, setConsentState] = useState<"granted" | "denied">("granted");
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);
  const checkoutReturnHandledRef = useRef(false);
  const verifyHref = `/auth/verify-email?email=${encodeURIComponent(user.email)}`;
  const canFinalizeDelete = deleteConfirmationText.trim().toLowerCase() === "delete";
  const isAdminOrMod = user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
  const isAdmin = user.role === "ADMIN";
  const isPremium =
    user.role === "PREMIUM" || user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
  const isPaidPremium = user.role === "PREMIUM";

  const resetDeleteFlow = () => {
    setDeleteFlowOpen(false);
    setDeleteStep("retention");
    setDeleteGoal("");
    setDeleteConfirmationText("");
    setError(null);
  };

  const deletionAlternative: DeleteAlternative | null = (() => {
    if (deleteGoal === "transcribe_songs")
      return { href: "/transcribe", label: "Transcribe another song", detail: "Your transcriber is ready to turn another recording into an editable tab." };
    if (deleteGoal === "edit_tabs")
      return { href: "/gte", label: "Open my editor", detail: "Continue arranging notes, chords, drums, timing, and playback without starting over." };
    if (deleteGoal === "practice")
      return { href: "/home", label: "Continue practicing", detail: "Return to your workspace and continue with playback, looping, speed training, and Practice mode." };
    if (deleteGoal === "save_export")
      return { href: "/tabs", label: "View my saved tabs", detail: "Your saved work is still available to refine, play back, or export whenever you return." };
    if (deleteGoal === "explore")
      return { href: "/home", label: "Return to my workspace", detail: "Transcription, editing, playback, and practice are all waiting in your workspace." };
    return null;
  })();
  const analyticsHref = isAdmin
    ? "/admin/analytics?view=overview&range=30d"
    : "/admin/analytics?view=moderation&range=30d";
  const resetLabel = new Date(credits.resetAt).toLocaleDateString();
  const creditsUsedLabel = `${credits.used} / ${credits.limit}`;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const match = document.cookie.match(/(?:^|; )analytics_consent=([^;]*)/);
    const value = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    setConsentState(value === "denied" ? "denied" : "granted");
  }, []);

  useEffect(() => {
    if (!router.isReady || checkoutReturnHandledRef.current) return;
    const outcome = Array.isArray(router.query.upgrade)
      ? router.query.upgrade[0]
      : router.query.upgrade;
    if (outcome === "confirmed") {
      checkoutReturnHandledRef.current = true;
      setSelectedSection("plan");
      setCheckoutStatus("Premium is active. Your upgraded limits are ready to use.");
      return;
    }
    if (outcome !== "success" && outcome !== "manage") return;

    checkoutReturnHandledRef.current = true;
    setSelectedSection("plan");
    setUpgradeBusy(true);
    setError(null);
    setCheckoutStatus("Checking your Premium access…");

    const sessionIdValue = router.query.session_id;
    const sessionIdFromQuery = Array.isArray(sessionIdValue)
      ? sessionIdValue[0]
      : sessionIdValue;
    hideCheckoutSessionIdFromAddressBar();
    if (outcome === "manage") clearRecoverableCheckoutSessionId();
    const checkoutSessionId =
      outcome === "success"
        ? typeof sessionIdFromQuery === "string"
          ? sessionIdFromQuery
          : getRecoverableCheckoutSessionId()
        : null;
    let cancelled = false;

    const reconcileCheckout = async () => {
      if (isPremium) {
        clearRecoverableCheckoutSessionId();
        if (outcome === "success") {
          window.location.replace("/home?upgrade=confirmed");
        } else {
          setCheckoutStatus("Premium is active. Your upgraded limits are ready to use.");
          setUpgradeBusy(false);
        }
        return;
      }

      if (checkoutSessionId) await confirmPremiumCheckout(checkoutSessionId);
      const entitlementReady = await waitForPremiumEntitlement(
        () => updateSession(),
        { shouldStop: () => cancelled }
      );
      if (cancelled) return;
      if (!entitlementReady) {
        setCheckoutStatus(null);
        setError(
          outcome === "manage"
            ? "Your subscription is not active yet. Finish the update in billing, then reload this page."
            : "Premium is still activating. Reload this page to retry."
        );
        setUpgradeBusy(false);
        return;
      }

      clearRecoverableCheckoutSessionId();
      window.location.replace(
        outcome === "success" ? "/home?upgrade=confirmed" : "/settings?upgrade=confirmed"
      );
    };

    void reconcileCheckout();
    return () => {
      cancelled = true;
    };
  }, [isPremium, router.isReady, router.query.session_id, router.query.upgrade, updateSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyHashSection = () => {
      if (window.location.hash === "#privacy-controls") {
        setSelectedSection("privacy");
      }
    };

    applyHashSection();
    window.addEventListener("hashchange", applyHashSection);
    return () => window.removeEventListener("hashchange", applyHashSection);
  }, []);

  const handleSelectSection = (section: SettingsSection) => {
    setSelectedSection(section);
    if (typeof window === "undefined") return;
    if (section === "privacy") {
      history.replaceState(null, "", `${window.location.pathname}#privacy-controls`);
      return;
    }
    if (window.location.hash === "#privacy-controls") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  const handleSignOut = async (pendingTranscriptionAlreadyCleared = false) => {
    if (signOutBusy) return;
    setSignOutBusy(true);
    setError(null);
    if (!pendingTranscriptionAlreadyCleared) {
      try {
        await clearPendingTranscription();
      } catch {
        setError("Could not securely clear your saved upload. Please try signing out again.");
        setSignOutBusy(false);
        return;
      }
    }
    try {
      await resetPostHogIdentity();
      await signOut({ redirect: false });
      window.location.href = "/";
    } catch {
      setError("Could not sign out. Check your connection and try again.");
      setSignOutBusy(false);
    }
  };

  const handleUpgrade = async () => {
    if (!stripeReady) {
      setError("Premium upgrades are temporarily unavailable. Please try again later.");
      return;
    }
    setUpgradeBusy(true);
    setError(null);
    const funnel = getOrCreatePremiumFunnelContext({
      source: "settings",
      reason: "account_plan",
    });
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: funnel.source,
          reason: funnel.reason,
          funnelId: funnel.funnelId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        sendEvent(ANALYTICS_EVENTS.checkoutClientFailed, {
          plan: "premium_monthly",
          ...premiumFunnelProperties(funnel),
        });
        setError(data?.error || "Checkout is temporarily unavailable. Please try again in a moment.");
        return;
      }
      sendEvent(ANALYTICS_EVENTS.checkoutRedirected, {
        plan: "premium_monthly",
        checkout_attempt_id: data.checkoutAttemptId,
        ...premiumFunnelProperties(funnel),
      });
      window.location.href = data.url;
    } catch {
      sendEvent(ANALYTICS_EVENTS.checkoutClientFailed, {
        plan: "premium_monthly",
        ...premiumFunnelProperties(funnel),
      });
      setError("Could not reach checkout. Check your connection and try again.");
    } finally {
      setUpgradeBusy(false);
    }
  };

  const handleManageSubscription = async (
    intent: "billing" | "cancellation",
    goal?: SubscriptionRetentionGoal
  ) => {
    if (!stripeReady) {
      setError("Subscription management is temporarily unavailable. Please try again later.");
      return;
    }
    setPortalBusy(true);
    setError(null);
    sendEvent(
      intent === "cancellation"
        ? ANALYTICS_EVENTS.subscriptionCancellationContinued
        : ANALYTICS_EVENTS.subscriptionManagementOpened,
      goal ? { goal } : undefined
    );
    try {
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        setError(data?.error || "Could not open subscription management.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not reach subscription management. Check your connection and try again.");
    } finally {
      setPortalBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setVerifyBusy(true);
    setVerifyMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "We could not send another verification email. Please try again shortly.");
      }
      setVerifyMessage(data?.alreadyVerified ? "Your email is already verified." : "Verification email sent.");
    } catch (err: any) {
      setError(err?.message || "We could not send another verification email. Check your connection and try again.");
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!canFinalizeDelete) {
      setError('Type "delete" to confirm permanent account deletion.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      try {
        await clearPendingTranscription();
      } catch {
        setError("Could not securely clear your saved upload, so your account was not deleted. Please try again.");
        return;
      }
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not delete account.");
        return;
      }
      sendEvent(ANALYTICS_EVENTS.accountDeletionConfirmed, {
        goal: deleteGoal || "unknown",
        plan: isPaidPremium ? "premium" : "free",
      });
      await handleSignOut(true);
    } catch {
      setError("Could not delete account. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleConsentUpdate = async (state: "granted" | "denied") => {
    setConsentBusy(true);
    setConsentMessage(null);
    setError(null);
    try {
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      if (state === "denied") {
        document.cookie = `analytics_consent=denied; expires=${expires}; Max-Age=${
          365 * 24 * 60 * 60
        }; path=/; SameSite=Lax${secure}`;
        for (const cookieName of [
          "analytics_session",
          "analytics_anon",
          ANALYTICS_ATTRIBUTION_COOKIE,
        ]) {
          document.cookie = `${cookieName}=; Max-Age=0; expires=${new Date(
            0
          ).toUTCString()}; path=/; SameSite=Lax${secure}`;
        }
      } else {
        document.cookie = `analytics_consent=; Max-Age=0; expires=${new Date(
          0
        ).toUTCString()}; path=/; SameSite=Lax${secure}`;
      }
      await setPostHogConsent(state);
      setConsentState(state);
      setConsentMessage(
        state === "granted"
          ? "Analytics tracking is enabled. You can deny it again at any time."
          : "Analytics tracking is denied and analytics identifiers were cleared."
      );
    } catch (err: any) {
      setError(err?.message || "We could not save your analytics preference. Please try again.");
    } finally {
      setConsentBusy(false);
    }
  };

  const renderAccountSection = () => (
    <section className="settingsSection" aria-labelledby="settings-account-title">
      <h2 id="settings-account-title" className="settingsSectionTitle">
        Account
      </h2>
      <div className="settingsRows">
        <SettingRow label="Email" value={user.email} />
        <SettingRow label="Name" value={user.name || "Not set"} />
        <SettingRow label="Role" value={accountRoleLabel(user.role)} />
        <SettingRow label="Created" value={<time dateTime={user.createdAt}>{new Date(user.createdAt).toLocaleDateString()}</time>} />
        <SettingRow label="Email verified" value={user.isEmailVerified ? "Yes" : "No"} />
        <SettingRow label="Actions">
          <div className="settingsActions">
            <Link href="/tabs" className="settingsButton settingsButtonSecondary">
              Transcription history
            </Link>
            <Link href="/gte" className="settingsButton settingsButtonSecondary">
              Open editor
            </Link>
          </div>
        </SettingRow>
        {!user.isEmailVerified && (
          <SettingRow
            label="Email verification"
            description="Verification is required before using the transcriber."
          >
            <div className="settingsActions">
              <button
                type="button"
                onClick={handleResendVerification}
                className="settingsButton settingsButtonSecondary"
                disabled={verifyBusy}
              >
                {verifyBusy ? "Sending..." : "Resend verification email"}
              </button>
              <Link href={verifyHref} className="settingsButton settingsButtonSecondary">
                Open verification page
              </Link>
            </div>
          </SettingRow>
        )}
      </div>
      {verifyMessage && <div className="notice">{verifyMessage}</div>}
    </section>
  );

  const renderPlanSection = () => (
    <section className="settingsSection" aria-labelledby="settings-plan-title">
      <h2 id="settings-plan-title" className="settingsSectionTitle">
        Plan and credits
      </h2>
      <div className="settingsRows">
        <SettingRow
          label="Plan"
          value={isPremium ? `${accountRoleLabel(user.role)} · 100 credits/month (rollover up to 200)` : "Free · 10 credits/month"}
        />
        <SettingRow label="Credits used" value={creditsUsedLabel} />
        <SettingRow label="Remaining" value={credits.remaining} />
        <SettingRow label="Next credits" value={resetLabel} />
        <SettingRow label="Actions">
          <div className="settingsActions">
            {!isPremium && (
              <button
                type="button"
                onClick={handleUpgrade}
                className="settingsButton settingsButtonPrimary"
                disabled={upgradeBusy}
              >
                {stripeReady ? "Upgrade to Premium" : "Premium temporarily unavailable"}
              </button>
            )}
            {isPaidPremium && (
              <button
                type="button"
                onClick={() => {
                  setSubscriptionDialogOpen(true);
                }}
                className="settingsButton settingsButtonSecondary"
                disabled={portalBusy}
              >
                {portalBusy ? "Opening..." : "Manage subscription"}
              </button>
            )}
            {isAdminOrMod && (
              <Link href={analyticsHref} className="settingsButton settingsButtonSecondary">
                Open analytics hub
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/blog" className="settingsButton settingsButtonSecondary">
                Open blog CMS
              </Link>
            )}
          </div>
        </SettingRow>
      </div>
      {credits.remaining === 0 && (
        isPremium ? (
          <div className="notice">Your credits will be refreshed on {resetLabel}.</div>
        ) : (
          <PremiumConversionCard
            title="Keep transcribing today"
            description="Premium includes 100 monthly credits, rollover, and full-song audio uploads."
            actionLabel="Get Premium"
            onAction={() => void handleUpgrade()}
            busy={upgradeBusy}
            resetMessage={`Free credits reset ${resetLabel}`}
          />
        )
      )}
      {isPaidPremium && (
        <p className="footnote">You can cancel your Premium subscription anytime from Manage subscription.</p>
      )}
    </section>
  );

  const renderSecuritySection = () => (
    <section className="settingsSection" aria-labelledby="settings-security-title">
      <h2 id="settings-security-title" className="settingsSectionTitle">
        Security
      </h2>
      <div className="settingsRows">
        <SettingRow label="Change password" value="Update your login password.">
          <div className="settingsActions">
            <Link href="/reset-password" className="settingsButton settingsButtonSecondary">
              Change password
            </Link>
          </div>
        </SettingRow>
        <SettingRow label="Log out" value="Sign out of your current session.">
          <div className="settingsActions">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="settingsButton settingsButtonSecondary"
              disabled={signOutBusy}
            >
              {signOutBusy ? "Signing out…" : "Log out"}
            </button>
          </div>
        </SettingRow>
      </div>
    </section>
  );

  const renderPrivacySection = () => (
    <section className="settingsSection" id="privacy-controls" aria-labelledby="settings-privacy-title">
      <h2 id="settings-privacy-title" className="settingsSectionTitle">
        Privacy
      </h2>
      <div className="settingsRows">
        <SettingRow
          label="Analytics"
          description="Cookieless product analytics are enabled by default. You can turn them off anytime."
          value={consentState === "granted" ? "Enabled" : "Disabled"}
        >
          <div className="settingsActions">
            <button
              type="button"
              onClick={() => void handleConsentUpdate("granted")}
              className="settingsButton settingsButtonSecondary"
              disabled={consentBusy}
            >
              {consentBusy && consentState !== "granted" ? "Saving..." : "Enable analytics"}
            </button>
            <button
              type="button"
              onClick={() => void handleConsentUpdate("denied")}
              className="settingsButton settingsButtonSecondary"
              disabled={consentBusy}
            >
              {consentBusy && consentState !== "denied" ? "Saving..." : "Deny analytics"}
            </button>
          </div>
        </SettingRow>
      </div>
      {consentMessage && <div className="notice">{consentMessage}</div>}
    </section>
  );

  const renderDangerSection = () => (
    <section className="settingsSection settingsSectionDanger" aria-labelledby="settings-danger-title">
      <h2 id="settings-danger-title" className="settingsSectionTitle">
        Danger zone
      </h2>
      <p className="settingsSectionIntro">
        Delete your account permanently. This removes tabs, sessions, and account data.
      </p>
      {!deleteFlowOpen && (
        <div className="settingsActions">
          <button
            type="button"
            className="settingsButton settingsButtonDanger"
            onClick={() => {
              setDeleteFlowOpen(true);
              setDeleteStep("retention");
              setDeleteGoal("");
              setDeleteConfirmationText("");
              setError(null);
              sendEvent(ANALYTICS_EVENTS.accountDeletionStarted, {
                plan: isPaidPremium ? "premium" : "free",
              });
            }}
          >
            Delete account
          </button>
        </div>
      )}
      {deleteFlowOpen && (
        <div className="card-outline stack delete-flow">
          {deleteStep === "retention" ? (
            <>
              <div>
                <h3 className="delete-flow-title">Before you go</h3>
                <p className="muted text-small">
                  What did you originally want Note2Tabs to help you do? Let’s make sure there is nothing valuable left unfinished.
                </p>
              </div>
              <label className="form-group">
                <span className="label">I signed up to…</span>
                <select
                  className="form-input"
                  value={deleteGoal}
                  onChange={(event) => setDeleteGoal(event.target.value as DeleteGoal)}
                >
                  <option value="">Choose what brought you here</option>
                  {deleteGoals.map((goal) => (
                    <option key={goal.value} value={goal.value}>{goal.label}</option>
                  ))}
                </select>
              </label>
              {deletionAlternative && (
                <div className="delete-alternatives">
                  <p className="text-small">{deletionAlternative.detail}</p>
                  <Link
                    href={deletionAlternative.href}
                    className="settingsButton settingsButtonSecondary"
                    onClick={(event) => {
                      sendEvent(ANALYTICS_EVENTS.accountDeletionAlternativeClicked, {
                        goal: deleteGoal,
                        destination: deletionAlternative.section || deletionAlternative.href,
                      });
                      if (deletionAlternative.section) {
                        event.preventDefault();
                        resetDeleteFlow();
                        handleSelectSection(deletionAlternative.section);
                      }
                    }}
                  >
                    {deletionAlternative.label}
                  </Link>
                </div>
              )}
              <div className="button-row">
                <button type="button" className="button-secondary button-small" onClick={resetDeleteFlow}>
                  Keep my account
                </button>
                <button
                  type="button"
                  className="button-ghost button-small"
                  disabled={!deleteGoal}
                  onClick={() => {
                    if (!deleteGoal) return;
                    sendEvent(ANALYTICS_EVENTS.accountDeletionGoalSelected, {
                      goal: deleteGoal,
                      plan: isPaidPremium ? "premium" : "free",
                    });
                    setDeleteStep("confirm");
                  }}
                >
                  Continue to deletion
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted text-small">
                This permanently removes your account, saved tabs, transcription history, and active subscription. Type <strong>delete</strong> to confirm.
              </p>
              <label className="form-group">
                <span className="label">Type delete to confirm</span>
                <input
                  type="text"
                  className="form-input"
                  value={deleteConfirmationText}
                  onChange={(event) => setDeleteConfirmationText(event.target.value)}
                  placeholder="delete"
                  autoComplete="off"
                />
              </label>
              <div className="button-row">
                <button type="button" className="button-secondary button-small" onClick={() => setDeleteStep("retention")}>
                  Go back
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className="button-secondary button-small button-delete-final"
                  disabled={busy || !canFinalizeDelete}
                >
                  {busy ? "Deleting..." : "Delete account permanently"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );

  return (
    <>
      <NoIndexHead title="Settings | Note2Tabs" canonicalPath="/settings" />
      <SubscriptionRetentionDialog
        open={subscriptionDialogOpen}
        busy={portalBusy}
        onClose={() => setSubscriptionDialogOpen(false)}
        onCancellationIntent={() => {
          sendEvent(ANALYTICS_EVENTS.subscriptionCancellationIntentStarted, {
            entry: "settings",
          });
        }}
        onOpenPortal={(intent, goal) => {
          if (intent === "cancellation") {
            sendEvent(ANALYTICS_EVENTS.subscriptionCancellationGoalSelected, { goal });
          }
          void handleManageSubscription(intent, goal);
        }}
        onAlternative={(goal, destination) => {
          sendEvent(ANALYTICS_EVENTS.subscriptionCancellationAlternativeClicked, {
            goal,
            destination,
          });
          setSubscriptionDialogOpen(false);
        }}
      />
    <main className="page settingsPage">
      <div className="container settingsShell">
        <header className="settingsHeader">
          <div>
            <h1 className="settingsTitle">Settings</h1>
            <p className="settingsSubtitle">Manage your account, credits, privacy, and saved work.</p>
          </div>
          <Link href="/home" className="button-ghost button-small">
            Back to app
          </Link>
        </header>

        <section className="settingsPanel" aria-label="Settings panel">
          <aside className="settingsSidebar" aria-label="Settings sections">
            <p className="settingsSidebarLabel">Settings</p>
            <nav className="settingsNav" role="tablist" aria-label="Settings tabs">
              {settingsSections.map((section) => {
                const isActive = selectedSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`settings-panel-${section.id}`}
                    className={`settingsNavItem${isActive ? " settingsNavItemActive" : ""}`}
                    onClick={() => handleSelectSection(section.id)}
                  >
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="settingsContent" role="tabpanel" id={`settings-panel-${selectedSection}`}>
            {checkoutStatus && <div className="status" role="status">{checkoutStatus}</div>}
            {selectedSection === "account" && renderAccountSection()}
            {selectedSection === "plan" && renderPlanSection()}
            {selectedSection === "security" && renderSecuritySection()}
            {selectedSection === "privacy" && renderPrivacySection()}
            {selectedSection === "danger" && renderDangerSection()}
            {error && <div className="error" role="alert">{error}</div>}
          </div>
        </section>
      </div>
    </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.email || !session.user.id) {
    return {
      redirect: {
        destination: `/auth/login?next=${encodeURIComponent(ctx.resolvedUrl || "/settings")}`,
        permanent: false,
      },
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tokensRemaining: true,
      createdAt: true,
      emailVerified: true,
      emailVerifiedBool: true,
    },
  });

  const stripeReady = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PREMIUM_MONTHLY
  );
  const role = user?.role || "FREE";
  const isPremium = role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";
  const creditWindow = isPremium
    ? getCreditWindow({ userCreatedAt: user?.createdAt })
    : getCreditWindow();
  const creditDurationCounts = await prisma.tabJob.groupBy({
    by: ["durationSec"],
    where: isPremium
      ? { userId: session.user.id }
      : {
          userId: session.user.id,
          createdAt: {
            gte: creditWindow.start,
            lt: creditWindow.resetAt,
          },
        },
    _count: { _all: true },
  });
  const computedCredits = buildCreditsSummary({
    usedCredits: calculateCreditsUsedFromDurationCounts(
      creditDurationCounts.map((item) => ({
        durationSec: item.durationSec,
        count: item._count._all,
      }))
    ),
    resetAt: creditWindow.resetAt,
    isPremium,
    userCreatedAt: user?.createdAt,
  });
  let credits = isPremium
    ? reconcileCreditsWithStoredBalance(computedCredits, user?.tokensRemaining)
    : computedCredits;
  if (isPremium && user?.id) {
    try {
      const backendRemaining = await raiseBackendCreditsToFloor(
        user.id,
        credits.remaining,
        buildBackendCreditHeaders(user.id)
      );
      if (typeof backendRemaining === "number") {
        credits = withBackendRemainingCredits(credits, backendRemaining);
      }
    } catch (error) {
      console.warn("settings backend credits read failed", error);
    }
  }

  return {
    props: {
      user: user
        ? {
            email: user.email,
            name: user.name,
            role: user.role,
            createdAt: user.createdAt.toISOString(),
            isEmailVerified: Boolean(user.emailVerifiedBool || user.emailVerified),
          }
        : {
            email: session.user.email,
            name: session.user.name || null,
            role: "FREE",
            createdAt: new Date().toISOString(),
            isEmailVerified: Boolean(session.user.isEmailVerified),
          },
      stripeReady,
      credits,
    },
  };
};
