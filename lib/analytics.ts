type EventPayload = Record<string, any> | undefined;

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function generateEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback below
    }
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

export async function sendEvent(event: string, payload?: EventPayload) {
  if (typeof window === "undefined") return;
  const consent = getCookie("analytics_consent");
  if (consent === "denied") return;

  try {
    await fetch("/api/analytics/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: generateEventId(),
        schema_version: 1,
        event,
        path: window.location.pathname,
        referer: document.referrer,
        payload,
      }),
    });
  } catch (error) {
    // swallow analytics errors
  }
}
