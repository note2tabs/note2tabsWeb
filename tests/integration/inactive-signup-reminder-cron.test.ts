import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";
import { assignInactiveSignupReminderVariant } from "../../lib/inactiveSignupReminder";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  sendEmail: vi.fn(),
  createMarker: vi.fn(),
  deleteMarkers: vi.fn(),
  capture: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    verificationToken: { create: mocks.createMarker, deleteMany: mocks.deleteMarkers },
  },
}));

vi.mock("../../lib/email", () => ({ sendTransactionalEmail: mocks.sendEmail }));

vi.mock("../../lib/posthogServer", () => ({
  createPostHogServerClient: () => ({ capture: mocks.capture, flush: mocks.flush }),
  flushPostHogServerClientInBackground: () => undefined,
}));

import handler from "../../pages/api/cron/inactive-signup-reminder";

function userForVariant(target: "holdout" | "6h" | "24h" | "72h") {
  for (let index = 0; index < 1000; index += 1) {
    const id = `user-${index}`;
    if (assignInactiveSignupReminderVariant(id) === target) return id;
  }
  throw new Error(`No fixture found for ${target}`);
}

describe("inactive signup reminder cron experiment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test";
    process.env.INACTIVE_SIGNUP_REMINDER_EXPERIMENT_ENABLED = "true";
    mocks.sendEmail.mockResolvedValue(true);
    mocks.createMarker.mockResolvedValue({});
    mocks.deleteMarkers.mockResolvedValue({ count: 1 });
  });

  it("keeps the control group unemailed", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: userForVariant("holdout"),
        email: "control@example.com",
        name: "Control",
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
    ]);
    const { req, res } = createMocks({ method: "GET", headers: { authorization: "Bearer cron-test" } });
    await handler(req, res);

    expect(JSON.parse(res._getData())).toMatchObject({ heldOut: 1, sent: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "inactive_signup_reminder_assigned",
        properties: expect.objectContaining({ experiment_group: "holdout", timing_variant: "holdout" }),
      })
    );
  });

  it("defaults to a non-sending dry run when the experiment is not enabled", async () => {
    delete process.env.INACTIVE_SIGNUP_REMINDER_EXPERIMENT_ENABLED;
    mocks.queryRaw.mockResolvedValue([
      {
        id: userForVariant("24h"),
        email: "player@example.com",
        name: "Player",
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      },
    ]);
    const { req, res } = createMocks({ method: "GET", headers: { authorization: "Bearer cron-test" } });
    await handler(req, res);

    expect(JSON.parse(res._getData())).toMatchObject({ dryRun: true, wouldSend: 1, sent: 0 });
    expect(mocks.createMarker).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("waits for the assigned delay and records the timing arm when sent", async () => {
    const userId = userForVariant("72h");
    mocks.queryRaw.mockResolvedValue([
      {
        id: userId,
        email: "player@example.com",
        name: "Player",
        createdAt: new Date(Date.now() - 76 * 60 * 60 * 1000),
      },
    ]);
    const { req, res } = createMocks({ method: "GET", headers: { authorization: "Bearer cron-test" } });
    await handler(req, res);

    expect(JSON.parse(res._getData())).toMatchObject({ sent: 1, sentByVariant: { "72h": 1 } });
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "player@example.com",
        html: expect.stringContaining("timing=72h"),
      })
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: userId,
        event: "inactive_signup_reminder_sent",
        properties: expect.objectContaining({ timing_variant: "72h", delay_hours: 72 }),
      })
    );
  });

  it("never sends a reminder after its assigned delivery window", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: userForVariant("6h"),
        email: "late@example.com",
        name: "Late",
        createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
      },
    ]);
    const { req, res } = createMocks({ method: "GET", headers: { authorization: "Bearer cron-test" } });
    await handler(req, res);

    expect(JSON.parse(res._getData())).toMatchObject({ skippedExpiredWindow: 1, sent: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
