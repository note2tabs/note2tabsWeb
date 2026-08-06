import { toAnalyticsCategory } from "./analyticsPrivacy";

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

export function categorizeAnalyticsError(error: unknown, fallback = "unknown") {
  const text = errorText(error).toLowerCase();

  if (/too large|file size|payload size|\b413\b/.test(text)) return "file_too_large";
  if (/already exists|already registered/.test(text)) return "account_exists";
  if (/invalid email|email address/.test(text)) return "invalid_email";
  if (/password/.test(text)) return "weak_password";
  if (/verify|unverified/.test(text)) return "email_unverified";
  if (/not authenticated|unauthori[sz]ed|sign(?:ed)? in|\b401\b|\b403\b/.test(text)) {
    return "auth_required";
  }
  if (/credit|quota|insufficient|limit exceeded/.test(text)) return "quota_exceeded";
  if (/rate limit|too many requests|\b429\b/.test(text)) return "rate_limited";
  if (/timeout|timed out|abort/.test(text)) return "timeout";
  if (/failed to fetch|network|connection|load failed/.test(text)) return "network_error";
  if (/no tabs|empty tabs/.test(text)) return "no_tabs";
  if (/presign|signed url/.test(text)) return "presign_rejected";
  if (/storage|upload/.test(text)) return "storage_failed";
  if (/invalid response|invalid json|unexpected response/.test(text)) return "invalid_response";
  if (/youtube/.test(text)) return "youtube_processing_failed";
  if (/editor|import|gte/.test(text)) return "editor_import_failed";
  if (/backend|upstream|server|\b5\d\d\b/.test(text)) return "backend_failed";

  return toAnalyticsCategory(fallback);
}

export function analyticsHttpStatusClass(status: number | undefined | null) {
  if (!status || !Number.isFinite(status)) return undefined;
  return `${Math.floor(status / 100)}xx`;
}
