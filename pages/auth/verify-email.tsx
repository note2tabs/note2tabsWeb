import { normalizeSafeReturnPath } from "../../lib/safeReturnPath";
import { useLocale } from "../../lib/i18n/react";
import Link from "../../components/LocaleLink";
import { useLocaleRouter as useRouter } from "../../lib/i18n/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import NoIndexHead from "../../components/NoIndexHead";
import { ANALYTICS_EVENTS, sendEvent } from "../../lib/analytics";

type VerifyState = "idle" | "verifying" | "verified" | "error";

export default function VerifyEmailPage() {
  const { t, locale, href: localePath } = useLocale();
  const router = useRouter();
  const { update: updateSession } = useSession();
  const verifyRunRef = useRef(false);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  const token = useMemo(() => {
    const raw = router.query.token;
    return typeof raw === "string" ? raw : "";
  }, [router.query.token]);

  const email = useMemo(() => {
    const raw = router.query.email;
    return typeof raw === "string" ? raw : "";
  }, [router.query.email]);
  const sent = useMemo(() => {
    const raw = router.query.sent;
    return raw === "0" ? false : true;
  }, [router.query.sent]);
  const nextHref = useMemo(() => {
    const raw = Array.isArray(router.query.next) ? router.query.next[0] : router.query.next;
    return localePath(normalizeSafeReturnPath(raw, locale !== "en" ? "/transcribe" : "/home"));
  }, [router.query.next, locale, localePath]);
  const loginHref =
    nextHref === "/" ? "/auth/login" : `/auth/login?next=${encodeURIComponent(nextHref)}`;

  useEffect(() => {
    if (!token || verifyRunRef.current) return;
    verifyRunRef.current = true;
    setVerifyState("verifying");
    setVerifyError(null);
    void fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || t("This verification link could not be confirmed. It may have expired; request a new email below."));
        }
        const refreshedSession = await updateSession().catch(() => null);
        sendEvent(ANALYTICS_EVENTS.emailVerified, { method: "email_link" });
        setVerifyState("verified");
        await router.replace(refreshedSession ? nextHref : loginHref);
      })
      .catch((err: any) => {
        setVerifyError(
          err?.message ||
            t("This verification link could not be confirmed. It may have expired; request a new email below.")
        );
        setVerifyState("error");
      });
  }, [loginHref, nextHref, router, token, updateSession]);

  const handleResend = async () => {
    setResendBusy(true);
    setResendError(null);
    setResendMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || undefined,
          returnTo: nextHref,
          locale,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || t("We could not send another verification email. Please try again shortly."));
      }
      if (data?.alreadyVerified) {
        setResendMessage(t("Your email is already verified."));
      } else if (data?.sent === false) {
        setResendMessage(
          t("We could not send the verification email right now. Please try again shortly or contact support.")
        );
      } else {
        setResendMessage(t("Verification email sent. Please check your inbox."));
      }
    } catch (err: any) {
      setResendError(
        err?.message || t("We could not send another verification email. Check your connection and try again.")
      );
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <>
      <NoIndexHead title={t("Verify your email | Note2Tabs")} canonicalPath="/auth/verify-email" />
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card auth-card--expanded stack">
          <div className="auth-card-header">
            <h1 className="page-title">{t("Verify your email")}</h1>
            <p className="page-subtitle">{t(" Verify your email to start transcribing. Eligible accounts also unlock a one-time 30-second Heavy preview. ")}</p>
            {email && <p className="muted text-small">{t("Verification address: ")}{email}</p>}
          </div>

          {verifyState === "verifying" && <div className="notice">{t("Verifying your email...")}</div>}
          {verifyState === "verified" && (
            <div className="notice">{t("Email verified. Taking you back to Note2Tabs…")}</div>
          )}
          {verifyState === "error" && verifyError && <div className="error" role="alert">{verifyError}</div>}

          {!token && (
            <div className="notice">
              {sent
                ? t("We sent you a verification email. Click the link in that email to verify your account.")
                : t("Your account was created, but we could not send the verification email. Try resending it below or contact support.")}
            </div>
          )}

          <div className="auth-links-row auth-links-row--center">
            <button type="button" className="button-secondary" onClick={() => void handleResend()} disabled={resendBusy}>
              {resendBusy ? t("Sending...") : t("Resend verification email")}
            </button>
            <Link href={loginHref} className="button-primary">{t(" Go to login ")}</Link>
          </div>
          {resendMessage && <div className="notice" role="status">{resendMessage}</div>}
          {resendError && <div className="error" role="alert">{resendError}</div>}
        </div>
      </div>
    </main>
    </>
  );
}
