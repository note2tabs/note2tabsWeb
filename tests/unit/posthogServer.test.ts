import { stablePostHogEventUuid } from "../../lib/posthogServer";

describe("stablePostHogEventUuid", () => {
  it("returns the same valid UUID for the same business event", () => {
    const first = stablePostHogEventUuid("subscription-started:cs_test_123");
    const retry = stablePostHogEventUuid("subscription-started:cs_test_123");

    expect(first).toBe(retry);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("uses a different UUID for a different checkout session", () => {
    expect(stablePostHogEventUuid("subscription-started:cs_test_123")).not.toBe(
      stablePostHogEventUuid("subscription-started:cs_test_456")
    );
  });
});
