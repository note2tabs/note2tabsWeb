import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspace = fs.readFileSync(
  path.join(process.cwd(), "components/GteWorkspace.tsx"),
  "utf8"
);
const guestApi = fs.readFileSync(
  path.join(process.cwd(), "pages/api/gte-guest/[[...path]].ts"),
  "utf8"
);

describe("smart playing-coordinate generation routing", () => {
  it("routes generation and whole-track fingering optimization through the same backend generator", () => {
    expect(workspace).not.toContain("generateCutsInSnapshot");
    expect(workspace).toContain("const generated = await requestGeneratedPlayingCoordinates()");
    expect(workspace).toContain("runMutation(requestGeneratedPlayingCoordinates");
  });

  it("keeps the guest canvas clone path and has no simplistic local fallback", () => {
    expect(guestApi).toContain("ensureUpstreamGuestCanvas(sessionId, canvas)");
    expect(guestApi).toContain("/cuts/generate`");
    expect(guestApi).not.toContain("const generateCuts =");
    expect(guestApi).not.toContain("applied local fallback");
  });
});
