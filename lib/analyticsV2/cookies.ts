import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes, randomUUID } from "crypto";

export const ANALYTICS_CONSENT_COOKIE = "analytics_consent";
export const ANALYTICS_SESSION_COOKIE = "analytics_session";
export const ANALYTICS_ANON_COOKIE = "analytics_anon";

export type ConsentCookieState = "granted" | "denied";

type CookieOptions = {
  maxAgeSec?: number;
  path?: string;
  sameSite?: "Lax" | "Strict" | "None";
  httpOnly?: boolean;
  secure?: boolean;
};

function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (typeof options.maxAgeSec === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSec))}`);
    const expires = new Date(Date.now() + Math.max(0, options.maxAgeSec) * 1000);
    parts.push(`Expires=${expires.toUTCString()}`);
  }
  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure ?? process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return;
    result[key] = decodeURIComponent(rest.join("="));
  });
  return result;
}

export function parseRequestCookies(req: NextApiRequest): Record<string, string> {
  return parseCookieHeader(req.headers.cookie);
}

export function appendSetCookie(res: NextApiResponse, cookieValue: string) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current, cookieValue]);
    return;
  }
  res.setHeader("Set-Cookie", [current.toString(), cookieValue]);
}

export function generateId() {
  try {
    return randomUUID();
  } catch {
    return randomBytes(16).toString("hex");
  }
}

export function getConsentFromCookies(cookies: Record<string, string>): ConsentCookieState {
  return cookies[ANALYTICS_CONSENT_COOKIE] === "denied" ? "denied" : "granted";
}

export function setConsentCookie(res: NextApiResponse, value: ConsentCookieState) {
  appendSetCookie(
    res,
    serializeCookie(ANALYTICS_CONSENT_COOKIE, value, {
      maxAgeSec: 365 * 24 * 60 * 60,
      path: "/",
      sameSite: "Lax",
    })
  );
}

export function clearAnalyticsIdentifierCookies(res: NextApiResponse) {
  appendSetCookie(
    res,
    serializeCookie(ANALYTICS_SESSION_COOKIE, "", {
      maxAgeSec: 0,
      path: "/",
      sameSite: "Lax",
    })
  );
  appendSetCookie(
    res,
    serializeCookie(ANALYTICS_ANON_COOKIE, "", {
      maxAgeSec: 0,
      path: "/",
      sameSite: "Lax",
    })
  );
}

export type TrackingCookies = {
  sessionId: string;
  anonId: string;
};

export function ensureTrackingCookies(
  res: NextApiResponse,
  cookies: Record<string, string>
): TrackingCookies {
  let sessionId = cookies[ANALYTICS_SESSION_COOKIE];
  let anonId = cookies[ANALYTICS_ANON_COOKIE];

  if (!sessionId) {
    sessionId = generateId();
    appendSetCookie(
      res,
      serializeCookie(ANALYTICS_SESSION_COOKIE, sessionId, {
        maxAgeSec: 24 * 60 * 60,
        path: "/",
        sameSite: "Lax",
      })
    );
  }

  if (!anonId) {
    anonId = generateId();
    appendSetCookie(
      res,
      serializeCookie(ANALYTICS_ANON_COOKIE, anonId, {
        maxAgeSec: 90 * 24 * 60 * 60,
        path: "/",
        sameSite: "Lax",
      })
    );
  }

  return { sessionId, anonId };
}
