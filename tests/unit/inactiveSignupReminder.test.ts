import { afterEach, describe, expect, it } from "vitest";
import {
  INACTIVE_SIGNUP_REMINDER_DELAYS,
  assignInactiveSignupReminderVariant,
  buildInactiveSignupExperimentToken,
  buildInactiveSignupHoldoutIdentifier,
  buildInactiveSignupReminderEmail,
} from "../../lib/inactiveSignupReminder";

describe("inactive signup reminder experiment", () => {
  afterEach(() => delete process.env.NEXT_PUBLIC_APP_URL);

  it("assigns each user to one stable timing arm", () => {
    const variant = assignInactiveSignupReminderVariant("user-123");
    expect(["holdout", "6h", "24h", "72h"]).toContain(variant);
    expect(assignInactiveSignupReminderVariant("user-123")).toBe(variant);
    expect(INACTIVE_SIGNUP_REMINDER_DELAYS[variant]).toBeDefined();
    expect(buildInactiveSignupHoldoutIdentifier("user-123")).toBe(
      "experiment:inactive-transcriber-holdout:user-123"
    );
    expect(buildInactiveSignupExperimentToken("user-123", variant)).toBe(
      buildInactiveSignupExperimentToken("user-123", variant)
    );
  });

  it("adds attributable source and timing to the call to action", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.note2tabs.com/";
    const email = buildInactiveSignupReminderEmail({ name: "Player", variant: "72h" });
    expect(email.transcriberUrl).toBe(
      "https://www.note2tabs.com/transcribe?source=inactive_signup_reminder&timing=72h"
    );
    expect(email.html).toContain(email.transcriberUrl);
    expect(email.text).toContain(email.transcriberUrl);
  });
});
