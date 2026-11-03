import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_JOB_POLL_DELAY_MS,
  JobStatusRequestError,
  parseRetryAfterMs,
  requestJobStatus,
} from "../../lib/jobPolling";
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe("job polling", () => {
  it.each([408, 429, 500, 502, 503, 504])("marks HTTP %s status-fetch failures as retryable", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status, headers: { "Retry-After": "20" } }));
    await expect(requestJobStatus("job_test", { fetcher })).rejects.toMatchObject({
      status, retryable: true, retryAfterMs: 20_000,
    });
  });

  it.each([400, 401, 403, 404])("does not retry HTTP %s as a connection failure", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status }));
    await expect(requestJobStatus("job_test", { fetcher })).rejects.toMatchObject({ status, retryable: false });
  });

  it("treats an interrupted JSON body as an unknown status, not a failed job", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"job_id":', { status: 200 }));
    await expect(requestJobStatus("job_test", { fetcher })).rejects.toBeInstanceOf(JobStatusRequestError);
    await expect(requestJobStatus("job_test", { fetcher })).rejects.toMatchObject({ status: null, retryable: true });
  });

  it("uses integer and HTTP-date Retry-After values with safe bounds", () => {
    const now = Date.parse("2026-08-12T12:00:00.000Z");
    expect(parseRetryAfterMs("5", DEFAULT_JOB_POLL_DELAY_MS, now)).toBe(7500);
    expect(parseRetryAfterMs("Wed, 12 Aug 2026 12:00:08 GMT", DEFAULT_JOB_POLL_DELAY_MS, now)).toBe(8000);
    expect(parseRetryAfterMs("0", DEFAULT_JOB_POLL_DELAY_MS, now)).toBe(7500);
    expect(parseRetryAfterMs("120", DEFAULT_JOB_POLL_DELAY_MS, now)).toBe(30_000);
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
      retryAfterMs: 7500,
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

  it("coalesces identical concurrent browser polls without changing their result", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const first = requestJobStatus<{ status: string }>("job_123", { etag: '"v1"' });
    const second = requestJobStatus<{ status: string }>("job_123", { etag: '"v1"' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(new Response(JSON.stringify({ status: "processing" }), { status: 200 }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ job: { status: "processing" } }),
      expect.objectContaining({ job: { status: "processing" } }),
    ]);
    vi.unstubAllGlobals();
  });
  it('shares concurrent polls across tabs, scopes them to accounts and expires them after one second',async()=>{
    const storage: Record<string,unknown> = {};
    Object.defineProperties(storage,{
      getItem:{value:(key:string)=>storage[key]??null},
      setItem:{value:(key:string,value:string)=>{storage[key]=value;}},
      removeItem:{value:(key:string)=>{delete storage[key];}},
    });
    let tail:Promise<unknown>=Promise.resolve();
    vi.stubGlobal('window',{localStorage:storage});
    vi.stubGlobal('navigator',{locks:{request:(_key:string,callback:()=>unknown)=>{const next=tail.catch(()=>{}).then(callback);tail=next;return next;}}});
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({status:'processing'}),{status:200}));
    vi.stubGlobal('fetch',fetcher);
    vi.resetModules();const tabOne=await import('../../lib/jobPolling');
    vi.resetModules();const tabTwo=await import('../../lib/jobPolling');
    const results=await Promise.all([tabOne.requestJobStatus('job',{accountId:'one'}),tabTwo.requestJobStatus('job',{accountId:'one'})]);
    expect(fetcher).toHaveBeenCalledTimes(1);expect(results[0]).toEqual(results[1]);
    await tabTwo.requestJobStatus('job',{accountId:'two'});expect(fetcher).toHaveBeenCalledTimes(2);
    await tabTwo.requestJobStatus('job',{accountId:'one',includeOutput:true});expect(fetcher).toHaveBeenCalledTimes(3);
    const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+1001);
    await tabOne.requestJobStatus('job',{accountId:'one'});expect(fetcher).toHaveBeenCalledTimes(4);
    vi.restoreAllMocks();
  });
  it('keeps polling normally when storage or locks are unavailable and does not retry transport errors',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({status:'processing'}),{status:200}));
    vi.stubGlobal('fetch',fetcher);
    vi.stubGlobal('window',{get localStorage(){throw new Error('blocked');}});
    vi.stubGlobal('navigator',{locks:{request:(_key:string,callback:()=>unknown)=>callback()}});
    await requestJobStatus('blocked',{accountId:'one'});expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await expect(requestJobStatus('failed',{accountId:'one'})).rejects.toBeInstanceOf(JobStatusRequestError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.stubGlobal('navigator',{locks:{request:()=>Promise.reject(new Error('denied'))}});
    await requestJobStatus('denied',{accountId:'one'});expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
