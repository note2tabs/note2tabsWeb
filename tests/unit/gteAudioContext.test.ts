import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIO_CONTEXT_START_TIMEOUT_MS, resumePlaybackAudioContext } from "../../lib/gteAudioContext";
import { getErrorBreadcrumbs, setErrorBreadcrumbsEnabled } from "../../lib/errorBreadcrumbs";
const context = (resume: () => Promise<void>, state = "suspended") => ({ resume, state }) as unknown as AudioContext;
afterEach(() => { vi.useRealTimers(); setErrorBreadcrumbsEnabled(false); });
describe("audio activation recovery", () => {
  it("resumes synchronously so the user gesture is retained and clears its timer", async () => {
    vi.useFakeTimers();
    const resume = vi.fn().mockResolvedValue(undefined);
    const pending = resumePlaybackAudioContext(context(resume, "running"));
    expect(resume).toHaveBeenCalledOnce();
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("releases playback after a never-settling browser resume and permits a fresh attempt", async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const pending = resumePlaybackAudioContext(context(() => new Promise<void>(r => {resolve = r;})));
    const rejection = expect(pending).rejects.toMatchObject({name: "TimeoutError"});
    await vi.advanceTimersByTimeAsync(AUDIO_CONTEXT_START_TIMEOUT_MS);
    await rejection;
    await resumePlaybackAudioContext(context(() => Promise.resolve(), "running"));
    resolve();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["suspended", "interrupted", "closed"])("rejects a resolved resume when audio is still %s", async state => {
    await expect(resumePlaybackAudioContext(context(() => Promise.resolve(), state))).rejects.toThrow("Tap Play again");
  });
  it("records activation state and timeout only when diagnostic tracking is enabled", async () => {
    vi.useFakeTimers();
    setErrorBreadcrumbsEnabled(true);
    const pending = resumePlaybackAudioContext(context(() => new Promise(() => {}), "interrupted"));
    const rejected = expect(pending).rejects.toMatchObject({name: "TimeoutError"});
    await vi.advanceTimersByTimeAsync(AUDIO_CONTEXT_START_TIMEOUT_MS);
    await rejected;
    expect(getErrorBreadcrumbs().at(-1)).toMatchObject({
      kind: "audio_playback", stage: "resume", outcome: "failed", context_state: "interrupted", failure_type: "timeout",
    });
  });
  it("handles synchronous browser errors and promise rejections", async () => {
    await expect(resumePlaybackAudioContext(context(() => {throw new Error("browser error");}))).rejects.toThrow("Tap Play again");
    await expect(resumePlaybackAudioContext(context(() => Promise.reject(new Error("browser error"))))).rejects.toThrow("Tap Play again");
  });
});
