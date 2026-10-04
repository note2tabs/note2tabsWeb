import type { NextApiRequest } from "next";
import { createPostHogServerClient } from "./posthogServer";
import {
  ANALYTICS_ANON_COOKIE,
  getConsentFromCookies,
  parseRequestCookies,
} from "./analyticsV2/cookies";
import { isTabShareEmailDestination, TAB_SHARE_EMAIL_SOURCE } from "./tabShareAnalytics";

export async function trackTabShareEmailSignup(input: {
  userId: string;
  method: "email";
  returnTo: string;
  req: NextApiRequest;
}) {
  if (!isTabShareEmailDestination(input.returnTo)) return;
  const cookies = parseRequestCookies(input.req);
  if (getConsentFromCookies(cookies) === "denied") return;
  const client = createPostHogServerClient();
  if (!client) return;
  client.capture({
    distinctId: input.userId,
    event: "tab_share_email_signup_completed",
    properties: {
      method: input.method,
      landing: "signup",
      recipient_status: "new",
      source: TAB_SHARE_EMAIL_SOURCE,
      $anon_distinct_id: cookies[ANALYTICS_ANON_COOKIE],
      $insert_id: `tab-share-email-signup:${input.userId}`,
      event_source: "note2tabs_server",
    },
  });
  try {
    await client.flush();
  } catch {
    // Attribution must never interrupt account creation.
  }
}
