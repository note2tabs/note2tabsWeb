import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { authOptions } from "./api/auth/[...nextauth]";
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
};

export default function SettingsPage({ user }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentMessage, setConsentMessage] = useState<string | null>(null);
  const [consentState, setConsentState] = useState<"granted" | "denied" | "missing">("missing");
  const verifyHref = `/auth/verify-email?email=${encodeURIComponent(user.email)}`;

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

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.href = "/";
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
    const confirmed = window.confirm(
      "Delete your account permanently? This will remove your saved tabs and cannot be undone."
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data?.error || "Could not delete account.");
      return;
    }
    await handleSignOut();
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

  return (
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Manage security, verification, and account actions.</p>
          </div>
          <Link href="/account" className="button-ghost button-small">
            Back to account
          </Link>
        </div>

        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>
            Profile
          </h2>
          <p className="muted text-small">Email: {user.email}</p>
          <p className="muted text-small">Name: {user.name || "Not set"}</p>
          <p className="muted text-small">Role: {user.role}</p>
          <p className="muted text-small">Created: {new Date(user.createdAt).toLocaleDateString()}</p>
          <p className="muted text-small">Email verified: {user.isEmailVerified ? "Yes" : "No"}</p>
          <div className="button-row">
            <Link href="/account" className="button-secondary button-small">
              Account overview
            </Link>
            <Link href="/tabs" className="button-secondary button-small">
              Saved tabs
            </Link>
          </div>
        </section>

        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>
            Security
          </h2>
          <div className="button-row">
            <Link href="/reset-password" className="button-secondary">
              Change password
            </Link>
            <button type="button" onClick={handleSignOut} className="button-secondary">
              Log out
            </button>
          </div>
        </section>

        {!user.isEmailVerified && (
          <section className="card stack">
            <h2 className="section-title" style={{ margin: 0 }}>
              Email verification
            </h2>
            <p className="muted text-small">
              Verification is required before using the transcriber.
            </p>
            <div className="button-row">
              <button
                type="button"
                onClick={handleResendVerification}
                className="button-secondary"
                disabled={verifyBusy}
              >
                {verifyBusy ? "Sending..." : "Resend verification email"}
              </button>
              <Link href={verifyHref} className="button-link">
                Open verification page
              </Link>
            </div>
            {verifyMessage && <div className="notice">{verifyMessage}</div>}
          </section>
        )}

        <section className="card stack" id="privacy-controls">
          <h2 className="section-title" style={{ margin: 0 }}>
            Privacy controls
          </h2>
          <p className="muted text-small">
            Analytics are enabled by default unless you deny them. Current state:{" "}
            <strong>{consentState === "missing" ? "granted (default)" : consentState}</strong>.
          </p>
          <div className="button-row">
            <button
              type="button"
              onClick={() => void handleConsentUpdate("granted")}
              className="button-secondary"
              disabled={consentBusy}
            >
              {consentBusy && consentState !== "granted" ? "Saving..." : "Enable analytics"}
            </button>
            <button
              type="button"
              onClick={() => void handleConsentUpdate("denied")}
              className="button-secondary"
              disabled={consentBusy}
            >
              {consentBusy && consentState !== "denied" ? "Saving..." : "Deny analytics"}
            </button>
          </div>
          {consentMessage && <div className="notice">{consentMessage}</div>}
        </section>

        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>
            Danger zone
          </h2>
          <p className="muted text-small">
            Delete account permanently (GDPR). This removes tabs, sessions, and account data.
          </p>
          <div className="button-row">
            <button type="button" onClick={handleDelete} className="button-danger" disabled={busy}>
              {busy ? "Deleting..." : "Delete account"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
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

  return {
    props: {
      user: user
        ? {
            ...user,
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
    },
  };
};
