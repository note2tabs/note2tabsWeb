import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_JOB_POLL_DELAY_MS,
  parseRetryAfterMs,
  requestJobStatus,
} from "../../lib/jobPolling";

describe("job polling", () => {
  it("uses integer and HTTP-date Retry-After values with safe bounds", () => {
    const now = Date.parse("2026-08-12T12:00:00.000Z");
    expect(parseRetryAfterMs("5", DEFAULT_JOB_POLL_DELAY_MS, now)).toBe(5000);
    expect(parseRetryAfterMs("Wed, 12 Aug 2026 12:00:08 GMT", DEFAULT_JOB_POLL_DELAY_MS, now)).toBe(8000);
    expect(parseRetryAfterMs("0", DEFAULT_JOB_POLL_DELAY_MS, now)).toBe(1000);
    expect(parseRetryAfterMs("120", DEFAULT_JOB_POLL_DELAY_MS, now)).toBe(15_000);
    expect(parseRetryAfterMs(null, DEFAULT_JOB_POLL_DELAY_MS, now)).toBe(DEFAULT_JOB_POLL_DELAY_MS);
  });

  it("sends If-None-Match and handles a bodyless 304", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 304,
        headers: { ETag: '"job-version-3"', "Retry-After": "5" },
      })
    );

    const result = await requestJobStatus("job/123", {
      etag: '"job-version-3"',
      fetcher: fetcher as typeof fetch,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/jobs/job%2F123",
      expect.objectContaining({ headers: { "If-None-Match": '"job-version-3"' } })
    );
    expect(result).toEqual({
      job: null,
      notModified: true,
      etag: '"job-version-3"',
      retryAfterMs: 5000,
    });
  });

  it("does not reuse a lightweight validator for a full-output request", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job_id: "job_123", status: "done" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await requestJobStatus<{ job_id: string; status: string }>("job_123", {
      includeOutput: true,
      etag: '"lightweight-version"',
      fetcher: fetcher as typeof fetch,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/jobs/job_123?include_output=1",
      expect.objectContaining({ headers: {} })
    );
    expect(result.job).toEqual({ job_id: "job_123", status: "done" });
  });
});
