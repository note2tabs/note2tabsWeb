import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const { capture, feedbackCreate, flushPostHog, sessionMock } = vi.hoisted(() => ({
  capture: vi.fn(),
  feedbackCreate: vi.fn(),
  flushPostHog: vi.fn(),
  sessionMock: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    feedbackSubmission: {
      create: feedbackCreate,
    },
  },
}));

vi.mock("../../lib/posthogServer", () => ({
  isPostHogConfigured: vi.fn(() => true),
  createPostHogServerClient: vi.fn(() => ({ capture })),
  flushPostHogServerClientInBackground: flushPostHog,
}));

import handler from "../../pages/api/feedback";

function feedbackRequest(
  body: Record<string, unknown>,
  consent: "granted" | "denied" = "granted"
) {
  return createMocks({
    method: "POST",
    headers: {
      cookie: `analytics_consent=${consent}`,
      host: "note2tabs.test",
      "x-forwarded-proto": "https",
    },
    body,
  });
}

describe("feedback persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    feedbackCreate.mockResolvedValue({ id: "feedback_1" });
  });

  it("persists feedback when analytics consent is denied", async () => {
    const { req, res } = feedbackRequest(
      {
        message: "The editor needs a clearer play control.",
        category: "ui",
        pagePath: "/gte/editor-secret?email=person@example.com#play",
      },
      "denied"
    );

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true });
    expect(feedbackCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        message: "The editor needs a clearer play control.",
        category: "ui",
        pagePath: "/gte/[editor_id]",
      },
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("persists before sending a privacy-safe best-effort analytics event", async () => {
    const { req, res } = feedbackRequest({
      message: "Please show a progress estimate while importing.",
      category: "bug",
      pagePath: "/job/private-job-id?token=secret",
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(feedbackCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        message: "Please show a progress estimate while importing.",
        category: "bug",
        pagePath: "/job/[job_id]",
      },
    });
    expect(feedbackCreate.mock.invocationCallOrder[0]).toBeLessThan(
      capture.mock.invocationCallOrder[0]
    );
    const properties = capture.mock.calls[0]?.[0]?.properties;
    expect(properties).toMatchObject({
      category: "bug",
      pagePath: "/job/[job_id]",
    });
    expect(properties).not.toHaveProperty("message");
    expect(flushPostHog).toHaveBeenCalledOnce();
  });

  it("returns an error and does not claim success when storage fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    feedbackCreate.mockRejectedValueOnce(new Error("database unavailable"));
    const { req, res } = feedbackRequest({
      message: "This feedback must not be silently dropped.",
      category: "general",
      pagePath: "/feedback",
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: "Could not submit feedback." });
    expect(capture).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("still succeeds after persistence when optional analytics fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    capture.mockImplementationOnce(() => {
      throw new Error("analytics unavailable");
    });
    const { req, res } = feedbackRequest({
      message: "Keep this message even if analytics is unavailable.",
      category: "feature",
      pagePath: "/feedback",
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true });
    expect(feedbackCreate).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it.each([
    ["blank", "   ", "Feedback message is required."],
    ["too long", "x".repeat(2001), "Feedback must be 2000 characters or less."],
  ])("rejects %s feedback before writing", async (_case, message, expectedError) => {
    const { req, res } = feedbackRequest({ message });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: expectedError });
    expect(feedbackCreate).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
