import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureFrustrationSignals } from "../../lib/frustrationSignals";
import { addErrorBreadcrumb, diagnosticEndpoint, getErrorBreadcrumbs, installDiagnosticFetch, observeDiagnosticAction, recordDiagnosticNavigation, recordDiagnosticProductEvent, setErrorBreadcrumbsEnabled } from "../../lib/errorBreadcrumbs";
beforeEach(() => { vi.stubGlobal("window", {location: {origin: "https://note2tabs.com"}, fetch: vi.fn()}); setErrorBreadcrumbsEnabled(true); });
afterEach(() => { configureFrustrationSignals(); setErrorBreadcrumbsEnabled(false); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("error breadcrumbs", () => {
  it("bounds and expires breadcrumbs, scrubs navigation, and clears on opt-out", () => {
    vi.useFakeTimers();
    recordDiagnosticNavigation("/gte/private?token=secret", "start");
    expect(getErrorBreadcrumbs()[0]).toMatchObject({path: "/gte/[editor_id]"});
    for (let i=0;i<30;i++) addErrorBreadcrumb("click", {element:"button"});
    expect(getErrorBreadcrumbs()).toHaveLength(25);
    vi.advanceTimersByTime(300_001);
    expect(getErrorBreadcrumbs()).toHaveLength(0);
    addErrorBreadcrumb("click"); setErrorBreadcrumbsEnabled(false); addErrorBreadcrumb("click");
    expect(getErrorBreadcrumbs()).toHaveLength(0);
  });
  it("never reads clicked text or input values", () => {
    const element = {tagName:"BUTTON", getAttribute: () => "private-token", get textContent() {throw Error("must not read");}};
    observeDiagnosticAction({target:{closest:()=>element}} as unknown as Event);
    expect(getErrorBreadcrumbs()[0]).toMatchObject({kind:"click",element:"button"});
    expect(JSON.stringify(getErrorBreadcrumbs())).not.toContain("private");
  });
  it("templates private API paths and excludes analytics and external traffic", () => {
    expect(diagnosticEndpoint("/api/gte/editors/private-id/tracks/secret?token=password")).toBe("/api/gte/editors/[id]/tracks/[id]");
    expect(diagnosticEndpoint("https://storage.example/private.mp3")).toBeUndefined();
    expect(diagnosticEndpoint("/api/analytics/ingest")).toBeUndefined();
    expect(diagnosticEndpoint("/api/auth/session")).toBeUndefined();
  });
  it("preserves response identity, input, body, headers, signal and records failed requests", async () => {
    const response = new Response("private body", {status:503, headers:{"x-vercel-id":"arn1::abc-123", "x-request-id":"abc-123"}});
    const original = vi.fn().mockResolvedValue(response); window.fetch = original;
    const fail = vi.fn(); const stop = installDiagnosticFetch(fail);
    const init = {method:"POST",body:"secret",headers:{Authorization:"secret"},signal:new AbortController().signal};
    expect(await window.fetch("/api/transcribe?token=secret", init)).toBe(response);
    expect(original).toHaveBeenCalledWith("/api/transcribe?token=secret",init);
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({endpoint:"/api/transcribe",method:"POST",http_status:503,vercel_request_id:"arn1::abc-123",request_id:"abc-123"}));
    expect(JSON.stringify(getErrorBreadcrumbs())).not.toContain("secret");
    expect(await response.text()).toBe("private body"); stop(); expect(window.fetch).toBe(original);
  });
  it("preserves thrown errors, distinguishes aborts, and cannot recurse through analytics", async () => {
    const error = new TypeError("private network details"); window.fetch = vi.fn().mockRejectedValue(error);
    const fail = vi.fn(); const stop = installDiagnosticFetch(fail);
    await expect(window.fetch("/api/credits")).rejects.toBe(error); expect(fail).toHaveBeenCalledOnce();
    await expect(window.fetch("/api/analytics/ingest")).rejects.toBe(error); expect(fail).toHaveBeenCalledOnce(); stop();
    window.fetch = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const stop2 = installDiagnosticFetch(fail);
    await expect(window.fetch("/api/credits")).rejects.toMatchObject({name:"AbortError"}); expect(fail).toHaveBeenCalledOnce(); stop2();
  });
  it("does not change fetch outcomes when telemetry fails or opt-out happens in flight", async () => {
    const response = new Response("",{status:500}); window.fetch=vi.fn().mockResolvedValue(response);
    const stop=installDiagnosticFetch(()=>{throw Error("telemetry unavailable");});
    expect(await window.fetch("/api/credits")).toBe(response); stop();
    let resolve!: (response:Response)=>void;
    window.fetch=vi.fn(()=>new Promise<Response>(r=>{resolve=r;})); const fail=vi.fn(); const stop2=installDiagnosticFetch(fail);
    const pending=window.fetch("/api/credits"); setErrorBreadcrumbsEnabled(false); resolve(response);
    expect(await pending).toBe(response); expect(fail).not.toHaveBeenCalled(); expect(getErrorBreadcrumbs()).toEqual([]); stop2();
  });
});

it("records only known product actions and excludes their payloads", () => {
  recordDiagnosticProductEvent("transcription_failed", { filename:"private.wav",error:"secret" });
  recordDiagnosticProductEvent("cta_clicked", { cta:"mode_youtube",url:"private" });
  recordDiagnosticProductEvent("cta_clicked", { cta:"private-title" });
  expect(getErrorBreadcrumbs()).toHaveLength(2);
  expect(JSON.stringify(getErrorBreadcrumbs())).not.toMatch(/secret|private/);
});


describe("caught transcription delivery outcomes", () => {
  it("detects repeated opening failures without requiring uncaught exceptions", () => {
    vi.useFakeTimers();
    const sink = vi.fn(); configureFrustrationSignals(sink);
    recordDiagnosticProductEvent("transcription_editor_import_failed");
    recordDiagnosticProductEvent("transcription_editor_navigation_failed");
    expect(sink).not.toHaveBeenCalled();
    recordDiagnosticProductEvent("transcription_editor_import_failed");
    expect(sink).toHaveBeenCalledOnce();
    expect(sink.mock.calls[0][0]).toMatchObject({action:"editor_import",attempts:3});
    expect(vi.getTimerCount()).toBe(0);
  });
  it("breaks the streak on successful import and honors disabled diagnostics", () => {
    const sink = vi.fn(); configureFrustrationSignals(sink);
    recordDiagnosticProductEvent("transcription_editor_import_failed");
    recordDiagnosticProductEvent("transcription_editor_import_failed");
    recordDiagnosticProductEvent("transcription_imported_to_editor");
    recordDiagnosticProductEvent("transcription_editor_import_failed");
    expect(sink).not.toHaveBeenCalled();
    setErrorBreadcrumbsEnabled(false);
    for(let i=0;i<5;i++)recordDiagnosticProductEvent("transcription_editor_import_failed");
    expect(sink).not.toHaveBeenCalled();
  });
});

it("reports editor import 413s without turning ordinary upload limits into request incidents", async () => {
  window.fetch = vi.fn().mockResolvedValue(new Response("private body", {status:413}));
  const fail=vi.fn(); const stop=installDiagnosticFetch(fail);
  await window.fetch("/api/gte/transcriber/import");
  await window.fetch("/api/gte-guest/transcriber/import");
  expect(fail).toHaveBeenCalledTimes(2);
  expect(fail.mock.calls[0][0]).toMatchObject({endpoint:"/api/gte/transcriber/import",http_status:413});
  await window.fetch("/api/transcribe");
  expect(fail).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(getErrorBreadcrumbs())).not.toContain("private body");
  stop();
});
