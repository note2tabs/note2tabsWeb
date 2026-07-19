import type { CaptureResult } from "posthog-js";

type AnalyticsProperties = Record<string, unknown>;

const ANALYTICS_BASE_URL = "https://analytics.invalid";
const MAX_CATEGORY_LENGTH = 64;
const MAX_UTM_LENGTH = 100;

const BLOCKED_PROPERTY_KEYS = new Set([
  "email",
  "email_address",
  "full_name",
  "name",
  "user_email",
  "user_name",
  "filename",
  "file_name",
  "yt_url",
  "youtube_url",
  "video_url",
  "media_url",
]);

const RAW_ERROR_PROPERTY_KEYS = new Set([
  "error",
  "error_message",
  "backend_error",
  "backend_message",
  "exception_message",
  "exception_stack_trace",
  "exception_stack_trace_raw",
  "stack",
  "stack_trace",
]);

const URL_PROPERTY_KEYS = new Set([
  "current_url",
  "initial_current_url",
  "session_entry_url",
  "external_click_url",
  "referrer",
  "referer",
  "href",
  "attr_href",
  "request_url",
  "url_full",
  "next",
]);

const PATH_PROPERTY_KEYS = new Set(["path", "pathname", "page_path"]);

function normalizePropertyKey(key: string) {
  return key
    .replace(/^\$+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/__+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase();
}

function stripQueryAndHash(value: string) {
  return value.split(/[?#]/, 1)[0] || "/";
}

function templatePrivateRoute(pathname: string) {
  const patterns: Array<[RegExp, string]> = [
    [/^\/reset-password\/[^/]+/i, "/reset-password/[token]"],
    [/^\/gte\/[^/]+/i, "/gte/[editor_id]"],
    [/^\/job\/[^/]+/i, "/job/[job_id]"],
    [/^\/tabs\/[^/]+/i, "/tabs/[id]"],
  ];

  for (const [pattern, replacement] of patterns) {
    if (pattern.test(pathname)) return pathname.replace(pattern, replacement);
  }
  return pathname;
}

export function sanitizeAnalyticsPathname(value: string | undefined | null) {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed) return "/";

  let pathname = stripQueryAndHash(trimmed);
  try {
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
      pathname = new URL(trimmed, ANALYTICS_BASE_URL).pathname || "/";
    }
  } catch {
    // The query/hash-stripped fallback is still safe to use.
  }

  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return templatePrivateRoute(pathname);
}

export function sanitizeAnalyticsUrl(value: string | undefined | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^(?:mailto|tel|sms|javascript|data):/i.test(trimmed)) {
    return "[redacted]";
  }

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      return `${parsed.origin}${sanitizeAnalyticsPathname(parsed.pathname)}`;
    }
    if (trimmed.startsWith("//")) {
      const parsed = new URL(trimmed, ANALYTICS_BASE_URL);
      return `//${parsed.host}${sanitizeAnalyticsPathname(parsed.pathname)}`;
    }
  } catch {
    // The path-only fallback below removes query strings and fragments.
  }

  return sanitizeAnalyticsPathname(trimmed);
}

export function sanitizeAnalyticsReferrer(value: string | undefined | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).origin;
    if (trimmed.startsWith("//")) {
      const parsed = new URL(trimmed, ANALYTICS_BASE_URL);
      return `//${parsed.host}`;
    }
  } catch {
    // Fall through to the URL sanitizer for malformed or relative values.
  }

  return sanitizeAnalyticsUrl(trimmed);
}

export function toAnalyticsCategory(value: unknown, fallback = "unknown") {
  const raw = typeof value === "string" ? value : String(value ?? "");
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_CATEGORY_LENGTH);
  return normalized || fallback;
}

export function categorizeAnalyticsDestination(value: string | undefined | null) {
  const path = sanitizeAnalyticsPathname(value);
  if (path === "/") return "home";
  if (/^\/(?:transcribe|transcriber)(?:\/|$)/.test(path)) return "transcriber";
  if (/^\/pricing(?:\/|$)/.test(path)) return "pricing";
  if (/^\/settings(?:\/|$)/.test(path)) return "settings";
  if (/^\/gte(?:\/|$)/.test(path)) return "editor";
  if (/^\/(?:tabs|history|job)(?:\/|$)/.test(path)) return "library";
  return "other";
}

function sanitizeUtmValue(value: unknown) {
  if (typeof value !== "string") return value;
  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value)) return "[redacted]";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9 ._~-]/g, "")
    .slice(0, MAX_UTM_LENGTH);
}

function sanitizeValue(value: unknown, key: string, depth: number): unknown {
  if (depth > 8) return undefined;
  const normalizedKey = normalizePropertyKey(key);

  if (typeof value === "string") {
    if (normalizedKey.includes("referrer") || normalizedKey.includes("referer")) {
      return sanitizeAnalyticsReferrer(value);
    }
    if (URL_PROPERTY_KEYS.has(normalizedKey)) return sanitizeAnalyticsUrl(value);
    if (PATH_PROPERTY_KEYS.has(normalizedKey)) return sanitizeAnalyticsPathname(value);
    if (normalizedKey.startsWith("utm_")) return sanitizeUtmValue(value);
    if (
      /(?:^|_)(?:code|category|reason|status|step|mode|method|source|target|type|plan)$/.test(
        normalizedKey
      )
    ) {
      return toAnalyticsCategory(value);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item, key, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    return sanitizeAnalyticsProperties(value as AnalyticsProperties, depth + 1);
  }

  return value;
}

export function sanitizeAnalyticsProperties(
  properties: AnalyticsProperties | undefined | null,
  depth = 0
): AnalyticsProperties {
  if (!properties || depth > 8) return {};

  const sanitized: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    const normalizedKey = normalizePropertyKey(key);
    if (BLOCKED_PROPERTY_KEYS.has(normalizedKey)) continue;
    if (RAW_ERROR_PROPERTY_KEYS.has(normalizedKey)) continue;

    const nextValue = sanitizeValue(value, key, depth);
    if (nextValue !== undefined) sanitized[key] = nextValue;
  }
  return sanitized;
}

export function sanitizePostHogCapture(result: CaptureResult | null): CaptureResult | null {
  if (!result || result.event === "$exception") return null;
  return {
    ...result,
    properties: sanitizeAnalyticsProperties(result.properties),
    ...(result.$set ? { $set: sanitizeAnalyticsProperties(result.$set) } : {}),
    ...(result.$set_once
      ? { $set_once: sanitizeAnalyticsProperties(result.$set_once) }
      : {}),
  };
}
