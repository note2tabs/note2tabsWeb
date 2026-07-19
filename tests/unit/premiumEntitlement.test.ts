import { describe, expect, it, vi } from "vitest";
import {
  checkoutSessionSafePath,
  confirmPremiumCheckout,
  hasPremiumEntitlement,
  waitForPremiumEntitlement,
} from "../../lib/premiumEntitlement";

describe("premium entitlement refresh", () => {
  it("recognizes paid and staff access", () => {
    expect(hasPremiumEntitlement({ user: { role: "PREMIUM" } })).toBe(true);
    expect(hasPremiumEntitlement({ user: { role: "MODERATOR" } })).toBe(true);
    expect(hasPremiumEntitlement({ user: { role: "FREE" } })).toBe(false);
  });

  it("keeps refreshing through webhook delay and transient failures", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ user: { role: "FREE" } })
      .mockResolvedValueOnce({ user: { role: "PREMIUM" } });
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForPremiumEntitlement(refresh, { attempts: 4, intervalMs: 1, wait })
    ).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("is bounded and cancellable", async () => {
    const refresh = vi.fn().mockResolvedValue({ user: { role: "FREE" } });
    let stopped = false;
    const wait = vi.fn().mockImplementation(async () => {
      stopped = true;
    });

    await expect(
      waitForPremiumEntitlement(refresh, {
        attempts: 5,
        intervalMs: 1,
        wait,
        shouldStop: () => stopped,
      })
    ).resolves.toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("confirms a returned Stripe checkout without exposing it in the URL body", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });

    await expect(confirmPremiumCheckout(" cs_test_123 ", request)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      "/api/stripe/confirm-checkout-session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "cs_test_123" }),
      })
    );
  });

  it("falls back safely when checkout confirmation is unavailable", async () => {
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(confirmPremiumCheckout("cs_test_123", request)).resolves.toBe(false);
    await expect(confirmPremiumCheckout("", request)).resolves.toBe(false);
  });

  it("removes only the sensitive checkout session from return URLs", () => {
    expect(
      checkoutSessionSafePath(
        "https://www.note2tabs.com/?resumeTranscription=1&upgrade=success&session_id=cs_secret#hero"
      )
    ).toBe("/?resumeTranscription=1&upgrade=success#hero");
  });
});
