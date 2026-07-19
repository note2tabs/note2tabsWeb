import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  alias,
  identify,
  createPostHogServerClient,
  flushPostHogServerClientInBackground,
} = vi.hoisted(() => {
  const alias = vi.fn();
  const identify = vi.fn();
  return {
    alias,
    identify,
    createPostHogServerClient: vi.fn(() => ({ alias, identify })),
    flushPostHogServerClientInBackground: vi.fn(),
  };
});

vi.mock("../../lib/posthogServer", () => ({
  createPostHogServerClient,
  flushPostHogServerClientInBackground,
}));

import { linkIdentityToUser } from "../../lib/analyticsV2/identity";

describe("server PostHog identity consent", () => {
  beforeEach(() => {
    alias.mockClear();
    identify.mockClear();
    createPostHogServerClient.mockClear();
    flushPostHogServerClientInBackground.mockClear();
  });

  it.each([undefined, "denied", "invalid"])(
    "does not identify without granted consent (%s)",
    async (consent) => {
      const result = await linkIdentityToUser({
        userId: "user-1",
        source: "login",
        anonId: "anon-1",
        consent,
      });

      expect(result).toMatchObject({ ok: true, reason: "consent_denied" });
      expect(createPostHogServerClient).not.toHaveBeenCalled();
      expect(alias).not.toHaveBeenCalled();
      expect(identify).not.toHaveBeenCalled();
      expect(flushPostHogServerClientInBackground).not.toHaveBeenCalled();
    }
  );

  it("aliases and identifies only after explicit consent", async () => {
    await linkIdentityToUser({
      userId: "user-1",
      source: "signup",
      anonId: "anon-1",
      sessionId: "session-1",
      consent: "granted",
    });

    expect(alias).toHaveBeenCalledWith({ distinctId: "anon-1", alias: "user-1" });
    expect(identify).toHaveBeenCalledWith({
      distinctId: "user-1",
      properties: { last_identity_source: "signup" },
    });
    expect(flushPostHogServerClientInBackground).toHaveBeenCalledOnce();
  });
});
