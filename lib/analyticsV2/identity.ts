import type { NextApiRequest, NextApiResponse } from "next";
import {
  createPostHogServerClient,
  flushPostHogServerClientInBackground,
} from "../posthogServer";
import {
  ANALYTICS_ANON_COOKIE,
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_SESSION_COOKIE,
  getConsentFromCookies,
  parseRequestCookies,
} from "./cookies";

type IdentitySource = "signup" | "login";

type LinkIdentityInput = {
  userId: string;
  source: IdentitySource;
  req?: NextApiRequest;
  res?: NextApiResponse;
  rawFingerprint?: string;
  anonId?: string;
  sessionId?: string;
  consent?: string;
};

export async function linkIdentityToUser(input: LinkIdentityInput) {
  const cookies = input.req ? parseRequestCookies(input.req) : {};
  const anonId = input.anonId || cookies[ANALYTICS_ANON_COOKIE];
  const sessionId = input.sessionId || cookies[ANALYTICS_SESSION_COOKIE];
  const consentCookies = input.consent
    ? { ...cookies, [ANALYTICS_CONSENT_COOKIE]: input.consent }
    : cookies;

  if (getConsentFromCookies(consentCookies) !== "granted") {
    return {
      ok: true,
      reason: "consent_denied",
      userId: input.userId,
      anonId: anonId || null,
      sessionId: sessionId || null,
    };
  }

  const client = createPostHogServerClient();

  if (!client) {
    return {
      ok: true,
      reason: "posthog_not_configured",
      userId: input.userId,
      anonId: anonId || null,
      sessionId: sessionId || null,
    };
  }

  if (anonId && anonId !== input.userId) {
    client.alias({
      distinctId: anonId,
      alias: input.userId,
    });
  }
  client.identify({
    distinctId: input.userId,
    properties: {
      last_identity_source: input.source,
    },
  });
  flushPostHogServerClientInBackground(client);

  return {
    ok: true,
    userId: input.userId,
    anonId: anonId || null,
    sessionId: sessionId || null,
  };
}
