import { ANALYTICS_EVENTS, sendEvent } from "./analytics";
import { syncPostHogSessionRecording } from "./posthogClient";

const ACTIVE_CHECKOUT_KEY = "note2tabs:active-checkout";
const CANCELLED_CHECKOUT_KEY = "note2tabs:cancelled-checkout";

export type ActiveCheckoutAttempt = {
  checkoutSessionId?: string;
  checkoutAttemptId?: string;
  funnelId?: string;
  plan?: string;
  billingInterval?: string;
  checkoutCurrency?: string;
  source?: string;
  reason?: string;
  startedAt: number;
};

export function rememberCheckoutAttempt(attempt: Omit<ActiveCheckoutAttempt, "startedAt">) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ACTIVE_CHECKOUT_KEY, JSON.stringify({
      ...attempt,
      startedAt: Date.now(),
    }));
  } catch {
    // Storage restrictions must never prevent checkout.
  }
  // Explicitly request recording before leaving Note2Tabs. Stripe's hosted
  // checkout itself cannot be recorded, but the lead-in and return can be.
  void syncPostHogSessionRecording(window.location.pathname + window.location.search);
}

export function readActiveCheckoutAttempt(): ActiveCheckoutAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_CHECKOUT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ActiveCheckoutAttempt;
    return value && typeof value.startedAt === "number" ? value : null;
  } catch {
    return null;
  }
}

export function trackCheckoutCancellation(funnelIdFromUrl?: string) {
  if (typeof window === "undefined") return null;
  const attempt = readActiveCheckoutAttempt();
  const dedupeId = attempt?.checkoutSessionId || attempt?.checkoutAttemptId || funnelIdFromUrl;
  if (!dedupeId) return null;
  try {
    if (window.sessionStorage.getItem(CANCELLED_CHECKOUT_KEY) === dedupeId) return null;
    window.sessionStorage.setItem(CANCELLED_CHECKOUT_KEY, dedupeId);
  } catch {
    // PostHog also receives a stable insert ID for server-side deduplication.
  }
  sendEvent(ANALYTICS_EVENTS.checkoutCancelled, {
    checkout_session_id: attempt?.checkoutSessionId,
    checkout_attempt_id: attempt?.checkoutAttemptId,
    funnel_id: attempt?.funnelId || funnelIdFromUrl,
    plan: attempt?.plan,
    billing_interval: attempt?.billingInterval,
    checkout_currency: attempt?.checkoutCurrency,
    source: attempt?.source,
    reason: attempt?.reason,
    elapsed_seconds: attempt ? Math.max(0, Math.round((Date.now() - attempt.startedAt) / 1000)) : undefined,
    event_source: "stripe_cancel_return",
    $insert_id: `checkout-cancelled:${dedupeId}`,
  });
  return { attempt, dedupeId, funnelId: attempt?.funnelId || funnelIdFromUrl };
}
