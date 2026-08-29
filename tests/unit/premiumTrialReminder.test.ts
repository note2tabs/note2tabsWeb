import { afterEach, describe, expect, it } from "vitest";
import {
  buildPremiumTrialReminderEmail,
  customPremiumTrialReminderEnabled,
} from "../../lib/premiumTrialReminder";

describe("Premium trial reminder", () => {
  afterEach(() => {
    delete process.env.PREMIUM_TRIAL_REMINDER_MODE;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("is disabled unless custom delivery is explicitly selected", () => {
    expect(customPremiumTrialReminderEnabled()).toBe(false);
    process.env.PREMIUM_TRIAL_REMINDER_MODE = "stripe";
    expect(customPremiumTrialReminderEnabled()).toBe(false);
    process.env.PREMIUM_TRIAL_REMINDER_MODE = "custom";
    expect(customPremiumTrialReminderEnabled()).toBe(true);
  });

  it("states the renewal terms and returns the user to latest-tab practice", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.note2tabs.com/";
    const email = buildPremiumTrialReminderEmail({
      name: "Noel Example",
      trialEndsAt: new Date("2026-09-02T00:00:00.000Z"),
      latestEditor: { id: "editor 123", name: "Autumn <Fall>" },
    });

    expect(email.subject).toBe("Your Note2Tabs trial ends September 2, 2026");
    expect(email.text).toContain("renews at $5.99 per month unless you cancel before then");
    expect(email.continueUrl).toBe(
      "https://www.note2tabs.com/gte/editor%20123?mode=practice&source=trial_reminder"
    );
    expect(email.html).toContain("Autumn &lt;Fall&gt;");
    expect(email.html).not.toContain("Autumn <Fall>");
  });
});
