import { afterEach, describe, expect, it, vi } from "vitest";
const durable = vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
vi.mock("../../lib/posthogOutbox",()=>({enqueuePostHogCaptures:durable,retryPostHogCaptures:vi.fn()}));
import { createPostHogIngestClient } from "../../lib/posthogServer";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("stable PostHog batch transport", () => {
  it("preserves exact timestamps and UUIDs without sent_at clock adjustment", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "capture-token"); vi.stubEnv("POSTHOG_HOST", "https://eu.i.posthog.com");
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const client = createPostHogIngestClient()!;
    client.capture({ distinctId: "owner", event: "transcription_succeeded", uuid: "00000000-0000-4000-a000-000000000001", timestamp: new Date("2026-10-07T12:00:00.123Z"), properties: { job_id: "job" }, disableGeoip: true });
    await client.flush();
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload).not.toHaveProperty("sent_at");
    expect(payload.batch[0]).toMatchObject({ distinct_id: "owner", timestamp: "2026-10-07T12:00:00.123Z", uuid: "00000000-0000-4000-a000-000000000001", properties: { job_id: "job", $geoip_disable: true } });
    expect(payload.batch[0]).not.toHaveProperty("sent_at");
  });
  it("retains the batch if PostHog rejects delivery", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "capture-token");
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const client = createPostHogIngestClient()!;
    client.capture({ distinctId: "owner", event: "transcription_failed", uuid: "00000000-0000-4000-a000-000000000001", timestamp: new Date("2026-10-07T12:00:00.123Z"), properties: {} });
    await expect(client.flush()).rejects.toThrow("delivery failed");
    await client.flush(); expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  });
  it("persists an immutable failed server-save capture without turning the save into an error",async()=>{
    vi.stubEnv("POSTHOG_PROJECT_TOKEN","capture-token");vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false}));durable.mockClear();
    const client=createPostHogIngestClient({recoverDurably:true})!;
    client.capture({distinctId:"account",event:"gte_editor_saved",uuid:"00000000-0000-4000-a000-000000000001",timestamp:new Date("2026-10-17T12:00:00Z"),properties:{editor_id:"test-editor"}});
    await client.flush();expect(durable).toHaveBeenCalledWith([expect.objectContaining({event:"gte_editor_saved",timestamp:"2026-10-17T12:00:00.000Z",uuid:"00000000-0000-4000-a000-000000000001"})],expect.any(Function));
  });

});
