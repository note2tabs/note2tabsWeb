import { describe, expect, it } from "vitest";
import { toolAllowsSelection, toolSelectionRule, TOOLBAR_SELECTION_TOOLS, type PendingSelectionTool } from "../../lib/gteToolSelection";
import type { EditorSnapshot } from "../../types/gte";

const fixture = (): EditorSnapshot => ({ id: "rules", fps: 240, framesPerMessure: 480, totalFrames: 960, cutPositionsWithCoords: [], optimalsByTime: {},
  notes: [
    { id: 1, startTime: 0, length: 60, tab: [0, 0], midiNum: 64, optimals: [] },
    { id: 2, startTime: 100, length: 60, tab: [0, 3], midiNum: 67, optimals: [] },
    { id: 3, startTime: 200, length: 60, tab: [5, 0], midiNum: 40, optimals: [] },
  ], chords: [
    { id: 1, startTime: 400, length: 60, currentTabs: [[0, 0], [1, 1]], ogTabs: [[0, 0], [1, 1]], originalMidi: [64, 60] },
    { id: 2, startTime: 500, length: 60, currentTabs: [[0, 3], [1, 3]], ogTabs: [[0, 3], [1, 3]], originalMidi: [67, 62] },
  ],
});
const rule = (tool: PendingSelectionTool, notes: number[], chords: number[] = []) => toolSelectionRule(tool, fixture(), notes, chords).valid;
describe("tool-specific selection rules", () => {
  it.each(Object.values(TOOLBAR_SELECTION_TOOLS))("requires an eligible selection for %s", (tool) => {
    expect(rule(tool, [])).toBe(false);
    expect(toolSelectionRule(tool, fixture(), [], []).hint.length).toBeGreaterThan(0);
  });
  it("requires multiple objects for merge-to-chord, including note+chord or chord+chord", () => {
    expect(rule("merge-chord", [1])).toBe(false);
    expect(rule("merge-chord", [], [1])).toBe(false);
    expect(rule("merge-chord", [1, 2])).toBe(true);
    expect(rule("merge-chord", [1], [1])).toBe(true);
    expect(rule("merge-chord", [], [1, 2])).toBe(true);
  });
  it("disbands chords only, snaps notes and chords, and merges notes only with a same-string pair", () => {
    expect(toolAllowsSelection("disband", "note")).toBe(false);
    expect(rule("disband", [], [1, 2])).toBe(true);
    expect(rule("disband", [1], [1])).toBe(false);
    expect(rule("snap-key", [1])).toBe(true);
    expect(rule("snap-key", [], [1])).toBe(true);
    expect(rule("snap-key", [1], [1])).toBe(true);
    expect(toolAllowsSelection("snap-key", "chord")).toBe(true);
    expect(rule("merge-notes", [1, 3])).toBe(false);
    expect(rule("merge-notes", [1, 2])).toBe(true);
  });
  it.each(["bend", "slide", "hammer-pull"] as const)("requires compatible standalone pitches for %s", (tool) => {
    expect(rule(tool, [1])).toBe(false);
    expect(rule(tool, [1, 2])).toBe(true);
    expect(rule(tool, [1, 3])).toBe(false);
    expect(rule(tool, [1, 2], [1])).toBe(false);
    expect(toolAllowsSelection(tool, "chord")).toBe(false);
    const simultaneous = fixture(); simultaneous.notes[1].startTime = 0;
    expect(toolSelectionRule(tool, simultaneous, [1, 2], []).valid).toBe(false);
    const blocked = fixture(); blocked.notes.push({ ...blocked.notes[0], id: 4, startTime: 80, length: 10 });
    expect(toolSelectionRule(tool, blocked, [1, 2], []).valid).toBe(false);
    expect(toolSelectionRule(tool, blocked, [1, 2, 4], []).valid).toBe(true);
  });
  it.each(["quantize", "scale", "move", "subdivide", "transpose"] as const)("accepts notes, chords, and mixed selections for %s", (tool) => {
    expect(rule(tool, [1])).toBe(true);
    expect(rule(tool, [], [1])).toBe(true);
    expect(rule(tool, [1], [1])).toBe(true);
  });
});
