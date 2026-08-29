import { FormEvent, useState } from "react";
import Link from "next/link";
import NoIndexHead from "../../components/NoIndexHead";

export default function RequestResetPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "We could not start the password reset. Please try again shortly.");
        return;
      }
      setMessage("If that email exists, we sent a reset email with a link and reset code.");
    } catch {
      setError("We could not reach the password reset service. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <NoIndexHead title="Reset your password | Note2Tabs" canonicalPath="/reset-password" />
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card auth-card--expanded stack">
          <div className="auth-card-header">
            <h1 className="page-title">Reset your password</h1>
            <p className="page-subtitle">
              Enter your email and we will send a reset link plus a reset code.
            </p>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label" htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
              />
            </div>
            {error && <div className="error" role="alert">{error}</div>}
            {message && <div className="status" role="status">{message}</div>}
            <button type="submit" disabled={loading} className="button-primary">
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
          <div className="auth-links-row auth-links-row--center">
            <Link href="/auth/login" className="button-link">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
