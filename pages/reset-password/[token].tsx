import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordTokenPage() {
  const router = useRouter();
  const { token } = router.query;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (token && typeof token === "string") {
      setReady(true);
    }
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
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
        <div className="card auth-card stack">
          <h1 className="page-title" style={{ textAlign: "center" }}>
            Set a new password
          </h1>
          {!ready ? (
            <p className="page-subtitle" style={{ textAlign: "center" }}>
              Loading token...
            </p>
          ) : (
            <form className="stack" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="label">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
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
                  minLength={6}
                  required
                  className="form-input"
                />
              </div>
              {error && <div className="error">{error}</div>}
              {message && <div className="status">{message}</div>}
              <button type="submit" disabled={submitting} className="button-primary">
                {submitting ? "Saving..." : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
