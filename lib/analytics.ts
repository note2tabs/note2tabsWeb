type EventPayload = Record<string, any> | undefined;

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function sendEvent(event: string, payload?: EventPayload) {
  if (typeof window === "undefined") return;
  const consent = getCookie("analytics_consent");
  if (consent !== "granted") return;

  try {
    await fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
