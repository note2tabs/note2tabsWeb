import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevisionedAutosaveQueue } from "../../lib/gteAutosaveQueue";

describe("RevisionedAutosaveQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid edits into the latest revision", async () => {
    const save = vi.fn(async (payload: { value: number }) => payload.value);
    const queue = new RevisionedAutosaveQueue({ save, debounceMs: 500 });

    queue.enqueue({ value: 1 });
    queue.enqueue({ value: 2 });
    queue.enqueue({ value: 3 });

    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      { value: 3 },
      expect.objectContaining({ revision: 3, reason: "debounce" })
    );
    expect(queue.getState()).toMatchObject({
      revision: 3,
      savedRevision: 3,
      pending: false,
    });
  });

  it("serializes saves and follows an in-flight revision with only the newest payload", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const save = vi
      .fn<(payload: { value: number }) => Promise<void>>()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValue(undefined);
    const queue = new RevisionedAutosaveQueue({ save, debounceMs: 10 });

    queue.enqueue({ value: 1 });
    await vi.advanceTimersByTimeAsync(10);
    queue.enqueue({ value: 2 });
    queue.enqueue({ value: 3 });
    expect(save).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toEqual({ value: 3 });
    expect(queue.getState().pending).toBe(false);
  });

  it("waits while offline and resumes immediately on the online signal", async () => {
    let online = false;
    const save = vi.fn(async () => undefined);
    const queue = new RevisionedAutosaveQueue({
      save,
      debounceMs: 20,
      isOnline: () => online,
    });

    queue.enqueue({ value: 1 });
    await vi.advanceTimersByTimeAsync(20);
    expect(save).not.toHaveBeenCalled();
    expect(queue.getState()).toMatchObject({
      pending: true,
      waitingForConnection: true,
    });

    online = true;
    queue.notifyOnline();
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.getState().pending).toBe(false);
  });

  it("uses bounded backoff instead of a tight failure loop", async () => {
    const save = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(undefined);
    const queue = new RevisionedAutosaveQueue({
      save,
      debounceMs: 10,
      retryDelaysMs: [1_000, 5_000],
    });

    queue.enqueue({ value: 1 });
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.getState().pending).toBe(false);
  });

  it("suppresses stale completion callbacks after disposal", async () => {
    let release: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const onSaved = vi.fn();
    const queue = new RevisionedAutosaveQueue({ save, onSaved, debounceMs: 1 });

    queue.enqueue({ value: 1 });
    await vi.advanceTimersByTimeAsync(1);
    queue.dispose();
    release?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
