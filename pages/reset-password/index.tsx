import { FormEvent, useState } from "react";

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
    const res = await fetch("/api/auth/request-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Could not start reset.");
      return;
    }
    setMessage("If that email exists, a reset link has been logged to the server console.");
  };

  return (
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card stack">
          <div className="stack" style={{ gap: "6px", textAlign: "center" }}>
            <h1 className="page-title">Reset your password</h1>
            <p className="page-subtitle">
              Enter your email and we will log a reset link for you (local-only).
            </p>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
              />
            </div>
            {error && <div className="error">{error}</div>}
            {message && <div className="status">{message}</div>}
            <button type="submit" disabled={loading} className="button-primary">
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
