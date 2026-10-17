import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { getTransposeBounds, transposeSelectionFrets } from "../../lib/gteTranspose";
import type { EditorSnapshot } from "../../types/gte";

const fixture = (): EditorSnapshot => ({ id: "transpose", fps: 240, framesPerMessure: 480, totalFrames: 480, cutPositionsWithCoords: [], optimalsByTime: {},
  notes: [{ id: 1, startTime: 50, length: 100, tab: [0, 5], midiNum: 69, optimals: [[1, 10]], velocity: 90, pitchBend: [0, 1] },
    { id: 2, startTime: 0, length: 20, tab: [1, 0], midiNum: 59, optimals: [] }],
  chords: [{ id: 1, startTime: 100, length: 80, currentTabs: [[2, 3], [3, 12]], ogTabs: [[2, 3], [3, 12]], originalMidi: [58, 62], velocities: [80, 90] }],
  noteEffects: [],
});

describe("transpose selection", () => {
  it("shifts selected notes and chords uniformly without touching strings or timing", () => {
    const snapshot = fixture(), before = structuredClone(snapshot);
    const result = transposeSelectionFrets(snapshot, [1], [1], 2, 22)!;
    expect(result.notes[0]).toMatchObject({ tab: [0, 7], midiNum: 71, startTime: 50, length: 100, velocity: 90, pitchBend: [0, 1], optimals: [] });
    expect(result.chords[0]).toMatchObject({ currentTabs: [[2, 5], [3, 14]], startTime: 100, length: 80, velocities: [80, 90] });
    expect(result.notes[1]).toEqual(snapshot.notes[1]);
    expect(snapshot).toEqual(before);
  });
  it("bounds the entire group, never clamping individual members independently", () => {
    const snapshot = fixture();
    expect(getTransposeBounds(snapshot, [1], [1], 22)).toEqual({ min: -3, max: 10 });
    expect(transposeSelectionFrets(snapshot, [1], [1], -4, 22)).toBeNull();
    expect(transposeSelectionFrets(snapshot, [1], [1], 11, 22)).toBeNull();
    expect(transposeSelectionFrets(snapshot, [1], [1], -3, 22)?.chords[0].currentTabs).toEqual([[2, 0], [3, 9]]);
    expect(transposeSelectionFrets(snapshot, [1], [1], 10, 22)?.chords[0].currentTabs).toEqual([[2, 13], [3, 22]]);
  });
  it("rejects fractional offsets and empty selections, and preserves zero-offset content", () => {
    const snapshot = fixture();
    expect(transposeSelectionFrets(snapshot, [], [], 1, 22)).toBeNull();
    expect(transposeSelectionFrets(snapshot, [1], [], 1.5, 22)).toBeNull();
    expect(transposeSelectionFrets(snapshot, [1], [1], 0, 22)).toEqual(snapshot);
  });
  it("commits the entire selection in one edit, with no edit for zero or invalid offsets", () => {
    const source = readFileSync("components/GteWorkspace.tsx", "utf8");
    const ast = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let action = "";
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "commitTranspose") action = node.initializer!.getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const offset of ["2", "0", "-4", "11", "-"]) {
      const snapshot = fixture();
      const runMutation = vi.fn((_commit, options) => options.localApply(snapshot));
      const close = vi.fn();
      vm.runInNewContext(ts.transpileModule(`(${action})()`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, {
        transposeInput: offset, transposeNoteIds: new Set([1]), transposeChordIds: new Set([1]),
        snapshotRef: { current: snapshot }, maxFret: 22, transposeSelectionFrets,
        setTransposeToolActive: close, runMutation,
      });
      expect(runMutation).toHaveBeenCalledTimes(offset === "2" ? 1 : 0);
      expect(snapshot.notes[0].tab[1]).toBe(offset === "2" ? 7 : 5);
      expect(snapshot.chords[0].currentTabs[0][1]).toBe(offset === "2" ? 5 : 3);
      expect(close).toHaveBeenCalledTimes(offset === "2" || offset === "0" ? 1 : 0);
    }
  });
});
