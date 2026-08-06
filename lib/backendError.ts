const GENERIC_BACKEND_ERROR = "We could not start this transcription. Please try again.";

export function publicTranscriptionError(status: number) {
  if (status === 400 || status === 415 || status === 422) {
    return "This audio file could not be processed. Please try a different file.";
  }
  if (status === 401) return "Please sign in and try again.";
  if (status === 402 || status === 403) return "This transcription is not available for your account.";
  if (status === 413) return "This audio file is too large.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  return GENERIC_BACKEND_ERROR;
}
