import { afterEach, describe, expect, it, vi } from "vitest";

describe("GTE telemetry batching", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends ordered events with their original timestamps in one request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { queueGteTelemetry } = await import("../../lib/gteTelemetryClient");

    void queueGteTelemetry({ event: "gte_editor_visit", editorId: "ed_1", ts: "2026-09-09T10:00:00.000Z" });
    void queueGteTelemetry({ event: "gte_editor_session_start", editorId: "ed_1", ts: "2026-09-09T10:00:01.000Z" });
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({ events: [
      expect.objectContaining({ event: "gte_editor_visit", ts: "2026-09-09T10:00:00.000Z" }),
      expect.objectContaining({ event: "gte_editor_session_start", ts: "2026-09-09T10:00:01.000Z" }),
    ] });
  });

  it("flushes queued events with sendBeacon on page exit", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon });
    const { flushGteTelemetry, queueGteTelemetry } = await import("../../lib/gteTelemetryClient");
    void queueGteTelemetry({ event: "gte_editor_session_end", editorId: "ed_1" });
    await flushGteTelemetry("beacon");
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});

describe("GTE telemetry delivery recovery", () => {
  afterEach(() => {vi.useRealTimers();vi.unstubAllGlobals();vi.resetModules();});
  it("retries a 503 with the same event ID and timestamp",async()=>{
    vi.useFakeTimers();const request=vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValue(new Response(null,{status:200}));vi.stubGlobal('fetch',request);
    const {queueGteTelemetry,flushGteTelemetry}=await import('../../lib/gteTelemetryClient');
    await queueGteTelemetry({event:'gte_editor_session_end',editorId:'test'});await flushGteTelemetry();await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(2);const first=JSON.parse(request.mock.calls[0][1].body).events[0],retry=JSON.parse(request.mock.calls[1][1].body).events[0];expect(retry).toEqual(first);expect(first.eventId).toBeTruthy();
  });
  it("falls back to keepalive fetch when beacon refuses the payload",async()=>{
    vi.useFakeTimers();vi.stubGlobal('navigator',{sendBeacon:vi.fn().mockReturnValue(false)});const request=vi.fn().mockResolvedValue(new Response(null,{status:200}));vi.stubGlobal('fetch',request);
    const {queueGteTelemetry,flushGteTelemetry}=await import('../../lib/gteTelemetryClient');await queueGteTelemetry({event:'gte_editor_session_end',editorId:'test'});await flushGteTelemetry('beacon');expect(request).toHaveBeenCalledWith('/api/gte/telemetry',expect.objectContaining({keepalive:true}));
  });
  it("drops pending retries after analytics opt-out",async()=>{
    vi.useFakeTimers();const doc={cookie:''};vi.stubGlobal('document',doc);const request=vi.fn().mockRejectedValue(new Error('offline'));vi.stubGlobal('fetch',request);
    const {queueGteTelemetry,flushGteTelemetry}=await import('../../lib/gteTelemetryClient');await queueGteTelemetry({event:'gte_editor_visit',editorId:'test'});await flushGteTelemetry();doc.cookie='analytics_consent=denied';await vi.advanceTimersByTimeAsync(10000);expect(request).toHaveBeenCalledTimes(1);
  });
});
