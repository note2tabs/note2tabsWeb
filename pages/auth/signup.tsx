import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";
import { generateFingerprint } from "../../lib/fingerprint";

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
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
      return;
    }
    const nextEmail = encodeURIComponent((data?.email as string) || email);
    const sentParam = data?.emailSent === false ? "&sent=0" : "";
    const nextParam = nextHref === "/" ? "" : `&next=${encodeURIComponent(nextHref)}`;
    router.push(`/auth/verify-email?email=${nextEmail}${sentParam}${nextParam}`);
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
                minLength={10}
                className="form-input"
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading} className="button-primary">
              {loading ? "Creating account..." : "Sign up"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="button-secondary"
          >
            Continue with Google
          </button>
          <div className="button-row" style={{ justifyContent: "center" }}>
            <Link href={loginHref} className="button-link">
              Already have an account? Log in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
