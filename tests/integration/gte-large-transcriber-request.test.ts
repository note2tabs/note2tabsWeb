import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBody } from "next/dist/server/api-utils/node/parse-body";
import { gteApi } from "../../lib/gteApi";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("../../lib/prisma", () => ({ prisma: {} }));

describe("large transcription API request parsing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["saved", "guest"] as const)("accepts a long track through the real Next parser for %s editors", async (kind) => {
    const route = kind === "saved" ? await import("../../pages/api/gte/[[...path]]") : await import("../../pages/api/gte-guest/[[...path]]");
    const config = (route as { config?: { api?: { bodyParser?: { sizeLimit?: string } } } }).config;
    const limit = config?.api?.bodyParser?.sizeLimit ?? "1mb";
    if (limit !== "4mb") throw new Error("Expected bounded 4mb parser configuration");
    const segments = Array.from({ length: 5334 }, (_, i) => ({
      start_time_s: i * 0.0712345, end_time_s: i * 0.0712345 + 0.125639,
      pitch_midi: 40 + i % 35, amplitude: 0.75231456789, pitch_bend: [0, 0, 1, 0],
    }));
    let bytes = 0;
    const fetcher = vi.fn(async (_url, init) => {
      const body = String(init.body);
      bytes = Buffer.byteLength(body);
      const request = Readable.from([body]) as any;
      request.headers = { "content-type": "application/json", "content-length": String(bytes) };
      try {
        const parsed = await parseBody(request, limit);
        expect(parsed.tracks[0].segments).toHaveLength(5334);
        expect(parsed.segmentGroups[0]).toHaveLength(5334);
        return new Response(JSON.stringify({ editorId: "editor_test", importedEditorIds: ["lane_test"] }), { status: 200 });
      } catch (error: any) {
        return new Response(error.message, { status: error.statusCode ?? 500 });
      }
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(gteApi.importTranscriberToSaved({
      name: "Test recording", segmentGroups: [segments],
      tracks: [{ name: "Guitar", trackType: "tab", instrumentId: "acoustic", segments }],
      quantize: true,
    })).resolves.toMatchObject({ editorId: "editor_test" });
    expect(bytes).toBeGreaterThan(1024 * 1024);
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each(["saved", "guest"] as const)("retains a bounded request limit for %s editors", async (kind) => {
    const route = kind === "saved" ? await import("../../pages/api/gte/[[...path]]") : await import("../../pages/api/gte-guest/[[...path]]");
    const limit = route.config.api.bodyParser.sizeLimit;
    if (limit !== "4mb") throw new Error("Expected bounded 4mb parser configuration");
    const body = JSON.stringify({ oversized: "x".repeat(4 * 1024 * 1024) });
    const request = Readable.from([body]) as any;
    request.headers = { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) };
    await expect(parseBody(request, limit)).rejects.toMatchObject({ statusCode: 413 });
  });

});
