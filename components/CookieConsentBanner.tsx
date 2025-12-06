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

function ensureSessionId() {
  if (typeof crypto === "undefined" || typeof window === "undefined") return;
  const existing = getCookie(SESSION_COOKIE);
  if (existing) return existing;
  const uuid = self.crypto.randomUUID();
  setCookie(SESSION_COOKIE, uuid);
  return uuid;
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
    const sessionId = ensureSessionId();
    try {
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
    <div className="fixed bottom-4 left-0 right-0 z-50 px-4">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl shadow-black/40">
        <p className="text-sm text-slate-200">
          We use cookies and device details to improve Note2Tabs and prevent abuse. You can accept or reject
          analytics. See our <a className="text-blue-400 hover:text-blue-300" href="/privacy">Privacy Policy</a>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAccept}
            disabled={processing}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {processing ? "Enabling…" : "Accept"}
          </button>
          <button
            type="button"
            onClick={handleReject}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
