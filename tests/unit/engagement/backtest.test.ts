import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
describe("historical rules replay", () => {
  it("cannot use a later return or paid outcome to qualify the early snapshot", () => {
    const dir = mkdtempSync(join(tmpdir(), "engagement-test-"));
    try {
      const input = join(dir, "history.json"), output = join(dir, "report.json");
      writeFileSync(input, JSON.stringify([{ person: "synthetic", events: [
        ["2026-09-01 00:00:00", "signup_completed", "1", "", "", "", "", "", ""],
        ["2026-09-03 00:00:00", "gte_editor_action", "2", "", "p", "s", "", "", "add_note"],
        ["2026-09-04 00:00:00", "subscription_started", "3", "", "", "", "", "", ""],
      ] }]));
      execFileSync(process.execPath, ["scripts/engagement/backtest.mjs", input, output], { stdio: "pipe" });
      const report = JSON.parse(readFileSync(output, "utf8"));
      expect(report.earlyValueReturn).toMatchObject({ people: 1, positive: 1, caught: 0, flagged: 0 });
      expect(report.premiumBeforeFirstTrackedSubscription.caught).toBe(0);
      expect(report).not.toHaveProperty("person");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
