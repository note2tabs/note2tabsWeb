const GENERIC_BACKEND_ERROR = "We could not start this transcription. Please try again.";

export function publicJobError(value: unknown) {
  const message = typeof value === "string" ? value.trim() : "";
  const normalized = message.toLowerCase();
  if (!message) {
    return "We could not complete this transcription. Try again with another section or model.";
  }
  if (/timed? out|timeout|deadline/.test(normalized)) {
    return "This transcription took longer than expected and stopped. Try a shorter section or run it again.";
  }
  if (/failed to fetch|network|connection|could not fetch job status/.test(normalized)) {
    return "We could not refresh the transcription status. Check your connection and try again.";
  }
  if (/unauth|forbidden|permission|token|credential/.test(normalized)) {
    return "Your session may have expired. Sign in again, then reopen this transcription.";
  }
  if (/unsupported|decode|codec|corrupt|invalid audio|could not.*audio/.test(normalized)) {
    return "We could not read this recording. Try an MP3, WAV, or M4A file, or choose another section.";
  }
  if (/credit|quota|limit/.test(normalized)) {
    return "This transcription could not continue because the account limit was reached. Review your credits and try again.";
  }
  // Backend messages may contain worker names, storage paths, stack traces, or
  // provider details. Keep those in logs rather than exposing them in the UI.
  return "We could not complete this transcription. Try again with another section or model.";
}

export function publicTranscriptionError(status: number) {
  if (status === 400 || status === 415 || status === 422) {
    return "This audio file could not be processed. Please try a different file.";
  }
  if (status === 401) return "Please sign in and try again.";
  if (status === 402 || status === 403) return "This transcription is not available for your account.";
  if (status === 413) return "This audio file is too large.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) {
    return "The transcription service is temporarily unavailable. Your file is still selected, so you can try again shortly.";
  }
  return GENERIC_BACKEND_ERROR;
}
