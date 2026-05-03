import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";
import { generateFingerprint } from "../../lib/fingerprint";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../../lib/analytics";
import NoIndexHead from "../../components/NoIndexHead";

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    sendEvent(ANALYTICS_EVENTS.signupStarted, { method: "email", next: nextHref });
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
      sendEvent(ANALYTICS_EVENTS.signupFailed, { method: "email", error: data?.error || "unknown" });
      return;
    }
    sendEvent(ANALYTICS_EVENTS.signupCompleted, { method: "email", next: nextHref });
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
              <label className="label">Name (optional)</label>
              <input
                type="text"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="label">Email</label>
              <input
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
              <label className="label">Password</label>
              <input
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
            {(error || routeError) && <div className="error">{error || routeError}</div>}
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
              sendEvent(ANALYTICS_EVENTS.signupStarted, { method: "google", next: nextHref });
              trackCtaClick("signup_google", { surface: "signup_page" });
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
