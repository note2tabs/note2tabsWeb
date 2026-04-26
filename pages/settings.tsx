import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { signOut } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { authOptions } from "./api/auth/[...nextauth]";
import { buildCreditsSummary, calculateCreditsUsedFromDurationCounts, getCreditWindow } from "../lib/credits";
import { prisma } from "../lib/prisma";
import { generateFingerprint } from "../lib/fingerprint";

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

const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "account", label: "Account" },
  { id: "plan", label: "Plan and credits" },
  { id: "security", label: "Security" },
  { id: "privacy", label: "Privacy" },
  { id: "danger", label: "Danger zone" },
];

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
  const [selectedSection, setSelectedSection] = useState<SettingsSection>("account");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteFlowOpen, setDeleteFlowOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteOriginReason, setDeleteOriginReason] = useState("");
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentMessage, setConsentMessage] = useState<string | null>(null);
  const [consentState, setConsentState] = useState<"granted" | "denied" | "missing">("missing");
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const verifyHref = `/auth/verify-email?email=${encodeURIComponent(user.email)}`;
  const canContinueDeleteFlow = deleteOriginReason.trim().length >= 8;
  const canFinalizeDelete = deleteConfirmationText.trim().toLowerCase() === "delete";
  const isAdminOrMod = user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
  const isAdmin = user.role === "ADMIN";
  const analyticsHref = isAdmin
    ? "/admin/analytics?view=overview&range=30d"
    : "/admin/analytics?view=moderation&range=30d";
  const isPremium =
    user.role === "PREMIUM" || user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
  const resetLabel = new Date(credits.resetAt).toLocaleDateString();
  const creditsUsedLabel = `${credits.used} / ${credits.limit}`;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const match = document.cookie.match(/(?:^|; )analytics_consent=([^;]*)/);
    if (!match?.[1]) {
      setConsentState("missing");
      return;
    }
    const value = decodeURIComponent(match[1]);
    if (value === "denied") {
      setConsentState("denied");
      return;
    }
    setConsentState("granted");
  }, []);

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

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  const handleUpgrade = async () => {
    if (!stripeReady) {
      setError("Stripe not configured yet. Coming soon.");
      return;
    }
    setUpgradeBusy(true);
    setError(null);
    const res = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setUpgradeBusy(false);
    if (!res.ok || !data?.url) {
      setError(data?.error || "Could not start checkout.");
      return;
    }
    window.location.href = data.url;
  };

  const handleManageSubscription = async () => {
    if (!stripeReady) {
      setError("Stripe not configured yet. Subscription management is unavailable.");
      return;
    }
    setPortalBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        setError(data?.error || "Could not open subscription management.");
        return;
      }
      window.location.href = data.url;
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
        throw new Error(data?.error || "Could not resend verification email.");
      }
      setVerifyMessage(data?.alreadyVerified ? "Your email is already verified." : "Verification email sent.");
    } catch (err: any) {
      setError(err?.message || "Could not resend verification email.");
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
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not delete account.");
        return;
      }
      await handleSignOut();
    } finally {
      setBusy(false);
    }
  };

  const handleConsentUpdate = async (state: "granted" | "denied") => {
    setConsentBusy(true);
    setConsentMessage(null);
    setError(null);
    try {
      let fingerprintId: string | undefined;
      if (state === "granted") {
        try {
          const fingerprint = await generateFingerprint();
          fingerprintId = fingerprint.fingerprintId;
        } catch {
          // best effort
        }
      }
      const endpoint = state === "denied" ? "/api/consent/deny" : "/api/consent/update";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: state === "granted" ? JSON.stringify({ state: "granted", fingerprintId }) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Could not update analytics consent.");
      }
      setConsentState(state);
      setConsentMessage(
        state === "granted"
          ? "Analytics tracking is enabled. You can deny it again at any time."
          : "Analytics tracking is denied and analytics identifiers were cleared."
      );
    } catch (err: any) {
      setError(err?.message || "Could not update analytics consent.");
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
        <SettingRow label="Role" value={user.role} />
        <SettingRow label="Created" value={new Date(user.createdAt).toLocaleDateString()} />
        <SettingRow label="Email verified" value={user.isEmailVerified ? "Yes" : "No"} />
        <SettingRow label="Actions">
          <div className="settingsActions">
            <Link href="/tabs" className="settingsButton settingsButtonSecondary">
              Transcriptions
            </Link>
            <Link href="/editor" className="settingsButton settingsButtonSecondary">
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
          value={isPremium ? `${user.role} - 50 credits/month (roll over)` : "Free - 10 credits/month"}
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
                {stripeReady ? "Upgrade to Premium" : "Premium (coming soon)"}
              </button>
            )}
            {isPremium && (
              <button
                type="button"
                onClick={handleManageSubscription}
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
        <div className="notice">
          {isPremium
            ? `Credits used. More credits arrive on ${resetLabel}.`
            : `Monthly credits used. Upgrade to Premium or wait until ${resetLabel}.`}
        </div>
      )}
      {isPremium && (
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
            <button type="button" onClick={handleSignOut} className="settingsButton settingsButtonSecondary">
              Log out
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
          description="Analytics help improve Note2Tabs. You can turn them off anytime."
          value={consentState === "missing" ? "granted (default)" : consentState}
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
              setDeleteStep(1);
              setDeleteConfirmationText("");
              setError(null);
            }}
          >
            Delete account
          </button>
        </div>
      )}
      {deleteFlowOpen && (
        <div className="card-outline stack delete-flow">
          {deleteStep === 1 && (
            <>
              <p className="muted text-small">
                Before removing your account, what made you sign up in the first place?
              </p>
              <label className="form-group">
                <span className="label">Why did you create your Note2Tabs account?</span>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={deleteOriginReason}
                  onChange={(event) => setDeleteOriginReason(event.target.value)}
                  placeholder="Example: I wanted faster tab writing and to keep my song edits in one place."
                />
              </label>
              <div className="delete-alternatives">
                <p className="muted text-small">
                  You started this account to save progress and keep your workflow in one place. Before deleting, you
                  can also:
                </p>
                <div className="button-row">
                  <Link href="/tabs" className="button-secondary button-small">
                    Review transcriptions
                  </Link>
                  <Link href="/reset-password" className="button-secondary button-small">
                    Reset password
                  </Link>
                  <button type="button" onClick={handleSignOut} className="button-secondary button-small">
                    Log out instead
                  </button>
                </div>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() => {
                    setDeleteFlowOpen(false);
                    setDeleteStep(1);
                    setDeleteOriginReason("");
                    setDeleteConfirmationText("");
                    setError(null);
                  }}
                >
                  Keep my account
                </button>
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() => {
                    setDeleteStep(2);
                    setError(null);
                  }}
                  disabled={!canContinueDeleteFlow}
                >
                  Continue to final step
                </button>
              </div>
            </>
          )}
          {deleteStep === 2 && (
            <>
              <p className="muted text-small">
                Final confirmation: type <strong>delete</strong> to permanently remove your account and data.
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
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() => {
                    setDeleteStep(1);
                    setDeleteConfirmationText("");
                    setError(null);
                  }}
                >
                  Back
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
    <main className="page settingsPage">
      <div className="container settingsShell">
        <header className="settingsHeader">
          <div>
            <h1 className="settingsTitle">Settings</h1>
            <p className="settingsSubtitle">Manage your account, credits, privacy, and saved work.</p>
          </div>
          <Link href="/" className="button-ghost button-small">
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
            {selectedSection === "account" && renderAccountSection()}
            {selectedSection === "plan" && renderPlanSection()}
            {selectedSection === "security" && renderSecuritySection()}
            {selectedSection === "privacy" && renderPrivacySection()}
            {selectedSection === "danger" && renderDangerSection()}
            {error && <div className="error">{error}</div>}
          </div>
        </section>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.email || !session.user.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      role: true,
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
  const credits = buildCreditsSummary({
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
