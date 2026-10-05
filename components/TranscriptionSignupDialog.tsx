import Link from "next/link";
import { signIn } from "next-auth/react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import { categorizeAnalyticsError } from "../lib/analyticsErrors";
import { generateFingerprint } from "../lib/fingerprint";
import { saveOAuthIntent } from "../lib/oauthAnalytics";

type Props = {
  open: boolean;
  mode: "FILE" | "YOUTUBE";
  returnTo: string;
  onClose: () => void;
  onComplete: () => void;
};

export default function TranscriptionSignupDialog({ open, mode, returnTo, onClose, onComplete }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const trackedOpenRef = useRef(false);

  const closeDialog = (reason: "close_button" | "escape" | "backdrop") => {
    sendEvent(ANALYTICS_EVENTS.transcriptionSignupDialogDismissed, {
      surface: "transcription_signup_dialog",
      mode,
      reason,
    });
    onClose();
  };

  useEffect(() => {
    if (!open) {
      trackedOpenRef.current = false;
      return;
    }
    if (!trackedOpenRef.current) {
      trackedOpenRef.current = true;
      sendEvent(ANALYTICS_EVENTS.transcriptionSignupDialogShown, {
        surface: "transcription_signup_dialog",
        mode,
      });
    }
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    emailRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) closeDialog("escape");
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [loading, mode, onClose, open]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const analytics = { method: "email", destination: "transcription_resume", surface: "transcription_signup_dialog", mode };
    sendEvent(ANALYTICS_EVENTS.signupStarted, analytics);
    try {
      const fingerprint = await generateFingerprint().catch(() => null);
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fingerprintId: fingerprint?.fingerprintId, returnTo }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "We could not create your account. Please try again.");
      sendEvent(ANALYTICS_EVENTS.signupCompleted, analytics);
      const login = await signIn("credentials", {
        redirect: false,
        email,
        password,
        fingerprintId: fingerprint?.fingerprintId,
        callbackUrl: returnTo,
      });
      if (login?.error) throw new Error("Your account was created. Log in to continue with your saved selection.");
      onComplete();
    } catch (signupError) {
      const message = signupError instanceof Error ? signupError.message : "We could not create your account. Please try again.";
      setError(message);
      sendEvent(ANALYTICS_EVENTS.signupFailed, {
        ...analytics,
        error_code: categorizeAnalyticsError(signupError, "signup_failed"),
      });
    } finally {
      setLoading(false);
    }
  };

  const loginHref = `/auth/login?next=${encodeURIComponent(returnTo)}`;

  return (
    <div className="transcription-signup-scrim" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) closeDialog("backdrop");
    }}>
      <div ref={dialogRef} className="transcription-signup-dialog" role="dialog" aria-modal="true" aria-labelledby="transcription-signup-title">
        <button type="button" className="transcription-signup-dialog__close" onClick={() => closeDialog("close_button")} disabled={loading} aria-label="Close account creation">×</button>
        <header>
          <h2 id="transcription-signup-title">Create an account to transcribe</h2>
          <p>Your {mode === "YOUTUBE" ? "YouTube section" : "audio file"} is saved. After sign-up, you’ll return automatically to your transcription.</p>
        </header>
        <form onSubmit={handleSubmit}>
          <label htmlFor="transcription-signup-email">Email</label>
          <input ref={emailRef} id="transcription-signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label htmlFor="transcription-signup-password">Password</label>
          <input id="transcription-signup-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required />
          <small>At least 10 characters</small>
          {error ? <div className="error" role="alert">{error}</div> : null}
          <button type="submit" className="button-primary" disabled={loading}>{loading ? "Creating account…" : "Create account and continue"}</button>
        </form>
        <div className="auth-card-divider" aria-hidden="true"><span>or</span></div>
        <button type="button" className="button-secondary transcription-signup-dialog__google" disabled={loading} onClick={() => {
          const analytics = { method: "google", destination: "transcription_resume", surface: "transcription_signup_dialog", mode };
          sendEvent(ANALYTICS_EVENTS.signupStarted, analytics);
          trackCtaClick("transcription_signup_google", analytics);
          saveOAuthIntent("signup", returnTo, { surface: "transcription_signup_dialog", mode });
          void signIn("google", { callbackUrl: returnTo });
        }}><img src="/icons/google.svg" alt="" width={17} height={16} aria-hidden="true" />Continue with Google</button>
        <p className="transcription-signup-dialog__login">Already have an account? <Link href={loginHref}>Log in</Link></p>
      </div>
    </div>
  );
}
