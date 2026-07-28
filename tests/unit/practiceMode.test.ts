import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editorPage = fs.readFileSync(
  path.join(process.cwd(), "pages/gte/[editor_id].tsx"),
  "utf8"
);
const workspace = fs.readFileSync(
  path.join(process.cwd(), "components/GteWorkspace.tsx"),
  "utf8"
);

describe("editor practice mode", () => {
  it("offers Canvas, Tab view, and Practice as equal workspace modes", () => {
    expect(editorPage).toContain('"canvas" | "tab" | "practice"');
    expect(editorPage).toContain('setEditorMode("canvas")');
    expect(editorPage).toContain('setEditorMode("tab")');
    expect(editorPage).toContain('setEditorMode("practice")');
    expect(editorPage).toContain('aria-label="Workspace mode"');
  });

  it("collects the existing training controls in the practice workspace", () => {
    expect(editorPage).toContain("Listen, repeat, and build speed");
    expect(editorPage).toContain("Loop {practiceLoopEnabled");
    expect(editorPage).toContain("Metronome {metronomeEnabled");
    expect(editorPage).toContain("Count-in {countInEnabled");
    expect(editorPage).toContain("Speed trainer {speedTrainerEnabled");
    expect(editorPage).toContain('aria-label="Practice playback speed"');
  });

  it("keeps practice controls out of the normal playback toolbar", () => {
    expect(workspace).toContain("practiceControlsVisible?: boolean");
    expect(workspace).toContain("{practiceControlsVisible && (");
    expect(editorPage).toContain(
      "practiceControlsVisible={practiceModeEnabled}"
    );
  });
});
