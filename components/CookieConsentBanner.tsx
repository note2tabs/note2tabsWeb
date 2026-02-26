import { useEffect, useState } from "react";
import { generateFingerprint } from "../lib/fingerprint";

const CONSENT_COOKIE = "analytics_consent";
const SESSION_COOKIE = "analytics_session";
const ANON_COOKIE = "analytics_anon";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string, maxAgeSec = 365 * 24 * 60 * 60) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + maxAgeSec * 1000).toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; Max-Age=${maxAgeSec}; path=/; SameSite=Lax${secure}`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; expires=${new Date(0).toUTCString()}; path=/; SameSite=Lax`;
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

function ensureTrackingIds() {
  if (typeof crypto === "undefined" || typeof window === "undefined") return;
  let sessionId = getCookie(SESSION_COOKIE);
  let anonId = getCookie(ANON_COOKIE);

  if (!sessionId) {
    sessionId = generateSessionId();
    setCookie(SESSION_COOKIE, sessionId, 24 * 60 * 60);
  }
  if (!anonId) {
    anonId = generateSessionId();
    setCookie(ANON_COOKIE, anonId, 90 * 24 * 60 * 60);
  }
  return { sessionId, anonId };
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const consent = getCookie(CONSENT_COOKIE);
    if (!consent) setVisible(true);
    const openBanner = () => setVisible(true);
    window.addEventListener("note2tabs:open-cookie-settings", openBanner as EventListener);
    return () => {
      window.removeEventListener("note2tabs:open-cookie-settings", openBanner as EventListener);
    };
  }, []);

  const handleAllow = async () => {
    setProcessing(true);
    setCookie(CONSENT_COOKIE, "granted", 365 * 24 * 60 * 60);
    try {
      const ids = ensureTrackingIds();
      const { fingerprintId } = await generateFingerprint();
      await fetch("/api/consent/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "granted", fingerprintId, sessionId: ids?.sessionId }),
      });
    } catch (error) {
      // ignore errors
    } finally {
      setProcessing(false);
      setVisible(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    setCookie(CONSENT_COOKIE, "denied", 365 * 24 * 60 * 60);
    deleteCookie(SESSION_COOKIE);
    deleteCookie(ANON_COOKIE);
    try {
      await fetch("/api/consent/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      // ignore errors
    } finally {
      setProcessing(false);
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner">
      <div className="card cookie-card">
        <p>
          We use analytics cookies and device details by default to improve Note2Tabs and prevent abuse. You
          can deny analytics any time. See our <a className="button-link" href="/privacy">Privacy Policy</a>.
        </p>
        <div className="cookie-actions">
          <button type="button" onClick={handleAllow} disabled={processing} className="button-primary">
            {processing ? "Saving..." : "Continue"}
          </button>
          <button type="button" onClick={() => void handleReject()} className="button-secondary" disabled={processing}>
            Deny
          </button>
          <a className="button-link" href="/settings#privacy-controls">
            Manage settings
          </a>
        </div>
      </div>
    </div>
  );
}
