import { normalizeSafeReturnPath } from "../../lib/safeReturnPath";
import { translatedError } from "../../lib/i18n/translate";
import { useLocale } from "../../lib/i18n/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "../../components/LocaleLink";
import { useLocaleRouter as useRouter } from "../../lib/i18n/react";
import { signIn } from "next-auth/react";
import { generateFingerprint } from "../../lib/fingerprint";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../../lib/analytics";
import NoIndexHead from "../../components/NoIndexHead";
import { clearOAuthIntent, saveOAuthIntent } from "../../lib/oauthAnalytics";
import { categorizeAnalyticsDestination } from "../../lib/analyticsPrivacy";
import { categorizeAnalyticsError } from "../../lib/analyticsErrors";
import { premiumFunnelProperties, readPremiumFunnelContext } from "../../lib/premiumFunnel";
import { isTabShareEmailDestination, TAB_SHARE_EMAIL_SOURCE } from "../../lib/tabShareAnalytics";

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
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const shareEmailClickTracked = useRef(false);
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
          name,
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
      sendEvent(ANALYTICS_EVENTS.signupCompleted, {
        method: "email",
        destination,
        ...(fromTabShareEmail ? { signup_source: TAB_SHARE_EMAIL_SOURCE } : {}),
        ...(premiumFunnel ? premiumFunnelProperties(premiumFunnel) : {}),
      });
      // Keep the newly created account signed in and take them directly to
      // their intended destination. New accounts may complete one standard
      // transcription before verification; Heavy preview access still
      // requires a verified email.
      await signIn("credentials", {
        redirect: false,
        email,
        password,
        fingerprintId,
        callbackUrl: nextHref,
      }).catch(() => null);
      await router.push(nextHref);
    } catch (requestError) {
      setError(t("We could not reach the sign-up service. Check your connection and try again."));
      sendEvent(ANALYTICS_EVENTS.signupFailed, {
        method: "email",
        error_code: categorizeAnalyticsError(requestError, "signup_network_error"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <NoIndexHead title={t("Create your account | Note2Tabs")} canonicalPath="/auth/signup" />
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card auth-card--expanded stack">
          <div className="auth-card-header">
            <h1 className="page-title">{t("Create your account")}</h1>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label" htmlFor="signup-name">{t("Name (optional)")}</label>
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
            {(error || routeError) && <div className="error" role="alert">{translatedError(error || routeError, locale)}</div>}
            <button type="submit" disabled={loading} className="button-primary">
              {loading ? t("Creating account...") : t("Sign up")}
            </button>
          </form>
          <div className="auth-card-divider" aria-hidden="true">
            <span>{t("or")}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              const premiumFunnel = readPremiumFunnelContext();
              sendEvent(ANALYTICS_EVENTS.signupStarted, {
                method: "google",
                destination: categorizeAnalyticsDestination(nextHref),
                ...(fromTabShareEmail ? { signup_source: TAB_SHARE_EMAIL_SOURCE } : {}),
                ...(premiumFunnel ? premiumFunnelProperties(premiumFunnel) : {}),
              });
              trackCtaClick("signup_google", { surface: "signup_page" });
              saveOAuthIntent("signup", nextHref);
              signIn("google", { callbackUrl: nextHref });
            }}
            className="button-secondary"
          >
            <img src="/icons/google.svg" alt="" width={17} height={16} aria-hidden="true" />{t(" Continue with Google ")}</button>
          <div className="auth-links-row auth-links-row--center">
            <Link href={loginHref} className="button-link">{t(" Already have an account? Log in ")}</Link>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
