import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";
import handler from "../../pages/api/gte-guest/[[...path]]";
import type { CanvasSnapshot } from "../../types/gte";

const SESSION_ID = "guest-drum-track-test";

function request(method: "GET" | "POST", path: string[], body?: Record<string, unknown>) {
  const { req, res } = createMocks({ method, query: { path }, body });
  req.cookies = { note2tabs_gte_guest_session: SESSION_ID };
  handler(req, res);
  return res;
}

describe("GTE guest drum tracks", () => {
  it("preserves a newly created drum lane through normalization and reload", () => {
    request("GET", ["editors", "local"]);
    const createResponse = request(
      "POST",
      ["editors", "local", "canvas", "editors"],
      { editorType: "drums", name: "Drums" }
    );
    const created = createResponse._getJSONData() as {
      canvas: CanvasSnapshot;
      editor: CanvasSnapshot["editors"][number];
    };

    expect(createResponse.statusCode).toBe(200);
    expect(created.editor).toMatchObject({
      editorType: "drums",
      type: "drums",
      trackType: "drums",
    });

    const reloadResponse = request("GET", ["editors", "local"]);
    const reloaded = reloadResponse._getJSONData() as CanvasSnapshot;
    expect(reloaded.editors.at(-1)).toMatchObject({
      editorType: "drums",
      type: "drums",
      trackType: "drums",
    });
  });
});
