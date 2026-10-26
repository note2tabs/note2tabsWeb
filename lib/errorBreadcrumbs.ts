import { beginFrustrationAction, resetFrustrationContext } from "./frustrationSignals";
import { diagnosticEndpoint as templateEndpoint } from "./diagnosticEndpoint";
import { sanitizeAnalyticsPathname } from "./analyticsPrivacy";

type Breadcrumb = Record<string, string | number | boolean>;
const breadcrumbs: Breadcrumb[] = [];
let enabled = false;
export function diagnosticTrackingEnabled() { return enabled; }
export function setErrorBreadcrumbsEnabled(value: boolean) {
  enabled = value;
  if (!value) breadcrumbs.length = 0;
}
export function addErrorBreadcrumb(kind: string, details: Breadcrumb = {}) {
  if (!enabled) return;
  breadcrumbs.push({ ...details, kind, at: Date.now() });
  if (breadcrumbs.length > 25) breadcrumbs.shift();
}
export function getErrorBreadcrumbs() {
  return breadcrumbs.filter(item => Date.now() - Number(item.at) < 5 * 60_000).map(item => ({...item}));
}
// Never collect DOM text, input values, element IDs, query strings or bodies.
export function observeDiagnosticAction(event: Event) {
  const element = (event.target as Element | null)?.closest?.("button,a,[role=button]");
  if (!element) return;
  const action = element.getAttribute("data-diagnostic-action");
  const allowed = new Set(["choose_audio", "submit_transcription", "play", "export", "save", "rename", "delete"]);
  addErrorBreadcrumb("click", { element: element.tagName.toLowerCase(), ...(action && allowed.has(action) ? { action } : {}) });
}

export function diagnosticEndpoint(raw: string) { return templateEndpoint(raw, window.location.origin); }

export function installDiagnosticFetch(onFailure: (details: Breadcrumb) => void) {
  const original = window.fetch;
  if (typeof original !== "function") return () => {};
  const wrapped: typeof fetch = async (input, init) => {
    let endpoint: string | undefined;
    let method = "GET";
    try {
      endpoint = diagnosticEndpoint(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const candidate = init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
      method = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(candidate.toUpperCase()) ? candidate.toUpperCase() : "OTHER";
    } catch { /* Keep the original fetch behavior for unusual input objects. */ }
    const finish = endpoint === "/api/transcribe" ? beginFrustrationAction("transcription_submit")
      : endpoint === "/api/uploads/presign" ? beginFrustrationAction("upload_start")
      : endpoint === "/api/stripe/create-checkout-session" ? beginFrustrationAction("checkout_open") : undefined;
    const started = Date.now();
    const record = (response?: Response, error?: unknown) => {
      if (!enabled || !endpoint) return;
      try {
        const details: Breadcrumb = { endpoint, method, duration_ms: Math.max(0, Date.now() - started), ...(response ? { http_status: response.status } : { failure_type: error instanceof Error && error.name === "AbortError" ? "aborted" : "network_error" }) };
        for (const header of ["x-vercel-id", "x-request-id"]) {
          const value = response?.headers.get(header);
          if (value && /^[a-zA-Z0-9_:.-]{1,160}$/.test(value)) details[header === "x-vercel-id" ? "vercel_request_id" : "request_id"] = value;
        }
        addErrorBreadcrumb("request", details);
        // HTTP 4xx and cancellations are context, not automatically new exceptions.
        if ((response && response.status >= 500) || (!response && details.failure_type !== "aborted")) onFailure(details);
      } catch { /* Neither telemetry nor callback errors may alter fetch semantics. */ }
    };
    try {
      const response = await original.call(window, input, init);
      record(response);
      finish?.(response.ok ? "success" : "failed");
      return response;
    } catch (error) {
      record(undefined, error);
      finish?.(error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed");
      throw error;
    }
  };
  window.fetch = wrapped;
  return () => { if (window.fetch === wrapped) window.fetch = original; };
}

export function recordDiagnosticNavigation(path: string, phase: "start" | "complete" | "error") {
  if(phase === "start")resetFrustrationContext();
  addErrorBreadcrumb("navigation", { path: sanitizeAnalyticsPathname(path), phase });
}

/** Fixed product vocabulary only; payloads may contain private user content. */
export function recordDiagnosticProductEvent(event: string, payload?: Record<string, unknown>) {
  const events = new Set(["transcription_started", "transcription_queued", "transcription_succeeded", "transcription_failed", "transcription_editor_import_started", "transcription_imported_to_editor", "transcription_editor_import_failed", "checkout_started", "checkout_failed"]);
  const actions = new Set(["choose_audio_file", "convert_to_tabs", "use_free_heavy_preview", "mode_file", "mode_youtube"]);
  if (events.has(event)) addErrorBreadcrumb("product_event", { event });
  if (event === "cta_clicked" && typeof payload?.cta === "string" && actions.has(payload.cta)) addErrorBreadcrumb("product_action", { action: payload.cta });
}
