import { translatedError } from "../../lib/i18n/translate";
import { useLocale } from "../../lib/i18n/react";
import { useLocaleRouter as useRouter } from "../../lib/i18n/react";
import Link from "../../components/LocaleLink";
import { FormEvent, useEffect, useState } from "react";
import NoIndexHead from "../../components/NoIndexHead";

export default function ResetPasswordTokenPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { token } = router.query;
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || typeof token !== "string") return;
    setReady(true);
    setValidating(true);
    setTokenError(null);
    void fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || t("This reset link is invalid or expired."));
        }
      })
      .catch((err: any) => {
        setTokenError(err?.message || t("This reset link is invalid or expired."));
      })
      .finally(() => {
        setValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || typeof token !== "string") {
      setError(t("Reset token missing."));
      return;
    }
    if (!code.trim()) {
      setError(t("Reset code is required."));
      return;
    }
    if (password !== confirm) {
      setError(t("Passwords do not match."));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || t("We could not update your password. Please check the code and try again."));
        return;
      }
      setMessage(t("Password updated. You can now log in."));
    } catch {
      setError(t("We could not reach the password reset service. Check your connection and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <NoIndexHead title={t("Set a new password | Note2Tabs")} canonicalPath="/reset-password" />
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card auth-card--expanded stack">
          <div className="auth-card-header">
            <h1 className="page-title">{t("Set a new password")}</h1>
          </div>
          {!ready || validating ? (
            <div className="auth-card-header">
              <p className="page-subtitle">{ready ? t("Checking reset link...") : t("Loading token...")}</p>
            </div>
          ) : tokenError ? (
            <div className="auth-card-header stack">
              <div className="error" role="alert">{tokenError}</div>
              <Link href="/reset-password" className="button-secondary">{t(" Request a new reset email ")}</Link>
            </div>
          ) : (
            <form className="stack" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="label" htmlFor="reset-code">{t("Reset code")}</label>
                <input
                  id="reset-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="reset-new-password">{t("New password")}</label>
                <input
                  id="reset-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={10}
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="reset-confirm-password">{t("Confirm password")}</label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={10}
                  required
                  className="form-input"
                />
              </div>
              {error && <div className="error" role="alert">{translatedError(error, locale)}</div>}
              {message && <div className="status" role="status">{message}</div>}
              <button type="submit" disabled={submitting} className="button-primary">
                {submitting ? t("Saving...") : t("Update password")}
              </button>
              {message && (
                <div className="auth-links-row auth-links-row--center">
                  <Link href="/auth/login" className="button-link">{t(" Go to login ")}</Link>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
    </>
  );
}
