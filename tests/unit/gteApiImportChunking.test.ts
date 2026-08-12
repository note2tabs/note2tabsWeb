import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectTranscriberRhythmOnsets,
  chunkTranscriberSegmentGroups,
  gteApi,
  TRANSCRIBER_IMPORT_CHUNK_MAX_BYTES,
  TRANSCRIBER_IMPORT_CHUNK_MAX_GROUPS,
  type TranscriberSegmentGroup,
} from "../../lib/gteApi";

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
    expect(requests.every((request) => request.body.quantization.enabled === true)).toBe(true);
    expect(result.importedEditorIds).toEqual(["ed-1", "ed-2"]);
  });
});
