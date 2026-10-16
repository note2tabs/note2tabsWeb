import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { mergeNotesIntoChordLocal } from "../../lib/gteLocalEditorOps";
import type { EditorSnapshot } from "../../types/gte";

const fixture = (): EditorSnapshot => ({
  id: "merge-test", fps: 240, framesPerMessure: 480, totalFrames: 960, cutPositionsWithCoords: [], optimalsByTime: {},
  notes: [
    { id: 1, startTime: 450, length: 200, midiNum: 67, tab: [2, 12], optimals: [], velocity: 85, pitchBend: [0, 1] },
    { id: 2, startTime: 100, length: 20, midiNum: 60, tab: [1, 1], optimals: [] },
  ],
  chords: [{ id: 9, startTime: 480, length: 120, originalMidi: [60, 64], currentTabs: [[1, 1], [0, 0]], ogTabs: [[1, 1], [0, 0]], velocities: [80, 90] }],
  noteEffects: [],
});

describe("merge standalone notes into an existing chord", () => {
  it("keeps chord identity, appends the note once, and retains unrelated content", () => {
    const snapshot = fixture();
    const before = structuredClone(snapshot);
    const merged = mergeNotesIntoChordLocal(snapshot, 9, [1, 1]);
    expect(merged.chords).toHaveLength(1);
    expect(merged.chords[0]).toMatchObject({ id: 9, startTime: 450, length: 200, currentTabs: [[1, 1], [0, 0], [2, 12]], originalMidi: [60, 64, 67], velocities: [80, 90, 85], pitchBends: [[], [], [0, 1]] });
    expect(merged.notes.map((note) => note.id)).toEqual([2]);
    expect(snapshot).toEqual(before);
  });
  it("retains repeated pitches and covers the full selected timing range", () => {
    const snapshot = fixture();
    const chord = mergeNotesIntoChordLocal(snapshot, 9, [1, 2]).chords[0];
    expect(chord.startTime).toBe(100);
    expect(chord.startTime + chord.length).toBe(650);
    expect(chord.currentTabs).toHaveLength(4);
    expect(chord.originalMidi).toEqual([60, 64, 67, 60]);
  });
  it("ignores missing selections and keeps bass lane behavior unchanged", () => {
    const snapshot = fixture();
    expect(mergeNotesIntoChordLocal(snapshot, 999, [1])).toEqual(snapshot);
    expect(mergeNotesIntoChordLocal(snapshot, 9, [999])).toEqual(snapshot);
    snapshot.trackType = "bass";
    snapshot.editorType = "bass";
    expect(mergeNotesIntoChordLocal(snapshot, 9, [1])).toEqual(snapshot);
  });
  it("removes only effects whose standalone notes have joined the chord", () => {
    const snapshot = fixture();
    snapshot.noteEffects = [
      { id: 1, type: 1, startNoteId: 1, endNoteId: 2, noteEffectLabel: "slide" },
      { id: 2, type: 1, startNoteId: 2, endNoteId: 2, noteEffectLabel: "bend" },
    ];
    expect(mergeNotesIntoChordLocal(snapshot, 9, [1]).noteEffects?.map((effect) => effect.id)).toEqual([2]);
  });
  it("uses the local mutation path for note + chord instead of disbanding on the server", () => {
    const source = readFileSync("components/GteWorkspace.tsx", "utf8");
    const ast = ts.createSourceFile("GteWorkspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let action = "";
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleMakeChord") action = node.initializer!.getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    const snapshot = fixture();
    const api = { applySnapshot: vi.fn(), makeChord: vi.fn(), disbandChord: vi.fn() };
    const context = { bassLane: false, activeChordIds: [9], selectedNoteIds: [1], resolveChordId: (id: number) => id, resolveNoteId: (id: number) => id,
      snapshotRef: { current: snapshot }, mergeNotesIntoChordLocal, editorId: "merge-test", gteApi: api, setSelectedNoteIds: vi.fn(), setSelectedChordIds: vi.fn(),
      runMutation: vi.fn((_commit, options) => options.localApply(snapshot)),
    };
    vm.runInNewContext(ts.transpileModule(`(${action})()`, {}).outputText, context);
    expect(snapshot.chords[0].currentTabs).toHaveLength(3);
    expect(snapshot.notes.map((note) => note.id)).toEqual([2]);
    expect(context.runMutation).toHaveBeenCalledOnce();
    expect(api.disbandChord).not.toHaveBeenCalled();
    expect(api.makeChord).not.toHaveBeenCalled();
    expect(api.applySnapshot).not.toHaveBeenCalled();
  });
});
