import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const mocks = vi.hoisted(() => ({ findUser: vi.fn(), capture: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock("../../lib/posthogServer", () => ({
  createPostHogServerClient: () => ({ capture: mocks.capture }),
  flushPostHogServerClientInBackground: () => undefined,
}));

import handler from "../../pages/api/email/ses-events";

describe("SES reminder lifecycle events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SES_EVENT_WEBHOOK_SECRET = "secret";
    mocks.findUser.mockResolvedValue({ id: "user-1" });
  });

  it("records a tagged reminder bounce in PostHog", async () => {
    const notification = {
      notificationType: "Bounce",
      mail: { messageId: "message-1", tags: { email_category: ["tab_return_reminder"] } },
      bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "player@example.com" }] },
    };
    const { req, res } = createMocks({
      method: "POST", query: { secret: "secret" },
      body: { Type: "Notification", Message: JSON.stringify(notification) },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: "user-1", event: "reminder_email_bounced",
      properties: expect.objectContaining({ email_category: "tab_return_reminder", bounce_type: "Permanent" }),
    }));
  });

  it("records configuration-set events that use eventType", async () => {
    const notification = {
      eventType: "Delivery",
      mail: {
        messageId: "message-2",
        destination: ["player@example.com"],
        tags: { email_category: ["inactive_signup_reminder"] },
      },
    };
    const { req, res } = createMocks({
      method: "POST", query: { secret: "secret" },
      body: { Type: "Notification", Message: JSON.stringify(notification) },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: "user-1", event: "reminder_email_delivered",
      properties: expect.objectContaining({ email_category: "inactive_signup_reminder" }),
    }));
  });

  it("rejects unsigned webhook traffic", async () => {
    const { req, res } = createMocks({ method: "POST", query: { secret: "wrong" }, body: {} });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
