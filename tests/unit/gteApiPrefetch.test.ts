import { afterEach, describe, expect, it, vi } from "vitest";
import { gteApi, optimizeImportedTrackFingerings } from "../../lib/gteApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("editor snapshot prefetching", () => {
  it("hands the confirmed import save to the first editor load without another GET", async () => {
    const source = { id: "import-handoff", version: 1, editors: [] };
    const confirmed = { ...source, version: 2 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, canvas: confirmed }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...confirmed, version: 3 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {});
    await optimizeImportedTrackFingerings(source.id, source);
    expect(window.__note2tabsEditorBootstrap?.editorId).toBe(source.id);
    await expect(gteApi.getEditor(source.id)).resolves.toEqual(confirmed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.__note2tabsEditorBootstrap).toBeUndefined();
    // Handoff is single-use: later reopens fetch current server state.
    await expect(gteApi.getEditor(source.id)).resolves.toEqual({ ...confirmed, version: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("reuses an intent-prefetched snapshot for the following editor load", async () => {
    const snapshot = {
      id: "editor-prefetch",
      name: "Prefetched",
      editors: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const prefetched = gteApi.prefetchEditor("editor-prefetch");
    const loaded = gteApi.getEditor("editor-prefetch");

    await expect(prefetched).resolves.toEqual(snapshot);
    await expect(loaded).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gte/editors/editor-prefetch",
      {}
    );
  });

  it("drops a failed prefetch so navigation can retry normally", async () => {
    const snapshot = {
      id: "editor-retry",
      name: "Recovered",
      editors: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(gteApi.prefetchEditor("editor-retry")).rejects.toThrow(
      "temporarily unavailable"
    );
    await expect(gteApi.getEditor("editor-retry")).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("consumes a document-start request instead of starting a hydration waterfall", async () => {
    const snapshot = {
      id: "editor-bootstrap",
      name: "Already loading",
      editors: [],
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      __note2tabsEditorBootstrap: {
        editorId: "editor-bootstrap",
        promise: Promise.resolve({
          ok: true,
          status: 200,
          text: JSON.stringify(snapshot),
        }),
      },
    });

    await expect(gteApi.getEditor("editor-bootstrap")).resolves.toEqual(snapshot);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
