import { addErrorBreadcrumb } from "./errorBreadcrumbs";

export const AUDIO_CONTEXT_START_TIMEOUT_MS = 5_000;
export const AUDIO_CONTEXT_RESUME_ERROR = "Your browser blocked audio playback. Tap Play again to allow sound.";

/** Call synchronously from the gesture; some browsers leave resume() pending forever. */
export function resumePlaybackAudioContext(ctx: AudioContext): Promise<void> {
  addErrorBreadcrumb("audio_playback", { stage: "resume", context_state: ctx.state });
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      addErrorBreadcrumb("audio_playback", {
        stage: "resume", outcome: error ? "failed" : "ready", context_state: ctx.state,
        ...(error ? { failure_type: error.name === "TimeoutError" ? "timeout" : "blocked" } : {}),
      });
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => {
      const error = new Error(AUDIO_CONTEXT_RESUME_ERROR);
      error.name = "TimeoutError";
      finish(error);
    }, AUDIO_CONTEXT_START_TIMEOUT_MS);
    try {
      Promise.resolve(ctx.resume()).then(
        () => finish(ctx.state === "running" ? undefined : new Error(AUDIO_CONTEXT_RESUME_ERROR)),
        () => finish(new Error(AUDIO_CONTEXT_RESUME_ERROR))
      );
    } catch {
      finish(new Error(AUDIO_CONTEXT_RESUME_ERROR));
    }
  });
}
