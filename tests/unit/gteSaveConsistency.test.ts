import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editorPage = fs.readFileSync(
  path.join(process.cwd(), "pages/gte/[editor_id].tsx"),
  "utf8"
);

describe("editor save consistency", () => {
  it("does not replace optimistic notes with an older commit response", () => {
    expect(editorPage).not.toContain("normalizeCanvas(res.snapshot, editorId)");
    expect(editorPage).toContain(
      "setLastCommittedAt(res.snapshot?.updatedAt || new Date().toISOString())"
    );
  });

  it("invalidates in-flight canvas saves as soon as a lane changes", () => {
    const handler = editorPage.slice(
      editorPage.indexOf("const handleLaneSnapshotChange ="),
      editorPage.indexOf("const handleLaneInstrumentChange =")
    );

    expect(handler).toContain("canvasRevisionRef.current += 1");
    expect(handler.indexOf("canvasRevisionRef.current += 1")).toBeLessThan(
      handler.indexOf("setCanvas((prev)")
    );
  });
});
