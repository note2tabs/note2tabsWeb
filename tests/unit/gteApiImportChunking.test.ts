import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectTranscriberRhythmOnsets,
  chunkTranscriberSegmentGroups,
  gteApi,
  TRANSCRIBER_IMPORT_CHUNK_MAX_BYTES,
  TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS,
  type TranscriberSegmentGroup,
} from "../../lib/gteApi";
import { synthesizeTimingMap } from "../../lib/gteTiming";
import type { CanvasSnapshot } from "../../types/gte";

function buildGroup(index: number): TranscriberSegmentGroup {
  return [
    {
      start_time_s: index,
      end_time_s: index + 0.25,
      pitch_midi: 52 + (index % 12),
      amplitude: 0.8,
    },
  ];
}

function buildCanvas(id: string, bpms: number[], offsetFrames: number = 0): CanvasSnapshot {
  const timingMap = synthesizeTimingMap(2, bpms.length * 480, 4, 4);
  timingMap.bars = timingMap.bars.map((bar, index) => ({
    ...bar,
    quarterNoteBpm: bpms[index],
    source: "onset_consensus",
  }));
  return {
    id,
    version: 3,
    secondsPerBar: 2,
    timingMap,
    editors: [{
      id: "lane-1",
      framesPerMessure: 480,
      fps: 240,
      totalFrames: bpms.length * 480,
      timelineOffsetFrames: offsetFrames,
      notes: bpms.map((_, index) => ({
        id: index + 1,
        startTime: index * 480 + 60,
        length: 120,
        midiNum: 60,
        tab: [0, 0],
        optimals: [],
      })),
      chords: [],
      cutPositionsWithCoords: [[[0, bpms.length * 480], [2, 0]]],
      optimalsByTime: {},
      maxFret: 22,
    }],
  };
}

describe("transcriber import chunking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps request chunks under the configured byte and group budgets", () => {
    const groups = Array.from({ length: TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS * 3 + 5 }, (_, index) =>
      buildGroup(index)
    );

    const chunks = chunkTranscriberSegmentGroups(groups);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toHaveLength(groups.length);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS);
      expect(JSON.stringify(chunk).length).toBeLessThanOrEqual(TRANSCRIBER_IMPORT_CHUNK_MAX_BYTES);
    }
  });

  it("collects stable unique onset evidence for every chunk", () => {
    expect(
      collectTranscriberRhythmOnsets(
        [
          [{ start_time_s: 1.25 }, { start_time_s: 0 }],
          [{ start_time_s: 1.25 }, { start_time_s: Number.NaN }],
        ],
        [0.5]
      )
    ).toEqual([0, 0.5, 1.25]);
  });

  it("creates the first chunk directly and appends later chunks as one aligned import", async () => {
    const requests: Array<{ url: string; body: any }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      requests.push({ url: String(url), body });
      const index = requests.length;
      return new Response(
        JSON.stringify({
          ok: true,
          target: index === 1 ? "new" : "existing",
          editorId: "canvas-1",
          importedEditorIds: [`ed-${index}`],
          quantization: { applied: true, enabled: true, subdivision: "1/16" },
          alignment: {
            applied: true,
            mode: "auto",
            appendFrame: 480,
            importGroupId: body.importGroupId,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const groups = Array.from(
      { length: TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS + 1 },
      (_, index) => buildGroup(index)
    );

    const result = await gteApi.importTranscriberToSaved({
      segmentGroups: groups,
      name: "Long import",
      quantization: { enabled: true, subdivision: "1/16" },
      sourceJobId: "job-1",
    });

    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.url === "/api/gte/transcriber/import")).toBe(true);
    expect(requests[0].body.target).toBe("new");
    expect(requests[0].body.editorId).toBeUndefined();
    expect(requests[1].body.target).toBe("existing");
    expect(requests[1].body.editorId).toBe("canvas-1");
    expect(requests[0].body.importGroupId).toBe(requests[1].body.importGroupId);
    expect(requests[0].body.rhythmOnsets).toHaveLength(groups.length);
    expect(requests[1].body.rhythmOnsets).toEqual(requests[0].body.rhythmOnsets);
    expect(requests.every((request) => request.body.alignmentMode === "auto")).toBe(true);
    expect(requests.every((request) => request.body.appendMode === "after_content")).toBe(true);
    expect(requests[0].body.includeCanvas).toBe(false);
    expect(requests[1].body.includeCanvas).toBe(true);
    expect(requests.every((request) => request.body.alignmentStrategy === "track_offset_bars")).toBe(true);
    expect(requests.every((request) => request.body.tempoStabilization?.enabled === true)).toBe(true);
    expect(
      requests.every((request) => request.body.tempoStabilization?.minimumInteriorSegmentBars === 10)
    ).toBe(true);
    expect(
      requests.every((request) => request.body.tempoStabilization?.emptyBarsInheritTempo === true)
    ).toBe(true);
    expect(requests.every((request) => request.body.quantization.enabled === true)).toBe(true);
    expect(result.importedEditorIds).toEqual(["ed-1", "ed-2"]);
  });

  it("removes the bootstrap track from a newly created transcriber canvas", async () => {
    const importedLane = buildCanvas("canvas-1", [120]).editors[0];
    const canvas: CanvasSnapshot = {
      ...buildCanvas("canvas-1", [120]),
      editors: [
        { ...importedLane, id: "lane-default", name: "Track 1", notes: [], chords: [] },
        { ...importedLane, id: "lane-imported", name: "Imported guitar" },
      ],
    };
    const requests: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method || "GET";
      requests.push({ url: String(url), method });
      if (method === "DELETE") {
        return new Response(
          JSON.stringify({
            ok: true,
            removedEditorId: "lane-default",
            canvas: { ...canvas, editors: [canvas.editors[1]] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (method === "PATCH") {
        return new Response(
          JSON.stringify({ ok: true, canvas, timingMap: canvas.timingMap }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          target: "new",
          editorId: "canvas-1",
          importedEditorIds: ["lane-imported"],
          canvas,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gteApi.importTranscriberToSaved({
      target: "new",
      segmentGroups: [buildGroup(0)],
    });

    expect(requests).toContainEqual({
      method: "DELETE",
      url: "/api/gte/editors/canvas-1/canvas/editors/lane-default",
    });
    expect(result.canvas?.editors.map((lane) => lane.id)).toEqual(["lane-imported"]);
  });

  it("preserves an existing canvas tempo while placement remains a lane offset", async () => {
    const existing = buildCanvas("canvas-1", [114, 114]);
    const imported = buildCanvas("canvas-1", [114, 114, 132, 132], 960);
    const requests: Array<{ url: string; method: string; body: any }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url: String(url), method, body });
      if (method === "GET") return new Response(JSON.stringify(existing), { status: 200 });
      if (method === "PATCH") {
        return new Response(
          JSON.stringify({ ok: true, canvas: { ...imported, timingMap: body.timingMap }, timingMap: body.timingMap }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          target: "existing",
          editorId: "canvas-1",
          importedEditorIds: ["lane-1"],
          canvas: imported,
          alignment: { applied: true, mode: "auto", appendFrame: 960, importGroupId: "group-1" },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gteApi.importTranscriberToSaved({
      target: "existing",
      editorId: "canvas-1",
      segmentGroups: [buildGroup(0)],
    });

    const importRequest = requests.find((request) => request.method === "POST")!;
    const timingPatch = requests.find((request) => request.method === "PATCH")!;
    expect(importRequest.body.alignmentStrategy).toBe("track_offset_bars");
    expect(importRequest.body.tempoStabilization.existingCanvasTiming).toBe("preserve");
    expect(timingPatch.body.timingMap.bars.map((bar: any) => bar.quarterNoteBpm)).toEqual([
      114, 114, 114, 114,
    ]);
    expect(result.canvas?.editors[0].timelineOffsetFrames).toBe(960);
  });
});
