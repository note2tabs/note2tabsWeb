// Status polling is intentionally a little slower than the UI's progress-copy
// animation. It keeps the loading screen feeling active while avoiding a new
// authenticated Vercel invocation every five seconds for every running job.
export const DEFAULT_JOB_POLL_DELAY_MS = 7500;
const MIN_JOB_POLL_DELAY_MS = 7500;
const MAX_JOB_POLL_DELAY_MS = 30_000;

export type JobStatusPollResult<T> = {
  job: T | null;
  notModified: boolean;
  etag: string | null;
  retryAfterMs: number;
};

const inFlightPolls = new Map<string, Promise<JobStatusPollResult<unknown>>>();
const SHARED_POLL_PREFIX = "n2t:job-poll:v1:";

async function sharedBrowserPoll<T>(key: string, load: () => Promise<JobStatusPollResult<T>>) {
  if (typeof navigator === "undefined" || !navigator.locks || typeof window === "undefined") return load();
  let entered = false;
  try {
    return await navigator.locks.request(key, async () => {
      entered = true;
      try {
        const stored = JSON.parse(window.localStorage.getItem(key) || "null");
        if (stored && Date.now() - stored.at >= 0 && Date.now() - stored.at < 1000) return stored.result as JobStatusPollResult<T>;
        window.localStorage.removeItem(key);
      } catch { /* Storage is optional. */ }
      const result = await load();
      try {
        // Only lightweight status responses; full results always authenticate afresh.
        const encoded = JSON.stringify({at:Date.now(),result});
        if (encoded.length < 8192) window.localStorage.setItem(key,encoded);
        // Bound temporary storage left by completed jobs and older sessions.
        const keys = Object.keys(window.localStorage).filter(value=>value.startsWith(SHARED_POLL_PREFIX));
        for (const candidate of keys) {
          const at = JSON.parse(window.localStorage.getItem(candidate) || "null")?.at;
          if (!at || Date.now() - at > 1000) window.localStorage.removeItem(candidate);
        }
      } catch { /* Retain the network result when storage is disabled or full. */ }
      return result;
    });
  } catch (error) {
    if (entered) throw error; // Do not retry a failed network request here.
    return load(); // Browser denied the optional lock API.
  }
}

export class JobStatusRequestError extends Error {
  constructor(
    public readonly status: number | null,
    public readonly retryAfterMs = DEFAULT_JOB_POLL_DELAY_MS,
  ) {
    super(status === null ? "Could not fetch job status." : `Failed to fetch job status (${status}).`);
    this.name = "JobStatusRequestError";
  }

  get retryable() {
    return this.status === null || this.status === 408 || this.status === 429 ||
      (this.status >= 500 && this.status <= 599);
  }
}

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

async function requestJobStatusUncached<T>(
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
  let response: Response;
  try {
    response = await (options.fetcher || fetch)(`/api/jobs/${encodeURIComponent(jobId)}${query}`, {
      cache: "no-store",
      headers,
    });
  } catch {
    throw new JobStatusRequestError(null);
  }
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
  if (!response.ok) throw new JobStatusRequestError(response.status, retryAfterMs);

  let job: T;
  try {
    job = await response.json() as T;
  } catch {
    // An interrupted response body is not a failed transcription either.
    throw new JobStatusRequestError(null, retryAfterMs);
  }

  return {
    job,
    notModified: false,
    etag: responseEtag,
    retryAfterMs,
  };
}

export function requestJobStatus<T>(
  jobId: string,
  options: {
    includeOutput?: boolean;
    etag?: string | null;
    fetcher?: typeof fetch;
    accountId?: string;
  } = {}
): Promise<JobStatusPollResult<T>> {
  // A custom fetcher is normally a test or isolated caller and must retain its
  // exact invocation semantics. Browser callers share identical concurrent polls.
  if (options.fetcher) return requestJobStatusUncached<T>(jobId, options);
  const key = `${options.accountId || ""}:${jobId}:${Boolean(options.includeOutput)}:${options.etag || ""}`;
  const existing = inFlightPolls.get(key);
  if (existing) return existing as Promise<JobStatusPollResult<T>>;
  const load = () => requestJobStatusUncached<T>(jobId, options);
  const request = (options.accountId && !options.includeOutput
    ? sharedBrowserPoll<T>(SHARED_POLL_PREFIX + key, load) : load()).finally(() => {
    if (inFlightPolls.get(key) === request) inFlightPolls.delete(key);
  });
  inFlightPolls.set(key, request as Promise<JobStatusPollResult<unknown>>);
  return request;
}
