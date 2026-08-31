import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  markers: vi.fn(),
  createMarkers: vi.fn(),
  deleteMarkers: vi.fn(),
  findUser: vi.fn(),
  sendEmail: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    verificationToken: {
      findMany: mocks.markers,
      createMany: mocks.createMarkers,
      deleteMany: mocks.deleteMarkers,
    },
    user: { findUnique: mocks.findUser },
  },
}));

vi.mock("../../lib/email", () => ({ sendTransactionalEmail: mocks.sendEmail }));
vi.mock("../../lib/posthogServer", () => ({
  createPostHogServerClient: () => ({ capture: mocks.capture }),
  flushPostHogServerClientInBackground: () => undefined,
}));

import handler from "../../pages/api/cron/tab-return-reminder";

describe("tab return reminder cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TAB_RETURN_REMINDER_ENABLED;
    delete process.env.TAB_RETURN_REMINDER_ROLLOUT_PERCENT;
    process.env.CRON_SECRET = "cron-test";
    mocks.queryRaw.mockResolvedValue([
      {
        user_id: "user-1",
        canvas_id: "tab-1",
        name: "Autumn fall",
        updated_at: new Date(),
        email: "player@example.com",
        user_name: "Player",
      },
    ]);
    mocks.markers.mockResolvedValue([]);
    mocks.createMarkers.mockResolvedValue({ count: 2 });
    mocks.deleteMarkers.mockResolvedValue({ count: 2 });
    mocks.sendEmail.mockResolvedValue(true);
    mocks.findUser.mockResolvedValue({ lastActiveAt: null });
  });

  it("defaults to a non-mutating dry run", async () => {
    const { req, res } = createMocks({
      method: "GET",
      headers: { authorization: "Bearer cron-test" },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchObject({ dryRun: true, eligible: 1, sent: 0 });
    expect(mocks.createMarkers).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("sends once when explicitly enabled and included in the rollout", async () => {
    process.env.TAB_RETURN_REMINDER_ENABLED = "true";
    process.env.TAB_RETURN_REMINDER_ROLLOUT_PERCENT = "100";
    const { req, res } = createMocks({
      method: "POST",
      headers: { authorization: "Bearer cron-test" },
    });
    await handler(req, res);

    expect(JSON.parse(res._getData())).toMatchObject({ dryRun: false, eligible: 1, sent: 1 });
    expect(mocks.createMarkers).toHaveBeenCalledOnce();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "player@example.com", subject: "Continue working on Autumn fall" })
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tab_return_reminder_sent" })
    );
  });

  it("keeps excluded users as a measurable holdout", async () => {
    process.env.TAB_RETURN_REMINDER_ENABLED = "true";
    process.env.TAB_RETURN_REMINDER_ROLLOUT_PERCENT = "0";
    const { req, res } = createMocks({
      method: "GET",
      headers: { authorization: "Bearer cron-test" },
    });
    await handler(req, res);

    expect(JSON.parse(res._getData())).toMatchObject({ eligible: 1, heldOut: 1, sent: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.createMarkers).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({
          identifier: "reminder:return-to-tab:user-1:tab-1",
          token: expect.stringMatching(/:holdout$/),
        })],
        skipDuplicates: true,
      })
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "tab_return_reminder_assigned",
        properties: expect.objectContaining({ experiment_group: "holdout" }),
      })
    );
  });

  it("rechecks activity immediately before sending", async () => {
    process.env.TAB_RETURN_REMINDER_ENABLED = "true";
    process.env.TAB_RETURN_REMINDER_ROLLOUT_PERCENT = "100";
    mocks.findUser.mockResolvedValue({ lastActiveAt: new Date() });
    const { req, res } = createMocks({ method: "GET", headers: { authorization: "Bearer cron-test" } });
    await handler(req, res);
    expect(JSON.parse(res._getData())).toMatchObject({ sent: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
