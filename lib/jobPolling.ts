export const DEFAULT_JOB_POLL_DELAY_MS = 3000;
const MIN_JOB_POLL_DELAY_MS = 1000;
const MAX_JOB_POLL_DELAY_MS = 15_000;

export type JobStatusPollResult<T> = {
  job: T | null;
  notModified: boolean;
  etag: string | null;
  retryAfterMs: number;
};

export function parseRetryAfterMs(
  value: string | null,
  fallbackMs = DEFAULT_JOB_POLL_DELAY_MS,
  nowMs = Date.now()
) {
  let requestedDelayMs = fallbackMs;
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      requestedDelayMs = seconds * 1000;
    } else {
      const retryAt = Date.parse(value);
      if (Number.isFinite(retryAt)) requestedDelayMs = retryAt - nowMs;
    }
  }

  return Math.min(MAX_JOB_POLL_DELAY_MS, Math.max(MIN_JOB_POLL_DELAY_MS, Math.round(requestedDelayMs)));
}

export async function requestJobStatus<T>(
  jobId: string,
  options: {
    includeOutput?: boolean;
    etag?: string | null;
    fetcher?: typeof fetch;
  } = {}
): Promise<JobStatusPollResult<T>> {
  const includeOutput = Boolean(options.includeOutput);
  const headers: Record<string, string> = {};
  if (!includeOutput && options.etag) headers["If-None-Match"] = options.etag;

  const query = includeOutput ? "?include_output=1" : "";
  const response = await (options.fetcher || fetch)(`/api/jobs/${encodeURIComponent(jobId)}${query}`, {
    cache: "no-store",
    headers,
  });
  const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
  const responseEtag = response.headers.get("etag");

  if (response.status === 304) {
    return {
      job: null,
      notModified: true,
      etag: responseEtag || options.etag || null,
      retryAfterMs,
    };
  }
  if (!response.ok) throw new Error(`Failed to fetch job status (${response.status}).`);

  return {
    job: (await response.json()) as T,
    notModified: false,
    etag: responseEtag,
    retryAfterMs,
  };
}
