import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTabShareBlockToken, readTabShareBlockToken } from "../../lib/tabShareEmailPreferences";

describe("tab share email preferences", () => {
  beforeEach(() => vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "a-long-test-secret"));

  it("round-trips an opaque normalized recipient token", () => {
    const token = createTabShareBlockToken(" Player@Example.com ");
    expect(token).toBeTruthy();
    expect(token).not.toContain("Player");
    expect(readTabShareBlockToken(token!)).toBe("player@example.com");
  });

  it("rejects tampered tokens", () => {
    const token = createTabShareBlockToken("player@example.com")!;
    expect(readTabShareBlockToken(`${token.slice(0, -2)}aa`)).toBeNull();
  });
});
