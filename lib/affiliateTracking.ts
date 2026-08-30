import { createPostHogServerClient } from "./posthogServer";

export type AffiliateEvent =
  | "affiliate_link_clicked"
  | "affiliate_signup_completed"
  | "affiliate_checkout_started"
  | "affiliate_trial_started"
  | "affiliate_payment_succeeded"
  | "affiliate_subscription_renewed"
  | "affiliate_payment_refunded";

export async function trackAffiliateEvent(input: {
  distinctId: string;
  event: AffiliateEvent;
  insertId: string;
  properties: Record<string, unknown>;
}) {
  const client = createPostHogServerClient();
  if (!client) return;
  client.capture({
    distinctId: input.distinctId,
    event: input.event,
    properties: {
      ...input.properties,
      event_source: "note2tabs_server",
      $insert_id: input.insertId,
    },
  });
  try {
    await client.flush();
  } catch {
    // Affiliate financial records live in Postgres. Analytics delivery must
    // never block a visitor, signup, checkout, or Stripe webhook.
  }
}
