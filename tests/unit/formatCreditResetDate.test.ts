import { describe, expect, it } from "vitest";
import { formatCreditResetDate } from "../../lib/formatCreditResetDate";

describe("formatCreditResetDate", () => {
  it("formats reset dates consistently across server and browser locales", () => {
    expect(formatCreditResetDate("2026-09-04T00:00:00.000Z")).toBe("Sep 4, 2026");
  });

  it("returns an empty label for missing or invalid values", () => {
    expect(formatCreditResetDate()).toBe("");
    expect(formatCreditResetDate("not-a-date")).toBe("");
  });
});
