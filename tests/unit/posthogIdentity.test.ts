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

  it("does not identify after an explicit opt-out", async () => {
    const consent = "denied";
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
  });

  it.each([undefined, "granted", "invalid"])(
    "aliases and identifies unless explicitly opted out (%s)",
    async (consent) => {
      await linkIdentityToUser({
        userId: "user-1",
        source: "signup",
        anonId: "anon-1",
        sessionId: "session-1",
        consent,
      });

      expect(alias).toHaveBeenCalledWith({ distinctId: "anon-1", alias: "user-1" });
      expect(identify).toHaveBeenCalledWith({
        distinctId: "user-1",
        properties: { last_identity_source: "signup" },
      });
      expect(flushPostHogServerClientInBackground).toHaveBeenCalledOnce();
    }
  );

  it("copies first-touch attribution onto the account during identity linking", async () => {
    const attribution = encodeURIComponent(
      JSON.stringify({
        first_touch_source: "instagram",
        first_touch_medium: "social",
        first_touch_referring_domain: "l.instagram.com",
        first_touch_landing_path: "/editor",
        first_touch_campaign: "bio",
      })
    );

    await linkIdentityToUser({
      userId: "user-attributed",
      source: "signup",
      req: {
        headers: {
          cookie: `analytics_consent=granted; analytics_anon=anon-attributed; analytics_first_touch=${attribution}`,
        },
      } as any,
    });

    expect(identify).toHaveBeenCalledWith({
      distinctId: "user-attributed",
      properties: expect.objectContaining({
        last_identity_source: "signup",
        first_touch_source: "instagram",
        first_touch_medium: "social",
        traffic_source: "instagram",
        traffic_medium: "social",
        landing_path: "/editor",
      }),
    });
  });
});
