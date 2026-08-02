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
const globalStyles = fs.readFileSync(
  path.join(process.cwd(), "styles/globals.css"),
  "utf8"
);

describe("editor practice mode", () => {
  it("keeps play and rate hidden behind its frontend feature flag", () => {
    expect(editorPage).toContain("const PRACTICE_RATING_UI_ENABLED = false");
    expect(editorPage).toContain(
      "PRACTICE_RATING_UI_ENABLED && practiceRatingReplaysForLane.length > 0"
    );
    expect(editorPage).toContain(
      'PRACTICE_RATING_UI_ENABLED && practiceRatingState === "countdown"'
    );
  });

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
    expect(editorPage).toContain("{canvas.editors.map((candidate, candidateIndex) => {");
  });

  it("selects every bar between the anchor and a shift-click in practice", () => {
    expect(workspace).toContain(
      "const rangeSelect = event.shiftKey && (isActive || practiceMode)"
    );
    expect(workspace).toContain("{ length: end - start + 1 }");
    expect(workspace).toContain("(_, offset) => start + offset");
  });

  it("keeps playback sound controls available in practice", () => {
    expect(editorPage).toContain('aria-label="Practice instrument"');
    expect(editorPage).toContain("toggleTrackMute(practiceSoundLaneId)");
    expect(editorPage).toContain("toggleTrackIsolation(practiceSoundLaneId)");
    expect(editorPage).toContain("handleTrackVolumeChange(practiceSoundLaneId");
    expect(editorPage).toContain("handleTrackPanChange(practiceSoundLaneId");
  });

  it("supports standalone chord tracks and chord overlays in practice", () => {
    expect(editorPage).toContain('aria-label="Chord overlay"');
    expect(editorPage).toContain("practiceChordOverlayLaneId");
    expect(editorPage).toContain("practiceChordOverlay={");
    expect(editorPage).toContain("`Track ${candidateIndex + 1} · Chords`");
    expect(workspace).toContain("practiceChordOverlay?: EditorSnapshot | null");
    expect(workspace).toContain("practiceChordOverlayItems");
    expect(workspace).toContain("getPracticeChordFingering");
    expect(workspace).toContain("gteApi.getChordFingerings(lookup.root, lookup.type)");
    expect(workspace).toContain("practiceChordFingeringsByKey[lookup.key]");
    expect(workspace).toContain("group-hover:visible");
    expect(workspace).toContain(
      "top: TIMELINE_BAR_HEADER_HEIGHT + editorTabView.height + 2"
    );
    expect(workspace).toContain("border-slate-300 bg-slate-100");
    expect(workspace).not.toContain("border-violet-200 bg-violet-50");
    expect(editorPage).toContain("`Track ${trackNumber} · ${chordLane.name");
    expect(editorPage).toContain("`Track ${candidateIndex + 1} · Chords`");
  });

  it("exposes per-tab sound controls inside the practice tab selector", () => {
    expect(editorPage).toContain("Sound controls for");
    expect(editorPage).toContain("toggleTrackMute(candidateId)");
    expect(editorPage).toContain("toggleTrackIsolation(candidateId)");
    expect(editorPage).toContain("handleTrackVolumeChange(candidateId");
    expect(editorPage).toContain('className="w-12 shrink-0 accent-slate-700"');
    expect(editorPage).not.toContain('aria-label={`Pan for ${candidate.name');
  });

  it("enables looping when speed trainer is turned on", () => {
    expect(editorPage).toContain("const toggleSpeedTrainer = useCallback");
    expect(editorPage).toContain("setPracticeLoopEnabled(true)");
    expect(editorPage).toContain("practiceLoopEnabledRef.current = true");
  });

  it("runs speed training from a configured start and restores the previous speed", () => {
    expect(editorPage).toContain('aria-label="Speed trainer start"');
    expect(editorPage).toContain("SPEED_TRAINER_START_OPTIONS.filter");
    expect(editorPage).toContain("speedTrainerOriginalSpeedRef.current = normalizedPlaybackSpeed");
    expect(editorPage).toContain("setPlaybackSpeed(nextSpeed)");
    expect(editorPage).toContain("resetSpeedTrainerSession()");
    expect(editorPage).toContain("runPlaybackSpeed >= normalizePlaybackSpeed(speedTrainerTarget)");
    expect(editorPage).toContain("globalPracticeLoopRange.startFrame, startSpeed");
    expect(editorPage).toContain('className="grid grid-cols-1 gap-1.5"');
  });

  it("provides focused, persistent practice utilities", () => {
    expect(editorPage).toContain("note2tabs:practice:");
    expect(editorPage).toContain("Bluetooth pedals that send arrow or Page keys");
    expect(editorPage).toContain("requestFullscreen()");
    expect(editorPage).toContain("Count-in bars");
    expect(editorPage).toContain("Metronome volume");
    expect(editorPage).not.toContain("<PracticeFretboard");
    expect(workspace).toContain("practiceFocusBarRange");
    expect(workspace).toContain("practiceDisplayStartBar");
  });

  it("keeps shortcuts and bar-selection guidance on the right in practice", () => {
    expect(editorPage).toContain("const renderPracticeHelp = () => (");
    expect(editorPage).toContain("Practice shortcuts");
    expect(editorPage).toContain("min-[1400px]:right-[max(1rem,calc(50vw-700px))]");
    expect(editorPage).toContain("Select one or more bars for playback");
    expect(editorPage).toContain("Shift-click another bar");
  });

  it("paints the full viewport with the app background in fullscreen", () => {
    expect(editorPage).toContain('"gte-practice-fullscreen overflow-y-auto"');
    expect(globalStyles).toContain(".gte-practice-fullscreen::backdrop");
    expect(globalStyles).toContain("min-height: 100dvh");
    expect(globalStyles).toContain("background: var(--bg)");
  });
});
