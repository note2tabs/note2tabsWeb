import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEventMock, syncRecordingMock } = vi.hoisted(() => ({
  sendEventMock: vi.fn(),
  syncRecordingMock: vi.fn(),
}));

vi.mock("../../lib/analytics", () => ({
  ANALYTICS_EVENTS: { checkoutCancelled: "checkout_cancelled" },
  sendEvent: sendEventMock,
}));

vi.mock("../../lib/posthogClient", () => ({
  syncPostHogSessionRecording: syncRecordingMock,
}));

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

describe("checkout tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      location: { pathname: "/pricing", search: "" },
      sessionStorage: storage(),
    });
  });

  it("remembers the attempt and emits one correlated cancellation", async () => {
    const { rememberCheckoutAttempt, trackCheckoutCancellation } = await import("../../lib/checkoutTracking");
    rememberCheckoutAttempt({
      checkoutSessionId: "cs_123",
      checkoutAttemptId: "attempt_123",
      funnelId: "funnel_123",
      plan: "premium_monthly",
      billingInterval: "monthly",
      source: "pricing_page",
      reason: "plan_comparison",
    });

    trackCheckoutCancellation("fallback_funnel");
    trackCheckoutCancellation("fallback_funnel");

    expect(syncRecordingMock).toHaveBeenCalledWith("/pricing");
    expect(sendEventMock).toHaveBeenCalledTimes(1);
    expect(sendEventMock).toHaveBeenCalledWith("checkout_cancelled", expect.objectContaining({
      checkout_session_id: "cs_123",
      checkout_attempt_id: "attempt_123",
      funnel_id: "funnel_123",
      plan: "premium_monthly",
      event_source: "stripe_cancel_return",
      $insert_id: "checkout-cancelled:cs_123",
    }));
  });
});
