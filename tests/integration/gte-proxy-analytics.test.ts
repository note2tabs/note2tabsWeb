import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const sessionMock = vi.fn();
const logMock = vi.fn();
const updateTabJobMock = vi.fn();
const sendTabShareEmailMock = vi.fn();
const isBlockedMock = vi.fn();
const claimDeliveryMock = vi.fn();
const releaseDeliveryMock = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("../../lib/gteAnalytics", () => ({
  logGteAnalyticsEvent: (...args: unknown[]) => logMock(...args),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    tabJob: { updateMany: (...args: unknown[]) => updateTabJobMock(...args) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("../../lib/tabShareEmail", () => ({
  sendTabShareEmail: (...args: unknown[]) => sendTabShareEmailMock(...args),
}));

vi.mock("../../lib/tabShareEmailPreferences", () => ({
  normalizeShareEmail: (email: string) => email.trim().toLowerCase(),
  isTabShareEmailBlocked: (...args: unknown[]) => isBlockedMock(...args),
  claimTabShareEmailDelivery: (...args: unknown[]) => claimDeliveryMock(...args),
  releaseTabShareEmailDelivery: (...args: unknown[]) => releaseDeliveryMock(...args),
}));

vi.mock("../../lib/gteTrackInstrumentStore", () => ({
  getGteEditorRefFromPath: (path: string) => {
    const match = path.match(/^editors\/([^/]+)/);
    return match ? match[1] : null;
  },
  hydrateTrackInstrumentsFromStore: async (_editorRef: string, payload: unknown) => payload,
  persistTrackInstrumentsFromSnapshot: vi.fn(),
}));

vi.mock("../../lib/gteTrackPlaybackStore", () => ({
  hydrateTrackPlaybackFromStore: async (_userId: string, _editorRef: string, payload: unknown) => payload,
  persistTrackPlaybackFromSnapshot: vi.fn(),
}));

describe("gte proxy analytics", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    logMock.mockReset();
    updateTabJobMock.mockReset();
    updateTabJobMock.mockResolvedValue({ count: 1 });
    sendTabShareEmailMock.mockReset();
    sendTabShareEmailMock.mockResolvedValue(true);
    isBlockedMock.mockReset();
    isBlockedMock.mockResolvedValue(false);
    claimDeliveryMock.mockReset();
    claimDeliveryMock.mockResolvedValue(true);
    releaseDeliveryMock.mockReset();
    releaseDeliveryMock.mockResolvedValue(undefined);
    sessionMock.mockResolvedValue({ user: { id: "user_1", name: "Noel", email: "owner@example.com" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, snapshot: { id: "ed_1" } }), { status: 200 }))
    );
  });

  it("emails a collaborator only after the editor service creates the share", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            shareId: 12,
            canvasId: "ed_1",
            email: "player@example.com",
            role: "viewer",
            status: "pending",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ editors: [{ id: "ed_1", name: "Autumn fall" }] }), { status: 200 })
      );

    const handler = (await import("../../pages/api/gte/[[...path]]")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { path: ["editors", "ed_1", "shares"] },
      body: { email: "player@example.com", role: "viewer" },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(sendTabShareEmailMock).toHaveBeenCalledWith({
      to: "player@example.com",
      inviterName: "Noel",
      tabName: "Autumn fall",
      editorId: "ed_1",
      role: "viewer",
      recipientHasAccount: false,
    });
    expect(JSON.parse(res._getData())).toEqual(expect.objectContaining({ emailDelivered: true }));
  });

  it("keeps the share but reports when its invitation email fails", async () => {
    sendTabShareEmailMock.mockRejectedValueOnce(new Error("SES unavailable"));
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            shareId: 12,
            canvasId: "ed_1",
            email: "player@example.com",
            role: "editor",
            status: "pending",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ editors: [] }), { status: 200 }));

    const handler = (await import("../../pages/api/gte/[[...path]]")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { path: ["editors", "ed_1", "shares"] },
      body: { email: "player@example.com", role: "editor" },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual(expect.objectContaining({ emailDelivered: false }));
  });

  it("keeps shared access while honoring a recipient's email block", async () => {
    isBlockedMock.mockResolvedValue(true);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        shareId: 13, canvasId: "ed_1", email: "blocked@example.com", role: "viewer", status: "pending",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ editors: [] }), { status: 200 }));

    const handler = (await import("../../pages/api/gte/[[...path]]")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { path: ["editors", "ed_1", "shares"] },
      body: { email: "blocked@example.com", role: "viewer" },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(sendTabShareEmailMock).not.toHaveBeenCalled();
    expect(JSON.parse(res._getData())).toEqual(expect.objectContaining({
      emailDelivered: false,
      emailSuppressed: true,
    }));
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

  it("links a completed transcription to the editor created by its import", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ editors: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, editorId: "ed_imported" }), { status: 200 }));

    const handler = (await import("../../pages/api/gte/[[...path]]")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { path: ["transcriber", "import"] },
      body: { target: "new", sourceJobId: "job_123" },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(updateTabJobMock).toHaveBeenCalledWith({
      where: { userId: "user_1", backendJobId: "job_123" },
      data: { gteEditorId: "ed_imported" },
    });
  });

  it("preserves the requested import canvas so BPM stabilization can run", async () => {
    const canvas = {
      id: "ed_imported",
      version: 3,
      secondsPerBar: 2,
      editors: [],
      timingMap: { version: 2, bars: [] },
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ editors: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, editorId: "ed_imported", canvas }), { status: 200 })
      );

    const handler = (await import("../../pages/api/gte/[[...path]]")).default;
    const { req, res } = createMocks({
      method: "POST",
      query: { path: ["transcriber", "import"] },
      body: { target: "new", includeCanvas: true },
    });

    await handler(req as any, res as any);

    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining({ editorId: "ed_imported", canvas })
    );
  });
});
