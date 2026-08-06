import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";
import { generateFingerprint } from "../../lib/fingerprint";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../../lib/analytics";
import NoIndexHead from "../../components/NoIndexHead";
import { clearOAuthIntent, saveOAuthIntent } from "../../lib/oauthAnalytics";
import { categorizeAnalyticsDestination } from "../../lib/analyticsPrivacy";
import { categorizeAnalyticsError } from "../../lib/analyticsErrors";

const authErrorMessage = (error?: string | string[]) => {
  const value = Array.isArray(error) ? error[0] : error;
  if (!value) return null;
  if (value === "OAuthAccountNotLinked") {
    return "This email already has an account. Continue with Google again or log in instead.";
  }
  if (value === "OAuthCallback" || value === "OAuthSignin") {
    return "Google sign up could not finish. Please try again.";
  }
  return "Google sign up failed. Please try again.";
};

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nextHref = useMemo(() => {
    const raw = router.query.next;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") return "/";
    const trimmed = value.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
    return trimmed;
  }, [router.query.next]);
  const loginHref =
    nextHref === "/" ? "/auth/login" : `/auth/login?next=${encodeURIComponent(nextHref)}`;
  const routeError = useMemo(() => authErrorMessage(router.query.error), [router.query.error]);

  useEffect(() => {
    if (router.query.error) clearOAuthIntent();
  }, [router.query.error]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearOAuthIntent();
    setError(null);
    setLoading(true);
    const destination = categorizeAnalyticsDestination(nextHref);
    sendEvent(ANALYTICS_EVENTS.signupStarted, { method: "email", destination });
    let fingerprintId: string | undefined;
    try {
      const fingerprint = await generateFingerprint();
      fingerprintId = fingerprint.fingerprintId;
    } catch {
      // best effort only
    }
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, fingerprintId }),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Could not sign up.");
      sendEvent(ANALYTICS_EVENTS.signupFailed, {
        method: "email",
        error_code: categorizeAnalyticsError(data?.error, "signup_failed"),
      });
      return;
    }
    sendEvent(ANALYTICS_EVENTS.signupCompleted, { method: "email", destination });
    const nextEmail = encodeURIComponent((data?.email as string) || email);
    const sentParam = data?.emailSent === false ? "&sent=0" : "";
    const nextParam = nextHref === "/" ? "" : `&next=${encodeURIComponent(nextHref)}`;
    router.push(`/auth/verify-email?email=${nextEmail}${sentParam}${nextParam}`);
  };

  return (
    <>
      <NoIndexHead title="Create your account | Note2Tabs" canonicalPath="/auth/signup" />
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card auth-card--expanded stack">
          <div className="auth-card-header">
            <h1 className="page-title">Create your account</h1>
            <p className="page-subtitle">Get started with Note2Tabs.</p>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label" htmlFor="signup-name">Name (optional)</label>
              <input
                id="signup-name"
                type="text"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                className="form-input"
              />
            </div>
            {(error || routeError) && <div className="error" role="alert">{error || routeError}</div>}
            <button type="submit" disabled={loading} className="button-primary">
              {loading ? "Creating account..." : "Sign up"}
            </button>
          </form>
          <div className="auth-card-divider" aria-hidden="true">
            <span>or</span>
          </div>
          <button
            type="button"
            onClick={() => {
              sendEvent(ANALYTICS_EVENTS.signupStarted, {
                method: "google",
                destination: categorizeAnalyticsDestination(nextHref),
              });
              trackCtaClick("signup_google", { surface: "signup_page" });
              saveOAuthIntent("signup", nextHref);
              signIn("google", { callbackUrl: nextHref });
            }}
            className="button-secondary"
          >
            <img src="/icons/google.svg" alt="" width={17} height={16} aria-hidden="true" />
            Continue with Google
          </button>
          <div className="auth-links-row auth-links-row--center">
            <Link href={loginHref} className="button-link">
              Already have an account? Log in
            </Link>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
