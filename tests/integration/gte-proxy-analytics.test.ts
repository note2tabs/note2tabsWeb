import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const sessionMock = vi.fn();
const logMock = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../lib/gteAnalytics", () => ({
  logGteAnalyticsEvent: (...args: unknown[]) => logMock(...args),
}));

vi.mock("../../lib/gteTrackInstrumentStore", () => ({
  getGteEditorRefFromPath: (path: string) => {
    const match = path.match(/^editors\/([^/]+)/);
    return match ? match[1] : null;
  },
  hydrateTrackInstrumentsFromStore: async (_userId: string, _editorRef: string, payload: unknown) => payload,
  persistTrackInstrumentsFromSnapshot: vi.fn(),
}));

describe("gte proxy analytics", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    logMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, snapshot: { id: "ed_1" } }), { status: 200 }))
    );
  });

  it("logs successful editor commits as saves without blocking the response", async () => {
    logMock.mockRejectedValue(new Error("analytics down"));

    const handler = (await import("../../pages/api/gte/[[...path]]")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { path: ["editors", "ed_1", "commit"] },
      body: {},
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      event: "gte_editor_saved",
      payload: expect.objectContaining({ editorId: "ed_1" }),
    }));
  });

  it("logs successful editor exports with the export format", async () => {
    const handler = (await import("../../pages/api/gte/[[...path]]")).default;
    const { req, res } = createMocks({
      method: "GET",
      query: { path: ["editors", "ed_1", "export_ascii"] },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "gte_editor_exported",
      payload: expect.objectContaining({ editorId: "ed_1", format: "ascii" }),
    }));
  });

  it("logs successful transcriber imports", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ editors: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, editorId: "ed_imported" }), { status: 200 }));

    const handler = (await import("../../pages/api/gte/[[...path]]")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { path: ["transcriber", "import"] },
      body: { target: "new" },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "gte_editor_imported",
      payload: expect.objectContaining({ editorId: "ed_imported", target: "new" }),
    }));
  });
});
