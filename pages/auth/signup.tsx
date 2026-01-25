import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Could not sign up.");
      return;
    }
    await signIn("credentials", { redirect: false, email, password, callbackUrl: "/" });
    router.push("/");
  };

  return (
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card stack">
          <div className="stack" style={{ gap: "6px", textAlign: "center" }}>
            <h1 className="page-title">Create your account</h1>
            <p className="page-subtitle">Get started with Note2Tabs.</p>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label">Name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
              />
            </div>
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
            <div className="form-group">
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="form-input"
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading} className="button-primary">
              {loading ? "Creating account..." : "Sign up"}
            </button>
          </form>
          <div className="button-row" style={{ justifyContent: "center" }}>
            <Link href="/auth/login" className="button-link">
              Already have an account? Log in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
