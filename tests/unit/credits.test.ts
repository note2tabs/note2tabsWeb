import { describe, expect, it, vi, afterEach } from "vitest";
import {
  FREE_MONTHLY_CREDITS,
  buildCreditsSummary,
  getCreditWindow,
} from "../../lib/credits";

describe("credits", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses calendar-month windows for resets", () => {
    const window = getCreditWindow({ now: new Date("2026-03-13T12:34:56.000Z") });

    expect(window.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(window.resetAt.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("restores free credits when a new calendar month begins", () => {
    const februaryWindow = getCreditWindow({ now: new Date("2026-02-20T18:00:00.000Z") });
    const februaryCredits = buildCreditsSummary({
      durations: new Array(FREE_MONTHLY_CREDITS).fill(30),
      resetAt: februaryWindow.resetAt,
      isPremium: false,
    });

    const marchWindow = getCreditWindow({ now: new Date("2026-03-01T00:00:00.000Z") });
    const marchCredits = buildCreditsSummary({
      durations: [],
      resetAt: marchWindow.resetAt,
      isPremium: false,
    });

    expect(februaryCredits.remaining).toBe(0);
    expect(marchCredits.used).toBe(0);
    expect(marchCredits.limit).toBe(FREE_MONTHLY_CREDITS);
    expect(marchCredits.remaining).toBe(FREE_MONTHLY_CREDITS);
  });

  it("keeps premium rollovers on the account anniversary window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00.000Z"));

    const premiumWindow = getCreditWindow({
      now: new Date("2026-03-13T12:00:00.000Z"),
      userCreatedAt: new Date("2026-01-15T08:00:00.000Z"),
    });
    const credits = buildCreditsSummary({
      durations: [],
      resetAt: premiumWindow.resetAt,
      isPremium: true,
      userCreatedAt: new Date("2026-01-15T08:00:00.000Z"),
    });

    expect(premiumWindow.start.toISOString()).toBe("2026-02-15T08:00:00.000Z");
    expect(premiumWindow.resetAt.toISOString()).toBe("2026-03-15T08:00:00.000Z");
    expect(credits.limit).toBe(110);
    expect(credits.remaining).toBe(110);
  });
});
