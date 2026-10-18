import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { describe, expect, it, vi } from "vitest";
import * as notation from "../../lib/gteNotation";
import * as score from "../../lib/gteNotationScore";
import type { EditorSnapshot } from "../../types/gte";

function harness(notes = false, readOnly = false) {
  const states: any[] = []; let cursor = 0;
  const hooks = {
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next: any) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef: (value: any) => { const index = cursor++; if (!(index in states)) states[index] = { current: value }; return states[index]; },
    useMemo: (fn: () => unknown) => fn(), useEffect: () => {},
  };
  const snapshot: EditorSnapshot = { id: "piano", instrumentId: "gm:piano", framesPerMessure: 480, totalFrames: 480, fps: 240, timeSignature: 4, timeSignatureBottom: 4, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
  if (notes) snapshot.notes = [{ id: 1, midiNum: 60, startTime: 0, length: 60, tab: [0, 0], optimals: [] }];
  const props = { snapshot, editorId: "score__ed__piano", isActive: true, editMenuDisabled: readOnly, onFocusWorkspace: vi.fn(), onGlobalPlaybackFrameChange: vi.fn(), onRequestUndo: vi.fn(), onRequestRedo: vi.fn(), onSnapshotChange: vi.fn((next: EditorSnapshot) => { props.snapshot = next; }) };
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(readFileSync("components/GteNotationWorkspace.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const dependencies = (name: string): any => {
    if (name === "react") return hooks;
    if (name === "react-dom") return { createPortal: (node: unknown) => node };
    if (name === "react/jsx-runtime") return jsx;
    if (name.includes("GteEngravedScore")) return { __esModule: true, default: function TestEngraving() { return jsx.jsx("div", { "data-test-score": true }); } };
    if (name.includes("gteNotationScore")) return score;
    if (name.includes("gteNotation")) return notation;
    if (name.includes("i18n/react")) return { useLocale: () => ({ t: (key: string) => key }) };
    if (name.includes("gteSamplePlayback")) return { prepareTrackInstrument: vi.fn(), schedulePreparedTrackNote: vi.fn() };
    throw new Error(name);
  };
  const toolbarModule = { exports: {} as any };
  vm.runInNewContext(ts.transpileModule(readFileSync("components/GteNotationToolbar.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: toolbarModule, exports: toolbarModule.exports, require: dependencies });
  vm.runInNewContext(compiled, { module, exports: module.exports, structuredClone, require: (name: string) => name.includes("GteNotationToolbar") ? toolbarModule.exports : dependencies(name) });
  const render = () => { cursor = 0; return module.exports.default(props); };
  const walk = (node: any): any[] => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...(typeof node.type === "function" ? walk(node.type(node.props)) : walk(node.props.children))] : [];
  const nodes = () => walk(render());
  const text = (node: any): string => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
  const button = (label: string) => nodes().find((node) => node.type === "button" && (node.props["aria-label"] === label || text(node) === label));
  const key = (value: string, options = {}) => render().props.onKeyDown({ key: value, target: { closest: () => null }, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...options });
  const engraving = () => nodes().find((node) => node.props.onPoint && node.props.onSelect);
  const place = (frame: number, midi = 64, staff: "treble" | "bass" = "treble") => engraving().props.onPoint({ frame, midi, staff });
  const selectFirst = () => engraving().props.onSelect(notation.scoreEvents(props.snapshot)[0], false);
  return { props, render, nodes, button, key, engraving, place, selectFirst };
}

describe("notation input workflow", () => {
  it("starts an empty score in note input mode and preserves an existing score in Select mode", () => {
    expect(harness().button("Note input").props["aria-pressed"]).toBe(true);
    expect(harness(true).button("Select").props["aria-pressed"]).toBe(true);
  });
  it("adds A–G notes sequentially, with Shift adding a simultaneous note", () => {
    const h = harness();
    h.key("c"); h.key("e"); h.key("g", { shiftKey: true });
    expect(h.props.snapshot.notes.map((note) => [note.midiNum, note.startTime, note.length])).toEqual([[60, 0, 60], [64, 60, 60], [67, 60, 60]]);
    expect(h.props.onSnapshotChange).toHaveBeenCalledTimes(3);
  });
  it("uses note values and nearest-register entry, with Ctrl+arrow for octave changes", () => {
    const h = harness(); h.key("5");
    h.key("a");
    expect(h.props.snapshot.notes[0]).toMatchObject({ midiNum: 57, length: 120 });
    h.key("ArrowDown", { ctrlKey: true }); h.key("b");
    expect(h.props.snapshot.notes.map((note) => note.midiNum)).toEqual([45, 47]);
  });
  it("inserts at the exact engraved point and advances the input caret", () => {
    const h = harness(); h.key("5"); h.place(120, 57, "treble");
    expect(h.props.snapshot.notes[0]).toMatchObject({ startTime: 120, midiNum: 57, notationStaff: "treble" });
    expect(h.engraving().props.cursor).toMatchObject({ frame: 240, staff: "treble" });
  });
  it("keeps Select mode non-writing and hides entry aids on the engraving surface", () => {
    const h = harness(true); h.place(120);
    expect(h.engraving().props.input).toBe(false);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
  });
  it("choosing a note value starts placement with no selection", () => {
    const h = harness(true); h.button("Quarter note").props.onClick(); h.place(360);
    expect(h.engraving().props.input).toBe(true);
    expect(h.props.snapshot.notes[1]).toMatchObject({ startTime: 360, length: 120 });
  });
  it("Escape leaves entry mode, and N enables it again", () => {
    const h = harness(); h.key("Escape"); h.key("c");
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
    h.key("n"); h.key("c");
    expect(h.props.snapshot.notes).toHaveLength(1);
  });
  it("supports dotted durations and rests without adding silent fake notes", () => {
    const h = harness();
    h.key("."); h.key("r"); h.key("c");
    expect(h.props.snapshot.notes).toHaveLength(1);
    expect(h.props.snapshot.notes[0]).toMatchObject({ startTime: 90, length: 90 });
  });
  it("uses note-value buttons rather than octave, pitch, or duration form controls", () => {
    const h = harness();
    expect(h.nodes().filter((node) => node.type === "select")).toEqual([]);
    expect(h.button("Quarter note")).toBeTruthy();
    expect(h.button("Flat")).toBeTruthy();
    expect(h.button("Natural")).toBeTruthy();
    expect(h.button("Sharp")).toBeTruthy();
    expect(h.button("Transpose up")).toBeUndefined();
  });
  it("changes the next input duration without rewriting the previously entered note", () => {
    const h = harness(); h.key("c"); h.button("Quarter note").props.onClick(); h.key("d");
    expect(h.props.snapshot.notes.map((note) => [note.startTime, note.length])).toEqual([[0, 60], [60, 120]]);
  });
  it("changes the selected note duration outside note input", () => {
    const h = harness(true);
    h.selectFirst();
    expect(h.button("Eighth note").props["aria-pressed"]).toBe(true);
    h.button("Half note").props.onClick();
    expect(h.props.snapshot.notes[0].length).toBe(240);
    expect(h.button("Half note").props["aria-pressed"]).toBe(true);
  });
  it("edits selected pitches, deletes them, and delegates undo to shared history", () => {
    const h = harness(); h.key("c"); h.key("ArrowUp");
    expect(h.props.snapshot.notes[0].midiNum).toBe(61);
    h.key("ArrowDown", { shiftKey: true });
    expect(h.props.snapshot.notes[0].midiNum).toBe(49);
    h.key("Delete");
    expect(h.props.snapshot.notes).toEqual([]);
    h.key("z", { ctrlKey: true }); expect(h.props.onRequestUndo).toHaveBeenCalledOnce();
  });
  it("never edits a read-only score", () => {
    const h = harness(true, true);
    h.key("Delete"); h.key("ArrowUp"); h.key("c"); h.place(0);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
    expect(h.button("Note input").props.disabled).toBe(true);
  });
  it("applies one engraving drag as one undoable edit, without changing performance velocities", () => {
    const h = harness(true);
    h.engraving().props.onMove(notation.scoreEvents(h.props.snapshot), 60, 2);
    expect(h.props.snapshot.notes[0]).toMatchObject({ startTime: 60, midiNum: 62 });
    expect(h.props.onSnapshotChange).toHaveBeenCalledOnce();
  });
  it("connects the song key to engraving and keyboard pitch entry", () => {
    const h = harness(); Object.assign(h.props, { canvasKeyBase: 4, canvasKeyType: 1 });
    expect(h.engraving().props.score.key).toBe("Em");
    h.key("f");
    expect(h.props.snapshot.notes[0].midiNum).toBe(66);
  });
  it("renders Tab View as a clean, read-only score", () => {
    const h = harness(true); Object.assign(h.props, { tabViewEnabled: true });
    expect(h.engraving().props.disabled).toBe(true);
    expect(h.engraving().props.guides).toBe(false);
    expect(h.button("Note input")).toBeUndefined();
    h.place(240);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
  });
});
