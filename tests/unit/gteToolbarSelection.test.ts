import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("components/GteWorkspace.tsx", "utf8");
const selectionCode = source.slice(source.indexOf("  const allTrackEventsSelected = useMemo"), source.indexOf("  const handleMergeCutBoundary ="));

describe("toolbar select-all toggle", () => {
  it.each([
    { notes: [1, 2], chords: [3], selectedNotes: [1], selectedChords: [3], all: false },
    { notes: [1, 2], chords: [3], selectedNotes: [1, 2], selectedChords: [3], all: true },
    { notes: [1], chords: [], selectedNotes: [1], selectedChords: [], all: true },
    { notes: [], chords: [3], selectedNotes: [], selectedChords: [3], all: true },
    { notes: [1], chords: [], selectedNotes: [99], selectedChords: [], all: false },
    { notes: [], chords: [], selectedNotes: [], selectedChords: [], all: false },
  ])("detects full track selection: $notes / $chords / $all", ({ notes, chords, selectedNotes, selectedChords, all }) => {
    const setSelectedNoteIds = vi.fn(), setSelectedChordIds = vi.fn();
    const compiled = ts.transpileModule(`${selectionCode}\n({ allTrackEventsSelected, toggleSelectAllTrackEvents });`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const result = vm.runInNewContext(compiled, {
      useMemo: (fn: () => unknown) => fn(), snapshot: { notes: notes.map((id) => ({ id })), chords: chords.map((id) => ({ id })) },
      selectedNoteIds: selectedNotes, selectedChordIds: selectedChords,
      setSelectedNoteIds, setSelectedChordIds, setSelectedNoteEffectId: vi.fn(), setSelectedCutBoundaryIndex: vi.fn(), setKeyboardCursorVisible: vi.fn(),
    });
    expect(result.allTrackEventsSelected).toBe(all);
    result.toggleSelectAllTrackEvents();
    expect(setSelectedNoteIds).toHaveBeenCalledWith(all ? [] : notes);
    expect(setSelectedChordIds).toHaveBeenCalledWith(all ? [] : chords);
  });
  it("places the slashed deselect variant after the final effect tool", () => {
    const toolbar = source.slice(source.indexOf('{ label: "Slide", path: ""'));
    expect(toolbar.indexOf('label: allTrackEventsSelected ? "Deselect all" : "Select all"')).toBeGreaterThan(0);
    expect(toolbar).toContain('allTrackEventsSelected ? "M3 21 21 3" : ""');
  });
});
