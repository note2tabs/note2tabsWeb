import { sanitizeAnalyticsUrl } from "./analyticsPrivacy";

type NativeError = Pick<ErrorEvent, "message" | "filename" | "lineno" | "colno" | "error">;
type Context = {
  browser_error_has_object: boolean;
  browser_error_source_url?: string;
  browser_error_line?: number;
  browser_error_column?: number;
};

/** Preserve native details even when an SDK captures only a synthetic message. */
export function createBrowserExceptionContext(now = Date.now) {
  let pending: { message: string; at: number; context: Context } | null = null;

  const clear = () => { pending = null; };
  const observe = (event: NativeError) => {
    // Resource-load events are not ErrorEvents and must not annotate exceptions.
    clear();
    if (typeof event.message !== "string" || !event.message) return;
    let message = event.message;
    try {
      if (typeof event.error?.message === "string") message = event.error.message;
    } catch { /* Rejected/thrown objects can have unsafe property getters. */ }
    const context: Context = { browser_error_has_object: event.error != null };
    if (event.filename) {
      // No inline/data script bodies, URL credentials, queries or private route IDs.
      try {
        const url = new URL(event.filename);
        if (url.protocol === "https:" || url.protocol === "http:") {
          context.browser_error_source_url = sanitizeAnalyticsUrl(`${url.origin}${url.pathname}`);
        }
      } catch { /* Unknown native filenames are not safe to collect. */ }
    }
    if (Number.isSafeInteger(event.lineno) && event.lineno > 0) context.browser_error_line = event.lineno;
    if (Number.isSafeInteger(event.colno) && event.colno > 0) context.browser_error_column = event.colno;
    pending = { message, at: now(), context };
    const candidate = pending;
    // Only synchronous capture during this dispatch can consume the context.
    // A later rejection/manual capture with the same message is not this event.
    queueMicrotask(() => { if (pending === candidate) clear(); });
  };

  const consume = (exceptions: unknown): Context | undefined => {
    const candidate = pending;
    if (!candidate) return;
    const age = now() - candidate.at;
    if (age < 0 || age > 2_000) { clear(); return; }
    if (!Array.isArray(exceptions)) return;
    // Correlate by message as well as time; never attach a prior browser error
    // to an unrelated captured promise rejection or manual exception.
    if (!exceptions.some(item => item && typeof item === "object" && item.type !== "UnhandledRejection" && item.value === candidate.message)) return;
    clear();
    return candidate.context;
  };

  return { observe, consume, clear };
}
