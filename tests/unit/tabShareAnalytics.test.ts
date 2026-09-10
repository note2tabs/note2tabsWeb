import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest } from "next";

const capture = vi.fn();
const flush = vi.fn();

vi.mock("../../lib/posthogServer", () => ({
  createPostHogServerClient: () => ({ capture, flush }),
}));

import { isTabShareEmailDestination } from "../../lib/tabShareAnalytics";
import { trackTabShareEmailSignup } from "../../lib/tabShareAnalyticsServer";

describe("tab share email analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flush.mockResolvedValue(undefined);
  });

  it("recognizes only shared-page email destinations", () => {
    expect(isTabShareEmailDestination("/shared?source=tab_share_email&editor=one")).toBe(true);
    expect(isTabShareEmailDestination("/shared?source=navigation")).toBe(false);
    expect(isTabShareEmailDestination("/home?source=tab_share_email")).toBe(false);
    expect(isTabShareEmailDestination("https://attacker.example/shared?source=tab_share_email")).toBe(false);
  });

  it("handles absent and malformed destinations safely", () => {
    expect(isTabShareEmailDestination(undefined)).toBe(false);
    expect(isTabShareEmailDestination("not a path")).toBe(false);
  });

  it("records an attributed signup without email or editor data", async () => {
    await trackTabShareEmailSignup({
      userId: "user-1",
      method: "email",
      returnTo: "/shared?source=tab_share_email&editor=private-editor-id",
      req: { headers: { cookie: "analytics_anon=anon-1" } } as NextApiRequest,
    });

    expect(capture).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: "user-1",
      event: "tab_share_email_signup_completed",
      properties: expect.objectContaining({
        source: "tab_share_email",
        $anon_distinct_id: "anon-1",
      }),
    }));
    const serialized = JSON.stringify(capture.mock.calls[0]);
    expect(serialized).not.toContain("private-editor-id");
    expect(serialized).not.toContain("@");
    expect(flush).toHaveBeenCalledOnce();
  });

  it("does not track when analytics consent was denied", async () => {
    await trackTabShareEmailSignup({
      userId: "user-1",
      method: "email",
      returnTo: "/shared?source=tab_share_email",
      req: { headers: { cookie: "analytics_consent=denied" } } as NextApiRequest,
    });
    expect(capture).not.toHaveBeenCalled();
  });
});
