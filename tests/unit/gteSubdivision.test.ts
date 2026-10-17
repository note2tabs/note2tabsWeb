import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { buildSubdivisionPlan, subdivideSelection } from "../../lib/gteSubdivision";
import type { EditorSnapshot, Note } from "../../types/gte";

const note = (id: number, startTime: number, length: number): Note => ({ id, startTime, length, midiNum: 64, tab: [0, 0], optimals: [], velocity: 90, pitchBend: [0, 1] });
const fixture = (): EditorSnapshot => ({ id: "subdivide", fps: 240, framesPerMessure: 480, totalFrames: 960, cutPositionsWithCoords: [], optimalsByTime: {},
  notes: [note(1, 0, 60), note(2, 40, 60), note(3, 90, 30), note(4, 200, 90), note(5, 20, 250)],
  chords: [], noteEffects: [],
});

describe("subdivision input mode", () => {
  it("supports digit typing, wheel adjustment, Enter/click apply and Escape cancellation", () => {
    const source = readFileSync("components/GteWorkspace.tsx", "utf8");
    const ast = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let effect = "";
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("const setCount = (text: string)")) effect = node.arguments[0].getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    const listeners: Record<string, (event: unknown) => void> = {};
    const input = vi.fn(), parts = vi.fn(), active = vi.fn(), commit = vi.fn();
    const remove = vi.fn();
    const context = { sliceToolActive: true, isActive: true, subdivisionParts: 2, subdivisionInput: "2",
      subdivisionTypingRef: { current: { text: "", at: 0 } }, KEYBOARD_FRET_TYPE_TIMEOUT_MS: 1400, MAX_SUBDIVISION_PARTS: 128,
      setSubdivisionInput: input, setSubdivisionParts: parts, setSliceToolActive: active, commitSubdivision: commit,
      window: { addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; }, removeEventListener: remove },
    };
    const cleanup = vm.runInNewContext(ts.transpileModule(`(${effect})()`, {}).outputText, context);
    const event = (extra = {}) => ({ target: { closest: () => null }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), ...extra });
    listeners.keydown(event({ key: "2" }));
    listeners.keydown(event({ key: "3" }));
    expect(input).toHaveBeenLastCalledWith("23");
    expect(parts).toHaveBeenLastCalledWith(23);
    expect(commit).not.toHaveBeenCalled();
    listeners.wheel(event({ deltaY: -100 }));
    expect(parts).toHaveBeenLastCalledWith(3);
    listeners.keydown(event({ key: "Enter" }));
    expect(commit).toHaveBeenCalledOnce();
    listeners.mousedown(event({ button: 0 }));
    expect(commit).toHaveBeenCalledTimes(2);
    listeners.keydown(event({ key: "Escape" }));
    expect(active).toHaveBeenLastCalledWith(false);
    cleanup();
    expect(remove).toHaveBeenCalledTimes(3);
  });
});

describe("grouped subdivision", () => {
  it("shares a grid across transitive overlaps and subdivides separate groups independently", () => {
    const plan = buildSubdivisionPlan(fixture(), [1, 2, 3, 4], [], 3);
    expect(plan).toEqual([
      { kind: "note", id: 1, cuts: [40] },
      { kind: "note", id: 2, cuts: [80] },
      { kind: "note", id: 3, cuts: [] },
      { kind: "note", id: 4, cuts: [230, 260] },
    ]);
  });
  it("does not group merely touching notes or let unselected overlaps join groups", () => {
    const snapshot = fixture();
    snapshot.notes = [note(1, 0, 60), note(2, 60, 60), note(3, 30, 60)];
    expect(buildSubdivisionPlan(snapshot, [1, 2], [], 2).map((target) => target.cuts)).toEqual([[30], [90]]);
  });
  it("groups notes and chords by time, preserves metadata, and performs an immutable edit", () => {
    const snapshot = fixture();
    snapshot.chords = [{ id: 1, startTime: 0, length: 120, currentTabs: [[1, 1], [2, 2]], ogTabs: [[1, 1], [2, 2]], originalMidi: [60, 64], velocities: [70, 80], pitchBends: [[0], [1]], strums: [{ time: 0, direction: "down" }, { time: 70, direction: "up" }] }];
    const before = structuredClone(snapshot);
    const plan = buildSubdivisionPlan(snapshot, [2], [1], 2);
    expect(plan.map((target) => target.cuts)).toEqual([[60], [60]]);
    const result = subdivideSelection(snapshot, plan);
    const pieces = result.notes.filter((item) => item.id === 2 || item.id > 5);
    expect(pieces.map((item) => [item.startTime, item.length])).toEqual([[40, 20], [60, 40]]);
    expect(pieces.every((item) => item.velocity === 90 && item.midiNum === 64)).toBe(true);
    expect(result.notes.find((item) => item.id === 5)).toEqual(snapshot.notes[4]);
    expect(result.chords.map((item) => [item.startTime, item.length])).toEqual([[0, 60], [60, 60]]);
    expect(result.chords[1]).toMatchObject({ currentTabs: [[1, 1], [2, 2]], velocities: [70, 80], strums: [{ time: 10, direction: "up" }] });
    expect(snapshot).toEqual(before);
  });
  it("keeps rounded cuts unique and all fragments at least one frame", () => {
    const snapshot = fixture(); snapshot.notes = [note(1, 0, 3)];
    const result = subdivideSelection(snapshot, buildSubdivisionPlan(snapshot, [1], [], 128));
    expect(result.notes.map((item) => item.length)).toEqual([1, 1, 1]);
    expect(new Set(result.notes.map((item) => item.id)).size).toBe(3);
    expect(result.notes.reduce((sum, item) => sum + item.length, 0)).toBe(3);
  });
  it("keeps effect references attached to the appropriate segments", () => {
    const snapshot = fixture();
    snapshot.noteEffects = [{ id: 1, type: 2, startNoteId: 1, endNoteId: 4, noteEffectLabel: "slide" }];
    const result = subdivideSelection(snapshot, buildSubdivisionPlan(snapshot, [1, 4], [], 2));
    expect(result.noteEffects?.[0].startNoteId).toBe(result.notes.find((item) => item.startTime === 30)!.id);
    expect(result.noteEffects?.[0].endNoteId).toBe(4);
  });
});
