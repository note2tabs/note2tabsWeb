import { afterEach, describe, expect, it, vi } from "vitest";
import { gteApi } from "../../lib/gteApi";

afterEach(() => vi.unstubAllGlobals());

describe("editor draft concurrency", () => {
  it("requests a track-only autosave response only for authenticated lane saves with merge context", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ok: true, snapshot: {}}))));
    vi.stubGlobal("fetch", fetchMock);
    await gteApi.applySnapshot("canvas__ed__ed-2", {notes: []}, {baseSnapshot: {notes: []}});
    expect(fetchMock.mock.calls[0][0]).toBe("/api/gte/editors/canvas__ed__ed-2/snapshot?lane_only=true");
    await gteApi.applySnapshot("canvas__ed__ed-2", {notes: []});
    expect(fetchMock.mock.calls[1][0]).toBe("/api/gte/editors/canvas__ed__ed-2/snapshot");
    await gteApi.applySnapshot("canvas", {editors: []}, {baseSnapshot: {editors: []}});
    expect(fetchMock.mock.calls[2][0]).toBe("/api/gte/editors/canvas/snapshot");
  });
  it("sends version guards only when the caller opts in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, snapshot: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await gteApi.applySnapshot(
      "canvas-1",
      { id: "canvas-1", editors: [] },
      { expectedVersion: 7, expectedDraftRevision: 12 }
    );

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      snapshot: { id: "canvas-1", editors: [] },
      expectedVersion: 7,
      expectedDraftRevision: 12,
    });
  });
});
