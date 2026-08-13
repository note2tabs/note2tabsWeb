import { afterEach, describe, expect, it, vi } from "vitest";
import { gteApi } from "../../lib/gteApi";

afterEach(() => vi.unstubAllGlobals());

describe("editor draft concurrency", () => {
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
