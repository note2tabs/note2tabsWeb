import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), capture: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { verificationToken: { upsert: mocks.upsert } } }));
vi.mock("../../lib/posthogServer", () => ({
  createPostHogServerClient: () => ({ capture: mocks.capture }),
  flushPostHogServerClientInBackground: () => undefined,
}));

import { createReminderUnsubscribeToken } from "../../lib/reminderUnsubscribe";
import handler from "../../pages/api/email/unsubscribe-reminders";

describe("reminder email unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret";
    mocks.upsert.mockResolvedValue({});
  });

  it("persists suppression and tracks a valid confirmation", async () => {
    const token = createReminderUnsubscribeToken("user-1");
    const { req, res } = createMocks({ method: "POST", body: { token } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ identifier: "email:reminders-unsubscribed:user-1" }),
    }));
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: "user-1", event: "reminder_email_unsubscribed",
    }));
  });

  it("rejects tampered tokens without writing suppression", async () => {
    const { req, res } = createMocks({ method: "POST", body: { token: "tampered" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
