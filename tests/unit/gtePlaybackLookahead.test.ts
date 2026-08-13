import { describe, expect, it, vi } from "vitest";
import { createPlaybackLookaheadScheduler } from "../../lib/gtePlaybackLookahead";

describe("createPlaybackLookaheadScheduler", () => {
  it("schedules only the rolling horizon and never schedules an event twice", () => {
    const schedule = vi.fn();
    const scheduleAhead = createPlaybackLookaheadScheduler(
      [{ start: 9 }, { start: 1 }, { start: 4 }, { start: 4.5 }],
      schedule,
      4
    );

    scheduleAhead(0);
    expect(schedule.mock.calls.map(([event]) => event.start)).toEqual([1, 4]);

    scheduleAhead(1);
    expect(schedule.mock.calls.map(([event]) => event.start)).toEqual([1, 4, 4.5]);

    scheduleAhead(6);
    scheduleAhead(6);
    expect(schedule.mock.calls.map(([event]) => event.start)).toEqual([1, 4, 4.5, 9]);
  });
});
