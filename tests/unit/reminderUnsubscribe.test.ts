import { afterEach, describe, expect, it } from "vitest";
import {
  createReminderUnsubscribeToken,
  readReminderUnsubscribeToken,
  reminderUnsubscribeIdentifier,
} from "../../lib/reminderUnsubscribe";

describe("reminder unsubscribe tokens", () => {
  afterEach(() => delete process.env.EMAIL_UNSUBSCRIBE_SECRET);

  it("round trips a signed user identifier and rejects tampering", () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret";
    const token = createReminderUnsubscribeToken("user-1");
    expect(token).toBeTruthy();
    expect(readReminderUnsubscribeToken(token!)).toBe("user-1");
    expect(readReminderUnsubscribeToken(`${token}x`)).toBeNull();
    expect(reminderUnsubscribeIdentifier("user-1")).toBe("email:reminders-unsubscribed:user-1");
  });

  it("fails closed when no signing secret exists", () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    delete process.env.CRON_SECRET;
    expect(createReminderUnsubscribeToken("user-1")).toBeNull();
  });
});
