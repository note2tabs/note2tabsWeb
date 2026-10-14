/** Template dynamic API path segments; an unknown endpoint is intentionally coarse. */
export function diagnosticEndpoint(raw: string, origin: string): string | undefined {
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return;
    if (/^\/api\/(analytics|gte\/telemetry|auth\/session)(\/|$)/.test(url.pathname)) return;
    const segments = url.pathname.split("/").filter(Boolean);
    const publicSegments = new Set(["api", "gte", "gte-guest", "editors", "tracks", "notes", "chords", "cuts", "generate", "transcriber", "import", "export", "jobs", "finalize", "redo", "artifacts", "tabs", "update", "transcribe", "uploads", "presign", "credits", "stripe", "create-checkout-session", "change-plan", "subscription-status", "create-portal-session", "confirm-checkout-session", "auth", "signup", "signin", "signout", "callback", "credentials", "google", "verify-email", "resend-verification", "request-reset", "reset-password", "practice-rate", "chord-fingerings", "account", "activity", "tutorial", "delete", "heavy-preview", "eligibility", "backend", "v1"]);
    return "/" + segments.slice(0, 12).map(segment => publicSegments.has(segment) ? segment : "[id]").join("/");
  } catch { return; }
}

