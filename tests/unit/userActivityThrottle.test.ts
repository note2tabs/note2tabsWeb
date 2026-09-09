import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldRecordUserActivity } from "../../components/UserActivityTracker";

describe("user activity client throttle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shares a fifteen-minute claim across tabs without changing activity precision", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
    const start = Date.parse("2026-09-09T10:00:00.000Z");
    expect(shouldRecordUserActivity("user_1", start)).toBe(true);
    expect(shouldRecordUserActivity("user_1", start + 14 * 60_000)).toBe(false);
    expect(shouldRecordUserActivity("user_1", start + 15 * 60_000)).toBe(true);
    expect(shouldRecordUserActivity("user_2", start + 1)).toBe(true);
  });
});
