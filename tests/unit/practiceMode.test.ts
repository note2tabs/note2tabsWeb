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
    expect(editorPage).toContain(">Practice<");
    expect(editorPage).toContain("Loop {practiceLoopEnabled");
    expect(editorPage).toContain("Metronome {metronomeEnabled");
    expect(editorPage).toContain("<span>Count-in</span>");
    expect(editorPage).toContain("<span>Speed trainer</span>");
    expect(editorPage).toContain('aria-label="Practice playback speed"');
  });

  it("keeps practice controls out of the normal playback toolbar", () => {
    expect(workspace).toContain("practiceControlsVisible?: boolean");
    expect(workspace).toContain("{practiceControlsVisible && (");
    expect(editorPage).toContain(
      "practiceControlsVisible={false}"
    );
  });

  it("turns practice into a focused paper-like reading surface", () => {
    expect(editorPage).toContain("min-h-[1050px]");
    expect(editorPage).toContain("max-w-[900px]");
    expect(editorPage).toContain("Math.min(timelineZoomPercent / 100, 0.5)");
    expect(editorPage).toContain("practiceMode={practiceModeEnabled}");
    expect(workspace).toContain('practiceMode ? "rounded-none border-0"');
    expect(workspace).toContain("data-gte-practice-score");
    expect(workspace).toContain("practiceScoreWidth > 0");
    expect(workspace).toContain("scrollIntoView");
  });

  it("shows only the chosen track while practising", () => {
    expect(editorPage).toContain("Switch practice track. Current track:");
    expect(editorPage).toContain('aria-label="Choose a track to practice"');
    expect(editorPage).toContain(
      "practiceModeEnabled && laneId !== globalControlsLaneId"
    );
  });

  it("keeps playback sound controls available in practice", () => {
    expect(editorPage).toContain('aria-label="Practice instrument"');
    expect(editorPage).toContain("toggleTrackMute(practiceLaneId)");
    expect(editorPage).toContain("toggleTrackIsolation(practiceLaneId)");
    expect(editorPage).toContain("handleTrackVolumeChange(practiceLaneId");
    expect(editorPage).toContain("handleTrackPanChange(practiceLaneId");
  });

  it("enables looping when speed trainer is turned on", () => {
    expect(editorPage).toContain("if (next) setPracticeLoopEnabled(true)");
  });

  it("provides focused, persistent practice utilities", () => {
    expect(editorPage).toContain("note2tabs:practice:");
    expect(editorPage).toContain("Bluetooth pedals that send arrow or Page keys");
    expect(editorPage).toContain("requestFullscreen()");
    expect(editorPage).toContain("Count-in bars");
    expect(editorPage).toContain("Metronome volume");
    expect(editorPage).toContain("<PracticeFretboard");
    expect(workspace).toContain("practiceFocusBarRange");
    expect(workspace).toContain("practiceDisplayStartBar");
  });
});
