import { describe, expect, it } from "vitest";
import {
  getSubscriptionValueReminder,
  SUBSCRIPTION_RETENTION_GOALS,
} from "../../lib/subscriptionCancellationRetention";

describe("subscription cancellation retention", () => {
  it("returns users to the product value that originally brought them in", () => {
    expect(getSubscriptionValueReminder("transcribe_songs")).toMatchObject({ href: "/transcribe" });
    expect(getSubscriptionValueReminder("higher_accuracy")).toMatchObject({ href: "/transcribe" });
    expect(getSubscriptionValueReminder("edit_tabs")).toMatchObject({ href: "/gte" });
    expect(getSubscriptionValueReminder("practice")).toMatchObject({ href: "/home" });
    expect(getSubscriptionValueReminder("save_export")).toMatchObject({ href: "/tabs" });
  });

  it("does not manufacture a reminder for skipped or unspecified feedback", () => {
    expect(getSubscriptionValueReminder("skip")).toBeNull();
    expect(getSubscriptionValueReminder("")).toBeNull();
  });

  it("always provides a non-blocking prefer-not-to-say choice", () => {
    expect(SUBSCRIPTION_RETENTION_GOALS).toContainEqual({
      value: "skip",
      label: "Prefer not to say",
    });
  });
});
