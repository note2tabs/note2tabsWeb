import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";
import handler from "../../pages/api/gte-guest/[[...path]]";
import type { CanvasSnapshot } from "../../types/gte";

const SESSION_ID = "guest-key-persistence-test";

function request(method: "GET" | "POST", path: string[], body?: Record<string, unknown>) {
  const { req, res } = createMocks({
    method,
    query: { path },
    body,
  });
  req.cookies = { note2tabs_gte_guest_session: SESSION_ID };
  handler(req, res);
  return res;
}

describe("GTE guest key persistence", () => {
  it("preserves the selected key through snapshot saves and subsequent loads", () => {
    const initialResponse = request("GET", ["editors", "local"]);
    const initialCanvas = initialResponse._getJSONData() as CanvasSnapshot;

    const saveResponse = request("POST", ["editors", "local", "snapshot"], {
      snapshot: {
        ...initialCanvas,
        keyBase: 7,
        keyType: 4,
      },
    });
    const saved = saveResponse._getJSONData() as {
      canvas: CanvasSnapshot;
      snapshot: CanvasSnapshot;
    };

    expect(saveResponse.statusCode).toBe(200);
    expect(saved.canvas).toMatchObject({ keyBase: 7, keyType: 4 });
    expect(saved.snapshot).toMatchObject({ keyBase: 7, keyType: 4 });

    const reloadResponse = request("GET", ["editors", "local"]);
    expect(reloadResponse.statusCode).toBe(200);
    expect(reloadResponse._getJSONData()).toMatchObject({
      keyBase: 7,
      keyType: 4,
    });
  });
});
