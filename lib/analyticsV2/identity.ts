import type { NextApiRequest, NextApiResponse } from "next";
import {
  createPostHogServerClient,
} from "../posthogServer";
import {
  ANALYTICS_ANON_COOKIE,
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_SESSION_COOKIE,
  getConsentFromCookies,
  parseRequestCookies,
  readAnalyticsOwner, setAnalyticsOwnerCookie, ensureTrackingCookies,
} from "./cookies";
import {
  ANALYTICS_ATTRIBUTION_COOKIE,
  parseAcquisitionAttribution,
} from "../acquisitionAttribution";
import {
  normalizePremiumFunnelId,
  normalizePremiumFunnelReason,
  normalizePremiumFunnelSource,
} from "../premiumFunnel";

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
  funnelId?: string;
  funnelSource?: string;
  funnelReason?: string;
};

export async function linkIdentityToUser(input: LinkIdentityInput) {
  const cookies = input.req ? parseRequestCookies(input.req) : {};
  let anonId = input.anonId || cookies[ANALYTICS_ANON_COOKIE];
  let sessionId = input.sessionId || cookies[ANALYTICS_SESSION_COOKIE];
  const attribution = parseAcquisitionAttribution(cookies[ANALYTICS_ATTRIBUTION_COOKIE]);
  const funnelId = normalizePremiumFunnelId(input.funnelId);
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

  const previousOwner = readAnalyticsOwner(cookies);
  if (previousOwner && previousOwner.anonId === anonId && previousOwner.userId !== input.userId) {
    // Never merge two accounts that happen to share a browser, including when
    // credentials login links identity before React observes the new session.
    if (!input.res) throw new Error("Identity rotation requires a response");
    ({anonId, sessionId} = ensureTrackingCookies(input.res, {}));
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
      ...(attribution || {}),
      ...(attribution
        ? {
            traffic_source: attribution.first_touch_source,
            traffic_medium: attribution.first_touch_medium,
            landing_path: attribution.first_touch_landing_path,
          }
        : {}),
      ...(funnelId
        ? {
            last_premium_funnel_id: funnelId,
            last_premium_funnel_source: normalizePremiumFunnelSource(input.funnelSource),
            last_premium_funnel_reason: normalizePremiumFunnelReason(input.funnelReason),
          }
        : {}),
    },
  });
  // Do not persist a successful browser link marker until delivery is accepted.
  await client.flush();
  if (input.res && anonId) setAnalyticsOwnerCookie(input.res, anonId, input.userId);

  return {
    ok: true,
    userId: input.userId,
    anonId: anonId || null,
    sessionId: sessionId || null,
  };
}
