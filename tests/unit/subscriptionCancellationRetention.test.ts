import { describe, expect, it } from "vitest";
import {
  getSubscriptionSaveOption,
  SUBSCRIPTION_CANCELLATION_REASONS,
} from "../../lib/subscriptionCancellationRetention";

describe("subscription cancellation retention", () => {
  it("offers support or product recovery for actionable cancellation reasons", () => {
    expect(getSubscriptionSaveOption("quality")).toMatchObject({ href: "/contact" });
    expect(getSubscriptionSaveOption("technical")).toMatchObject({ href: "/contact" });
    expect(getSubscriptionSaveOption("not_using")).toMatchObject({ href: "/home" });
    expect(getSubscriptionSaveOption("price")).toMatchObject({ href: "/tabs" });
  });

  it("does not manufacture an offer for skipped or unspecified feedback", () => {
    expect(getSubscriptionSaveOption("skip")).toBeNull();
    expect(getSubscriptionSaveOption("")).toBeNull();
  });

  it("always provides a non-blocking prefer-not-to-say choice", () => {
    expect(SUBSCRIPTION_CANCELLATION_REASONS).toContainEqual({
      value: "skip",
      label: "Prefer not to say",
    });
  });
});
