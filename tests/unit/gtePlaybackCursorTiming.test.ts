import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(process.cwd(), "components", "GteWorkspace.tsx"),
  "utf8"
);

describe("Canvas playback cursor timing", () => {
  it("does not inherit the global button transform transition", () => {
    const playheadStart = workspaceSource.indexOf('data-gte-playhead="timeline"');
    const playheadSource = workspaceSource.slice(playheadStart, playheadStart + 1800);

    expect(playheadStart).toBeGreaterThan(-1);
    expect(playheadSource).toContain('transition: "none"');
  });

  it("leaves the cursor transform to the audio-clock loop during playback", () => {
    const playheadStart = workspaceSource.indexOf('data-gte-playhead="timeline"');
    const playheadSource = workspaceSource.slice(playheadStart, playheadStart + 1800);

    expect(playheadSource).toContain("transform: effectiveIsPlaying");
    expect(playheadSource).toContain("? undefined");
  });
});
