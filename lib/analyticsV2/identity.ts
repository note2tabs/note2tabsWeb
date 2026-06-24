import type { NextApiRequest, NextApiResponse } from "next";
import { createPostHogServerClient } from "../posthogServer";
import {
  ANALYTICS_ANON_COOKIE,
  ANALYTICS_SESSION_COOKIE,
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
};

export async function linkIdentityToUser(input: LinkIdentityInput) {
  const cookies = input.req ? parseRequestCookies(input.req) : {};
  const anonId = input.anonId || cookies[ANALYTICS_ANON_COOKIE];
  const sessionId = input.sessionId || cookies[ANALYTICS_SESSION_COOKIE];
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

  try {
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
  } finally {
    await client.shutdown();
  }

  return {
    ok: true,
    userId: input.userId,
    anonId: anonId || null,
    sessionId: sessionId || null,
  };
}

