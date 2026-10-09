import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), update: vi.fn(), ingest: vi.fn(), configured: vi.fn(() => true),
}));
vi.mock("../../lib/prisma", () => ({ prisma: { $queryRaw: mocks.query, $executeRaw: mocks.update } }));
vi.mock("../../lib/posthogServer", () => ({ isPostHogConfigured: mocks.configured }));
vi.mock("../../lib/analyticsV2/ingest", () => ({ ingestAnalyticsEvents: mocks.ingest }));

import { deliverTranscriptionAnalytics, registerTranscriptionAnalytics, transcriptionLifecycleEvents, type AnalyticsJob } from "../../lib/transcriptionAnalytics";

const job: AnalyticsJob = {
  id: "root-job", userId: "owner", status: "succeeded",
  createdAt: new Date("2026-10-07T12:00:00Z"), startedAt: new Date("2026-10-07T12:00:10Z"), finishedAt: new Date("2026-10-07T12:01:00Z"),
  analytics: { version: 1, properties: {
    job_id: "root-job", transcription_backend_method: "msmodel_small",
    transcription_worker_pool: "msmodel_small_subscribed", access_type: "paid",
  } },
};

describe("durable transcription analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.unstubAllEnvs();
    mocks.configured.mockReturnValue(true);
    mocks.query.mockResolvedValue([structuredClone(job)]);
    mocks.update.mockResolvedValue(1);
    mocks.ingest.mockResolvedValue({ ok: true });
  });

  it("captures Small separately, with stable retry identities and elapsed time", () => {
    const events = transcriptionLifecycleEvents(job);
    expect(events.map(event => event.name)).toEqual(["transcription_started", "transcription_started_msmodel_small", "job_completed", "transcription_succeeded"]);
    expect(events).toEqual(transcriptionLifecycleEvents(structuredClone(job)));
    expect(events.at(-1)).toMatchObject({
      ts: "2026-10-07T12:01:00.000Z", props: {
        job_id: "root-job", access_type: "paid", transcription_worker_pool: "msmodel_small_subscribed",
        total_elapsed_sec: 60, worker_elapsed_sec: 50,
      },
    });
  });

  it("records Heavy preview completion independently of the browser", () => {
    const preview = structuredClone(job);
    preview.analytics.properties = { transcription_backend_method: "msmodel", heavy_preview: true, access_type: "preview" };
    expect(transcriptionLifecycleEvents(preview).map(event => event.name)).toEqual([
      "transcription_started", "transcription_started_heavy_model", "job_completed", "transcription_succeeded", "heavy_preview_completed",
    ]);
  });

  it("captures a final worker failure, excluding raw errors", () => {
    const events = transcriptionLifecycleEvents({ ...job, status: "failed" });
    expect(events.map(event => event.name)).not.toContain("transcription_succeeded");
    expect(events.at(-1)).toMatchObject({ name: "transcription_failed", props: { failure_stage: "worker", error_code: "worker_failed" } });
  });

  it("does not treat a retried running job as failed", () => {
    expect(transcriptionLifecycleEvents({ ...job, status: "queued", finishedAt: null }).map(event => event.name)).toEqual(["transcription_started", "transcription_started_msmodel_small"]);
  });

  it("leaves delivery pending when PostHog fails, then retries the same events", async () => {
    mocks.ingest.mockRejectedValueOnce(new Error("Unavailable"));
    await expect(deliverTranscriptionAnalytics()).rejects.toThrow("Unavailable");
    expect(mocks.update).not.toHaveBeenCalled();
    const first = mocks.ingest.mock.calls[0][0];
    await deliverTranscriptionAnalytics();
    expect(mocks.ingest.mock.calls[1][0]).toEqual(first);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("marks deliveries only after confirmed capture", async () => {
    expect(await deliverTranscriptionAnalytics()).toEqual({ jobs: 1, events: 4 });
    expect(mocks.ingest).toHaveBeenCalledWith(expect.objectContaining({ accountId: "owner", source: "transcription_job_outbox" }));
    expect(JSON.parse(mocks.update.mock.calls[0][1])).toMatchObject({ startDelivered: true, terminalDelivered: true });
  });

  it("omits already delivered start events", () => {
    expect(transcriptionLifecycleEvents({ ...job, analytics: { ...job.analytics, startDelivered: true } }).map(event => event.name)).toEqual(["job_completed", "transcription_succeeded"]);
  });

  it("honors opt-out before persisting tracking context", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await registerTranscriptionAnalytics({
      req: { headers: { cookie: "analytics_consent=denied" } } as any,
      jobId: "root-job", userId: "owner", model: "light", durationSec: 60,
      mode: "FILE", plan: "PRO", accessType: "paid", preview: false, creditsUsed: 2,
    })).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("records the actual subscribed Small route even when the API omitted its pool", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "production");
    mocks.query.mockResolvedValue([{ pool: null, prepareType: "transcription_prepare_msmodel_small_subscribed" }]);
    expect(await registerTranscriptionAnalytics({
      req: { headers: {} } as any, jobId: "root-job", userId: "owner", model: "light",
      durationSec: 600, mode: "FILE", plan: "PRO", accessType: "paid", preview: false, creditsUsed: 40,
    })).toBe(true);
    expect(JSON.parse(mocks.update.mock.calls[0][1]).properties).toMatchObject({
      transcription_backend_method: "msmodel_small", transcription_worker_pool: "msmodel_small_subscribed",
      access_type: "paid", subscription_plan: "pro", input_source: "local_file", durationSec: 600,
    });
  });

  it("preserves the Spanish country cohort through delayed completion events", async () => {
    vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("VERCEL","1");vi.stubEnv("NEXT_PUBLIC_ES_REVIEWED","true");
    mocks.query.mockResolvedValue([{pool:null,prepareType:"transcription_prepare_msmodel_small"}]);
    await registerTranscriptionAnalytics({req:{headers:{cookie:"n2t_locale=es","x-vercel-ip-country":"MX"}} as any,jobId:"job",userId:"owner",model:"light",durationSec:30,mode:"FILE",plan:"FREE",accessType:"free",preview:false,creditsUsed:2});
    const analytics=JSON.parse(mocks.update.mock.calls[0][1]);
    expect(analytics.properties).toMatchObject({content_locale:"es",visitor_country:"MX",localization_cohort:"es:MX"});
    for(const event of transcriptionLifecycleEvents({...job,analytics}))expect(event.props).toMatchObject({content_locale:"es",visitor_country:"MX",localization_cohort:"es:MX"});
  });
  it("keeps preview deployments on browser tracking", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "preview");
    expect(await registerTranscriptionAnalytics({
      req: { headers: {} } as any, jobId: "root-job", userId: "owner", model: "light",
      durationSec: 30, mode: "FILE", plan: "FREE", accessType: "free", preview: false, creditsUsed: 2,
    })).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
