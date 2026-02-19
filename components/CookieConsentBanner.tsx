import { useEffect, useState } from "react";
import { generateFingerprint } from "../lib/fingerprint";

const CONSENT_COOKIE = "analytics_consent";
const SESSION_COOKIE = "analytics_session";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function generateSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch (error) {
      // fallback below
    }
  }
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function ensureSessionId() {
  if (typeof crypto === "undefined" || typeof window === "undefined") return;
  const existing = getCookie(SESSION_COOKIE);
  if (existing) return existing;
  const sessionId = generateSessionId();
  setCookie(SESSION_COOKIE, sessionId);
  return sessionId;
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const consent = getCookie(CONSENT_COOKIE);
    if (!consent) setVisible(true);
  }, []);

  const handleAccept = async () => {
    setProcessing(true);
    setCookie(CONSENT_COOKIE, "granted");
    let sessionId: string | undefined;
    try {
      sessionId = ensureSessionId();
      const { fingerprintId } = await generateFingerprint();
      await fetch("/api/consent/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprintId, sessionId }),
      });
    } catch (error) {
      // ignore errors
    } finally {
      setProcessing(false);
      setVisible(false);
    }
  };

  const handleReject = () => {
    setCookie(CONSENT_COOKIE, "denied");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner">
      <div className="card cookie-card">
        <p>
          We use cookies and device details to improve Note2Tabs and prevent abuse. You can accept or reject
          analytics. See our <a className="button-link" href="/privacy">Privacy Policy</a>.
        </p>
        <div className="cookie-actions">
          <button type="button" onClick={handleAccept} disabled={processing} className="button-primary">
            {processing ? "Enabling..." : "Accept"}
          </button>
          <button type="button" onClick={handleReject} className="button-secondary">
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
