// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { router, session, events } = vi.hoisted(() => ({
  router: { isReady: true, query: { job_id: "job_test" }, push: vi.fn(), replace: vi.fn() },
  session: { user: { id: "user_test" } },
  events: vi.fn(),
}));
vi.mock("../../lib/i18n/react", () => ({
  useLocale: () => ({ t: (s: string) => s, locale: "en" }),
  useLocaleRouter: () => router,
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session, status: "authenticated" }) }));
vi.mock("../../components/NoIndexHead", () => ({ default: () => null }));
vi.mock("../../components/EditorLoadingState", () => ({ EditorLoadingState: () => null }));
vi.mock("../../components/JobStatusLayout", () => ({
  default: ({ job }: any) => React.createElement("div", { "data-testid": "job-status" }, job?.status ?? "loading"),
}));
vi.mock("../../lib/analytics", () => ({
  ANALYTICS_EVENTS: { transcriptionEditorImportFailed: "transcription_editor_import_failed" }, sendEvent: events,
  getEditorImportFailureEvent: () => "transcription_editor_import_failed",
}));
vi.mock("../../lib/history", () => ({ saveJobToHistory: vi.fn() }));
vi.mock("../../lib/i18n/auth", () => ({ localizedSignIn: vi.fn() }));
import JobPage from "../../pages/job/[job_id]";
import { gteApi } from "../../lib/gteApi";

let root: Root, container: HTMLDivElement;
const response = (job: unknown) => new Response(JSON.stringify(job), {
  status: 200, headers: { "content-type": "application/json", etag: '"v1"' },
});
const processing = { job_id: "job_test", status: "processing", workflowState: "processing", progress: 50 };
const finished = { job_id: "job_test", status: "done", workflowState: "finalized", gte_editor_id: "editor_test" };
const status = () => container.querySelector('[data-testid="job-status"]')?.textContent;

async function render() { await act(async () => root.render(React.createElement(JobPage))); }
async function nextPoll() { await act(async () => { await vi.advanceTimersByTimeAsync(7500); }); }

describe("job result delivery", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    router.push.mockReset(); router.replace.mockReset(); events.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  });

  it("preserves a running job after a 502 and opens its editor when it completes", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(processing))
      .mockResolvedValueOnce(new Response("{}", { status: 502 }))
      .mockResolvedValue(response(finished));
    vi.stubGlobal("fetch", fetcher); vi.useFakeTimers();
    await render();
    expect(status()).toBe("processing");
    await nextPoll();
    expect(status()).toBe("processing");
    await nextPoll();
    expect(router.replace).toHaveBeenCalledWith(expect.stringContaining("/gte/editor_test"));
    // Recover with a full status response rather than a potentially stale 304.
    expect(fetcher.mock.calls[2][1].headers).not.toHaveProperty("If-None-Match");
  });

  it("retries an initially unavailable status without inventing a failed transcription", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(response(processing));
    vi.stubGlobal("fetch", fetcher); vi.useFakeTimers();
    await render();
    expect(status()).not.toBe("error");
    await nextPoll();
    expect(status()).toBe("processing");
  });

  it("does not disguise an actual worker failure as a temporary connection problem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ job_id: "job_test", status: "error", error_message: "Transcription failed" })));
    await render();
    expect(status()).toBe("error");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])("retains a terminal UI for HTTP %s access/not-found failures", async (code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: code })));
    await render();
    expect(status()).toBe("error");
  });

  it("can import a saved completed result without starting another transcription", async () => {
    const segments = [{ start_time_s: 0, end_time_s: 1, pitch_midi: 60 }];
    const imported = vi.spyOn(gteApi, "importTranscriberToSaved").mockResolvedValue({ editorId: "editor_test" } as any);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).startsWith("/api/tabs/")
      ? response({ id: "tab_test", sourceLabel: "Test recording", tabs: [], transcriberSegments: [], transcriberTracks: [{ name: "Guitar", trackType: "tab", instrumentId: "acoustic", segments }] })
      : response({ job_id: "job_test", status: "done", workflowState: "finalized", tabId: "tab_test" }));
    vi.stubGlobal("fetch", fetcher);
    await render();
    for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
    expect(imported).toHaveBeenCalledOnce();
    expect(router.push).toHaveBeenCalledWith(expect.stringContaining("/gte/editor_test"));
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("/api/jobs/") || String(url).startsWith("/api/tabs/"))).toBe(true);
  });
  it("records finalization failures that happen before editor import starts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => String(url).endsWith("/finalize")
      ? new Response(JSON.stringify({ error: "Test preparation failure" }), { status: 400 })
      : response({ job_id: "job_test", status: "done", workflowState: "review_ready" })));
    await render();
    for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
    const failures = events.mock.calls.filter(([event]) => event === "transcription_editor_import_failed");
    expect(failures).toHaveLength(1);
    expect(failures[0][1]).toMatchObject({ jobId: "job_test", failure_stage: "finalize" });
    expect(failures[0][1]).not.toHaveProperty("error_message");
  });

  it("does not double-count a failure already reported by the import operation", async () => {
    vi.spyOn(gteApi, "importTranscriberToSaved").mockRejectedValue(new Error("Import unavailable"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      job_id: "job_test", status: "done", workflowState: "finalized",
      transcriberTracks: [{ name: "Guitar", trackType: "tab", instrumentId: "acoustic", segments: [{ start_time_s: 0, end_time_s: 1, pitch_midi: 60 }] }],
    })));
    await render();
    for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
    expect(events.mock.calls.filter(([event]) => event === "transcription_editor_import_failed")).toHaveLength(1);
  });

});
