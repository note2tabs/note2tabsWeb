import { useRouter } from "next/router";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordTokenPage() {
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
          throw new Error(data?.error || "This reset link is invalid or expired.");
        }
      })
      .catch((err: any) => {
        setTokenError(err?.message || "This reset link is invalid or expired.");
      })
      .finally(() => {
        setValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || typeof token !== "string") {
      setError("Reset token missing.");
      return;
    }
    if (!code.trim()) {
      setError("Reset code is required.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, code, password }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error || "Could not reset password.");
      return;
    }
    setMessage("Password updated. You can now log in.");
  };

  return (
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card auth-card--expanded stack">
          <div className="auth-card-header">
            <h1 className="page-title">Set a new password</h1>
          </div>
          {!ready || validating ? (
            <div className="auth-card-header">
              <p className="page-subtitle">{ready ? "Checking reset link..." : "Loading token..."}</p>
            </div>
          ) : tokenError ? (
            <div className="auth-card-header stack">
              <div className="error">{tokenError}</div>
              <Link href="/reset-password" className="button-secondary">
                Request a new reset email
              </Link>
            </div>
          ) : (
            <form className="stack" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="label">Reset code</label>
                <input
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
                <label className="label">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={10}
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="label">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={10}
                  required
                  className="form-input"
                />
              </div>
              {error && <div className="error">{error}</div>}
              {message && <div className="status">{message}</div>}
              <button type="submit" disabled={submitting} className="button-primary">
                {submitting ? "Saving..." : "Update password"}
              </button>
              {message && (
                <div className="auth-links-row auth-links-row--center">
                  <Link href="/auth/login" className="button-link">
                    Go to login
                  </Link>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
