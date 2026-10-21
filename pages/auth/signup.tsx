import { normalizeSafeReturnPath } from "../../lib/safeReturnPath";
import { translatedError } from "../../lib/i18n/translate";
import { useLocale } from "../../lib/i18n/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocaleRouter as useRouter } from "../../lib/i18n/react";
import { signIn } from "next-auth/react";
import { generateFingerprint } from "../../lib/fingerprint";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../../lib/analytics";
import NoIndexHead from "../../components/NoIndexHead";
import { clearOAuthIntent } from "../../lib/oauthAnalytics";
import { startGoogleSignIn } from "../../lib/oauthSignIn";
import { categorizeAnalyticsDestination } from "../../lib/analyticsPrivacy";
import { categorizeAnalyticsError } from "../../lib/analyticsErrors";
import { premiumFunnelProperties, readPremiumFunnelContext } from "../../lib/premiumFunnel";
import { isTabShareEmailDestination, TAB_SHARE_EMAIL_SOURCE } from "../../lib/tabShareAnalytics";
import AuthModeSwitch from "../../components/AuthModeSwitch";

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
  const { t, locale, href: localePath } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const shareEmailClickTracked = useRef(false);
  const formInteracted = useRef(false);
  const validationReported = useRef(false);
  const submitting = useRef(false);
  const nextHref = useMemo(() => {
    const raw = Array.isArray(router.query.next) ? router.query.next[0] : router.query.next;
    return localePath(normalizeSafeReturnPath(raw, locale !== "en" ? "/transcribe" : "/transcriber"));
  }, [router.query.next, locale, localePath]);
  const loginHref =
    nextHref === "/" ? "/auth/login" : `/auth/login?next=${encodeURIComponent(nextHref)}`;
  const routeError = useMemo(() => authErrorMessage(router.query.error), [router.query.error]);
  const fromTabShareEmail = useMemo(() => isTabShareEmailDestination(nextHref), [nextHref]);

  useEffect(() => {
    if (!router.isReady || !fromTabShareEmail || shareEmailClickTracked.current) return;
    shareEmailClickTracked.current = true;
    sendEvent(ANALYTICS_EVENTS.tabShareEmailClicked, {
      landing: "signup",
      recipient_status: "new",
      source: TAB_SHARE_EMAIL_SOURCE,
    });
  }, [fromTabShareEmail, router.isReady]);

  useEffect(() => {
    if (router.query.error) clearOAuthIntent();
  }, [router.query.error]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    clearOAuthIntent();
    setError(null);
    setLoading(true);
    const destination = categorizeAnalyticsDestination(nextHref);
    const premiumFunnel = readPremiumFunnelContext();
    sendEvent(ANALYTICS_EVENTS.signupStarted, {
      method: "email",
      destination,
      ...(premiumFunnel ? premiumFunnelProperties(premiumFunnel) : {}),
    });
    let fingerprintId: string | undefined;
    try {
      const fingerprint = await generateFingerprint();
      fingerprintId = fingerprint.fingerprintId;
    } catch {
      // best effort only
    }
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fingerprintId,
          funnelId: premiumFunnel?.funnelId,
          funnelSource: premiumFunnel?.source,
          funnelReason: premiumFunnel?.reason,
          returnTo: nextHref,
          locale,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || t("We could not create your account. Please check the details and try again."));
        sendEvent(ANALYTICS_EVENTS.signupFailed, {
          method: "email",
          error_code: categorizeAnalyticsError(data?.error, "signup_failed"),
        });
        return;
      }
      // The account-creation endpoint owns signup_completed.
      // Keep the newly created account signed in and take them directly to
      // their intended destination. New accounts may complete one standard
      // transcription before verification; Heavy preview access still
      // requires a verified email.
      const signedIn = await signIn("credentials", {
        redirect: false,
        email,
        password,
        fingerprintId,
        callbackUrl: nextHref,
      }).catch(() => null);
      if (!signedIn?.ok || signedIn.error) {
        sendEvent(ANALYTICS_EVENTS.loginFailed, { method: "credentials", error_code: "signup_auto_login_failed", surface: "signup_page" });
        await router.push(`${loginHref}${loginHref.includes("?") ? "&" : "?"}accountCreated=1`);
        return;
      }
      await router.push(nextHref);
    } catch (requestError) {
      setError(t("We could not reach the sign-up service. Check your connection and try again."));
      sendEvent(ANALYTICS_EVENTS.signupFailed, {
        method: "email",
        error_code: categorizeAnalyticsError(requestError, "signup_network_error"),
      });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setLoading(true);
    const premiumFunnel = readPremiumFunnelContext();
    sendEvent(ANALYTICS_EVENTS.signupStarted, {
      method: "google", destination: categorizeAnalyticsDestination(nextHref),
      ...(fromTabShareEmail ? { signup_source: TAB_SHARE_EMAIL_SOURCE } : {}),
      ...(premiumFunnel ? premiumFunnelProperties(premiumFunnel) : {}),
    });
    trackCtaClick("signup_google", { surface: "signup_page" });
    if (!await startGoogleSignIn("signup", nextHref)) {
      setError(t("Google sign up could not finish. Please try again."));
      sendEvent(ANALYTICS_EVENTS.signupFailed, { method: "google", error_code: "oauth_start_failed" });
    }
    setLoading(false);
    submitting.current = false;
  };

  return (
    <>
      <NoIndexHead title={t("Create your account | Note2Tabs")} canonicalPath="/auth/signup" />
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card auth-card--expanded stack">
          <AuthModeSwitch mode="signup" alternateHref={loginHref} />
          <div className="auth-card-header">
            <h1 className="page-title">{t("Create your account")}</h1>
          </div>
          <button type="button" onClick={() => void handleGoogleSignIn()} disabled={loading} className="button-secondary">
            <img src="/icons/google.svg" alt="" width={17} height={16} aria-hidden="true" />{t(" Continue with Google ")}
          </button>
          <div className="auth-card-divider" aria-hidden="true"><span>{t("or")}</span></div>
          <form className="stack" onSubmit={handleSubmit}
            onFocus={() => {
              if (formInteracted.current) return;
              formInteracted.current = true;
              sendEvent("signup_form_interacted", { method: "email", surface: "signup_page" });
            }}
            onChange={() => { validationReported.current = false; }}
            onInvalidCapture={event => {
              if (validationReported.current) return;
              validationReported.current = true;
              const input = event.target as HTMLInputElement;
              sendEvent("signup_validation_failed", {
                method: "email", surface: "signup_page",
                error_code: input.validity.valueMissing ? "required_field" : input.type === "email" ? "invalid_email" : "password_too_short",
                field: input.name === "email" ? "email" : "password",
              });
            }}>
            <div className="form-group">
              <label className="label" htmlFor="signup-email">{t("Email")}</label>
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
              <label className="label" htmlFor="signup-password">{t("Password")}</label>
              <div className="auth-password-field">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  name="new-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={10}
                  aria-describedby="signup-password-hint"
                  className="form-input"
                />
                <button type="button" className="auth-password-toggle"
                  aria-label={t(showPassword ? "Hide password" : "Show password")}
                  aria-pressed={showPassword} aria-controls="signup-password"
                  onClick={() => setShowPassword(value => !value)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPassword && <path d="m3 3 18 18" />}
                  </svg>
                </button>
              </div>
              <p id="signup-password-hint" className="auth-field-hint">{t("Password must be at least 10 characters.")}</p>
            </div>
            {(error || routeError) && <div className="error" role="alert">{translatedError(error || routeError, locale)}</div>}
            <button type="submit" disabled={loading} className="button-primary">
              {loading ? t("Creating account...") : t("Sign up")}
            </button>
          </form>
        </div>
      </div>
    </main>
    </>
  );
}
