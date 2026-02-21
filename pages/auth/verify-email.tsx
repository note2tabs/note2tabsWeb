import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

type VerifyState = "idle" | "verifying" | "verified" | "error";

export default function VerifyEmailPage() {
  const router = useRouter();
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
    const raw = router.query.next;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") return "/";
    const trimmed = value.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
    return trimmed;
  }, [router.query.next]);
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
          throw new Error(data?.error || "Could not verify email.");
        }
        setVerifyState("verified");
      })
      .catch((err: any) => {
        setVerifyError(err?.message || "Could not verify email.");
        setVerifyState("error");
      });
  }, [token]);

  const handleResend = async () => {
    setResendBusy(true);
    setResendError(null);
    setResendMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Could not resend verification email.");
      }
      if (data?.alreadyVerified) {
        setResendMessage("Your email is already verified.");
      } else if (data?.sent === false) {
        setResendMessage(
          "Verification email delivery is not configured yet. Set RESEND_API_KEY and a valid sender address."
        );
      } else {
        setResendMessage("Verification email sent. Please check your inbox.");
      }
    } catch (err: any) {
      setResendError(err?.message || "Could not resend verification email.");
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <main className="page page-tight">
      <div className="container">
        <div className="card auth-card stack">
          <div className="stack" style={{ gap: "6px", textAlign: "center" }}>
            <h1 className="page-title">Verify your email</h1>
            <p className="page-subtitle">
              Email verification is required before you can use the transcriber.
            </p>
            {email && <p className="muted text-small">Verification address: {email}</p>}
          </div>

          {verifyState === "verifying" && <div className="notice">Verifying your email...</div>}
          {verifyState === "verified" && (
            <div className="notice">Email verified. You can now use the transcriber.</div>
          )}
          {verifyState === "error" && verifyError && <div className="error">{verifyError}</div>}

          {!token && (
            <div className="notice">
              {sent
                ? "We sent you a verification email. Click the link in that email to verify your account."
                : "We created your account. Verification email delivery is not configured yet; use resend once email is configured."}
            </div>
          )}

          <div className="button-row" style={{ justifyContent: "center" }}>
            <button type="button" className="button-secondary" onClick={() => void handleResend()} disabled={resendBusy}>
              {resendBusy ? "Sending..." : "Resend verification email"}
            </button>
            <Link href={loginHref} className="button-primary">
              Go to login
            </Link>
          </div>
          {resendMessage && <div className="notice">{resendMessage}</div>}
          {resendError && <div className="error">{resendError}</div>}
        </div>
      </div>
    </main>
  );
}
