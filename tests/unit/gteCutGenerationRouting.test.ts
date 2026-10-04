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
  it("routes generation and whole-track fingering optimization through the frontend backend-port", () => {
    expect(workspace).toContain("generatePlayingCoordinatesInSnapshot(optimized)");
    expect(workspace).toContain("localApply: generatePlayingCoordinatesInSnapshot");
    expect(workspace).not.toContain("gteApi.generateCuts");
  });

  it("keeps the guest canvas clone path and has no simplistic local fallback", () => {
    expect(guestApi).toContain("ensureUpstreamGuestCanvas(sessionId, canvas)");
    expect(guestApi).toContain("/cuts/generate`");
    expect(guestApi).not.toContain("const generateCuts =");
    expect(guestApi).not.toContain("applied local fallback");
  });
});
