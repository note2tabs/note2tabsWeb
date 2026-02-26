import { FormEvent, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { generateFingerprint } from "../../lib/fingerprint";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
  const signupHref =
    nextHref === "/" ? "/auth/signup" : `/auth/signup?next=${encodeURIComponent(nextHref)}`;

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
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
      fingerprintId,
      callbackUrl: "/",
    });
    setLoading(false);
    if (res?.error) {
      setError(res.error);
    } else {
      router.push("/");
    }
  };

  return (
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card stack">
          <div className="stack" style={{ gap: "6px", textAlign: "center" }}>
            <h1 className="page-title">Log in</h1>
            <p className="page-subtitle">Welcome back to Note2Tabs.</p>
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
            <div className="form-group">
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input"
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading} className="button-primary">
              {loading ? "Signing in..." : "Log in"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="button-secondary"
          >
            Continue with Google
          </button>
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <Link href={signupHref} className="button-link">
              Need an account? Sign up
            </Link>
            <Link href="/reset-password" className="button-link">
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
