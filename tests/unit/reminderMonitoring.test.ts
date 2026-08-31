import { describe, expect, it, vi } from "vitest";
import { captureReminderFailure, captureReminderRun } from "../../lib/reminderMonitoring";

describe("reminder monitoring", () => {
  it("treats a zero-send run as healthy", () => {
    const capture = vi.fn();
    captureReminderRun({ capture } as never, {
      scheduler: "tab_return", startedAt: Date.now(), scanned: 0, batchSize: 100,
      eligible: 0, sent: 0, failed: 0, dryRun: false,
    });
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({
      event: "reminder_scheduler_run_completed",
      properties: expect.objectContaining({ status: "healthy", sent: 0, backlog_suspected: false }),
    }));
  });

  it("emits queue pressure and scheduler failures separately", () => {
    const capture = vi.fn();
    captureReminderRun({ capture } as never, {
      scheduler: "inactive_signup", startedAt: Date.now(), scanned: 200, batchSize: 200,
      eligible: 200, sent: 10, failed: 0, dryRun: false,
    });
    captureReminderFailure({ capture } as never, "inactive_signup", Date.now(), new Error("boom"));
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ event: "reminder_scheduler_backlog_detected" }));
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ event: "reminder_scheduler_failed" }));
  });
});
