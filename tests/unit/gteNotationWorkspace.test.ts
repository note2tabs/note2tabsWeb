import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { describe, expect, it, vi } from "vitest";
import * as notation from "../../lib/gteNotation";
import * as score from "../../lib/gteNotationScore";
import VexFlow from "vexflow/bravura";
const { Glyphs } = VexFlow;
import type { EditorSnapshot } from "../../types/gte";

function harness(notes = false, readOnly = false) {
  const states: any[] = []; let cursor = 0;
  const effects: Array<() => void> = [], listeners = new Map<string, (event: any) => void>();
  const hooks = {
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next: any) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef: (value: any) => { const index = cursor++; if (!(index in states)) states[index] = { current: value }; return states[index]; },
    useMemo: (fn: () => unknown) => fn(), useEffect: (effect: () => void) => { effects.push(effect); },
  };
  const snapshot: EditorSnapshot = { id: "piano", instrumentId: "gm:piano", framesPerMessure: 480, totalFrames: 480, fps: 240, timeSignature: 4, timeSignatureBottom: 4, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
  if (notes) snapshot.notes = [{ id: 1, midiNum: 60, startTime: 0, length: 60, tab: [0, 0], optimals: [] }];
  const props = { snapshot, editorId: "score__ed__piano", isActive: true, editMenuDisabled: readOnly, onFocusWorkspace: vi.fn(), onGlobalPlaybackFrameChange: vi.fn(), onRequestUndo: vi.fn(), onRequestRedo: vi.fn(), onSnapshotChange: vi.fn((next: EditorSnapshot) => { props.snapshot = next; }) };
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(readFileSync("components/GteNotationWorkspace.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const dependencies = (name: string): any => {
    if (name === "vexflow/bravura") return { __esModule: true, default: VexFlow };
    if (name === "react") return hooks;
    if (name === "react-dom") return { createPortal: (node: unknown) => node };
    if (name === "react/jsx-runtime") return jsx;
    if (name.includes("GteEngravedScore")) return { __esModule: true, default: function TestEngraving() { return jsx.jsx("div", { "data-test-score": true }); } };
    if (name.includes("gteNotationScore")) return score;
    if (name.includes("gtePitchedViewState")) return { readPitchedViewState: () => ({}), savePitchedViewState: () => {} };
    if (name.includes("gteNotation")) return notation;
    if (name.includes("i18n/react")) return { useLocale: () => ({ t: (key: string) => key }) };
    if (name.includes("gteSamplePlayback")) return { prepareTrackInstrument: vi.fn(), schedulePreparedTrackNote: vi.fn() };
    throw new Error(name);
  };
  const toolbarModule = { exports: {} as any };
  vm.runInNewContext(ts.transpileModule(readFileSync("components/GteNotationToolbar.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: toolbarModule, exports: toolbarModule.exports, require: dependencies });
  vm.runInNewContext(compiled, { module, exports: module.exports, structuredClone, document: { addEventListener: (name: string, callback: (event: any) => void) => listeners.set(name, callback), removeEventListener: () => {} }, window: { innerWidth: 1200, innerHeight: 800 }, require: (name: string) => name.includes("GteNotationToolbar") ? toolbarModule.exports : dependencies(name) });
  const render = () => { cursor = 0; effects.length = 0; return module.exports.default(props); };
  const walk = (node: any): any[] => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...(typeof node.type === "function" ? walk(node.type(node.props)) : walk(node.props.children))] : [];
  const nodes = () => walk(render());
  const text = (node: any): string => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
  const button = (label: string) => nodes().find((node) => node.type === "button" && (node.props["aria-label"] === label || text(node) === label));
  const key = (value: string, options = {}) => render().props.onKeyDown({ key: value, target: { closest: () => null }, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...options });
  const engraving = () => nodes().find((node) => node.props.onPoint && node.props.onSelect);
  const place = (frame: number, midi = 64, staff: "treble" | "bass" = "treble") => engraving().props.onPoint({ frame, midi, staff });
  const selectFirst = () => engraving().props.onSelect(notation.scoreEvents(props.snapshot)[0], false);
  const outsidePointer = (inside = false, protectedTarget = false) => {
    const element = render(); element.ref.current = { contains: () => inside, focus: () => {} };
    effects.find(effect => effect.toString().includes("const outside ="))!();
    listeners.get("pointerdown")!({ target: { closest: () => protectedTarget ? {} : null } });
  };
  return { props, render, nodes, button, key, engraving, place, selectFirst, outsidePointer };
}

describe("notation input workflow", () => {
  it("clears selection outside the sheet but preserves it for sheet and toolbar interactions", () => {
    const h = harness(true); h.selectFirst();
    h.outsidePointer(true, true);
    expect(h.engraving().props.selection.noteIds).toEqual([1]);
    h.outsidePointer();
    expect(h.engraving().props.selection).toEqual({ noteIds: [], chordIds: [] });
    h.selectFirst(); h.outsidePointer(true, false);
    expect(h.engraving().props.selection.noteIds).toEqual([]);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
  });
  it("selects bars like tabs with range/additive selection and delegates copy, paste and delete", () => {
    const h = harness(true), copy = vi.fn(), paste = vi.fn(), remove = vi.fn();
    h.props.snapshot.totalFrames = 1920;
    Object.assign(h.props, { onRequestSelectedBarsCopy: copy, onRequestSelectedBarsPaste: paste, onRequestSelectedBarsDelete: remove, barClipboardAvailable: true });
    const event = (extra = {}) => ({ preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 75, currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) }, ...extra });
    h.engraving().props.onBarSelect(1, event());
    expect(h.engraving().props.selectedBars).toEqual([1]);
    expect(h.engraving().props.selection).toEqual({ noteIds: [], chordIds: [] });
    expect(h.engraving().props.input).toBe(false);
    h.engraving().props.onBarSelect(3, event({ shiftKey: true }));
    expect(h.engraving().props.selectedBars).toEqual([1,2,3]);
    h.key("c", { ctrlKey: true }); expect(copy).toHaveBeenCalledWith([1,2,3]);
    h.key("v", { metaKey: true }); expect(paste).toHaveBeenCalledWith(4);
    h.key("Delete"); expect(remove).toHaveBeenCalledWith([1,2,3]);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
    h.key("Escape"); expect(h.engraving().props.selectedBars).toEqual([]);
    h.engraving().props.onBarSelect(0, event());
    h.engraving().props.onBarSelect(2, event({ ctrlKey: true }));
    expect(h.engraving().props.selectedBars).toEqual([0,2]);
    h.engraving().props.onBarSelect(2, event());
    expect(h.engraving().props.selectedBars).toEqual([2]);
    h.engraving().props.onBarSelect(2, event());
    expect(h.engraving().props.selectedBars).toEqual([]);
  });
  it("offers bar actions on right-click without losing an existing multi-bar selection", () => {
    const h = harness(true), copy = vi.fn(), paste = vi.fn();
    h.props.snapshot.totalFrames = 1440;
    Object.assign(h.props, { onRequestSelectedBarsCopy: copy, onRequestSelectedBarsPaste: paste, barClipboardAvailable: true });
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 20, clientY: 100, currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) } };
    h.engraving().props.onBarSelect(0, event);
    h.engraving().props.onBarSelect(1, { ...event, shiftKey: true });
    h.engraving().props.onBarContextMenu(1, event);
    expect(h.engraving().props.selectedBars).toEqual([0,1]);
    h.button("Copy bars").props.onClick();
    expect(copy).toHaveBeenCalledWith([0,1]);
    h.engraving().props.onBarContextMenu(2, event);
    expect(h.engraving().props.selectedBars).toEqual([2]);
    h.button("Paste bars").props.onClick(); expect(paste).toHaveBeenCalledWith(2);
  });
  it("drags only selected bars and routes drop targets through the shared bar move action", () => {
    const h = harness(true), start = vi.fn(), end = vi.fn(), drop = vi.fn();
    Object.assign(h.props, { onBarDragStart: start, onBarDragEnd: end, onRequestBarDrop: drop });
    const preventDefault = vi.fn(), dataTransfer = { effectAllowed: "", setData: vi.fn() };
    h.engraving().props.onBarDragStart(0, { preventDefault, dataTransfer });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(start).not.toHaveBeenCalled();
    h.engraving().props.onBarSelect(0, { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 0, currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) } });
    h.engraving().props.onBarDragStart(0, { preventDefault, dataTransfer });
    expect(start).toHaveBeenCalledWith([0]); expect(dataTransfer.effectAllowed).toBe("move");
    expect(dataTransfer.setData).toHaveBeenCalledWith("application/x-gte-bars", expect.stringContaining('"barIndices":[0]'));
    h.engraving().props.onBarDrop(1); expect(drop).toHaveBeenCalledWith(1);
    h.engraving().props.onBarDragEnd(); expect(end).toHaveBeenCalledOnce();
    h.selectFirst(); expect(h.engraving().props.selectedBars).toEqual([]);
  });
  it("does not expose bar-editing gestures in read-only or practice scores", () => {
    const h = harness(true, true);
    expect(h.engraving().props.onBarSelect).toBeUndefined();
    expect(h.engraving().props.onBarContextMenu).toBeUndefined();
    expect(h.engraving().props.onBarDragStart).toBeUndefined();
    expect(h.engraving().props.onBarDrop).toBeUndefined();
  });
  it("uses a right-side vertical toolbar with distinct note and rest modes", () => {
    const h = harness();
    const toolbar = h.nodes().find((node) => node.props["data-gte-notation-toolbar"]);
    expect(toolbar.props.className).toContain("col-start-2");
    expect(toolbar.props.style.overflowY).toBeUndefined();
    expect(toolbar.props.style.maxHeight).toBeUndefined();
    expect(h.nodes().find((node) => node.props.role === "toolbar").props["aria-orientation"]).toBe("vertical");
    h.button("Quarter rest").props.onClick(); h.place(120);
    expect(h.engraving().props.restInput).toBe(true);
    expect(h.props.snapshot.notation?.rests?.[0]).toMatchObject({ start: 120, length: 120 });
    h.button("Sixteenth note").props.onClick(); h.place(240);
    expect(h.engraving().props.restInput).toBe(false);
    expect(h.props.snapshot.notes[0]).toMatchObject({ startTime: 240, length: 30 });
    h.key("Escape"); expect(h.engraving().props.input).toBe(false);
  });
  it("inserts into the manually chosen voice and changes selection voice without changing timing", () => {
    const h = harness(); h.button("Voice 2").props.onClick(); h.place(0);
    expect(h.props.snapshot.notes[0]).toMatchObject({ notationVoice: 2, startTime: 0, length: 60 });
    h.selectFirst(); h.button("Voice 1").props.onClick();
    expect(h.props.snapshot.notes[0]).toMatchObject({ notationVoice: 1, startTime: 0, length: 60 });
  });
  it("always snaps rhythm and constrains new pitches while permitting an explicit accidental override", () => {
    const h = harness(); Object.assign(h.props, { globalSnapToGridEnabled: false });
    h.place(0, 61); Object.assign(h.props, { globalSnapToKeyEnabled: true }); h.place(60, 61);
    expect(h.props.snapshot.notes.map((note) => note.midiNum)).toEqual([61, 60]);
    expect(h.engraving().props.snapEnabled).toBe(true);
    h.button("Sharp").props.onClick();
    h.key("c"); expect(h.props.snapshot.notes[2].midiNum).toBe(61);
    expect(h.button("Snap to grid")).toBeUndefined();
  });
  it("starts an empty score in note input mode and preserves an existing score in Select mode", () => {
    expect(harness().button("Eighth note").props["aria-pressed"]).toBe(true);
    expect(harness(true).engraving().props.input).toBe(false);
  });
  it("adds A–G notes sequentially, with Shift adding a simultaneous note", () => {
    const h = harness();
    h.key("c"); h.key("e"); h.key("g", { shiftKey: true });
    expect(h.props.snapshot.notes.map((note) => [note.midiNum, note.startTime, note.length])).toEqual([[60, 0, 60], [64, 60, 60], [67, 60, 60]]);
    expect(h.props.onSnapshotChange).toHaveBeenCalledTimes(3);
  });
  it("uses note values and nearest-register entry, with Ctrl+arrow for octave changes", () => {
    const h = harness(); h.button("Quarter note").props.onClick();
    h.key("a");
    expect(h.props.snapshot.notes[0]).toMatchObject({ midiNum: 57, length: 120 });
    h.key("ArrowDown", { ctrlKey: true }); h.key("b");
    expect(h.props.snapshot.notes.map((note) => note.midiNum)).toEqual([45, 47]);
  });
  it("inserts at the exact engraved point and advances the input caret", () => {
    const h = harness(); h.button("Quarter note").props.onClick(); h.place(120, 57, "treble");
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
  it("Escape leaves entry mode and note tools are activated by clicking, not shortcuts", () => {
    const h = harness(); h.key("Escape"); h.key("c");
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
    for (const key of ["n", ".", "r", "0", "1", "2", "3", "4", "5", "6", "7"]) h.key(key);
    expect(h.engraving().props.input).toBe(false);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
    h.button("Eighth note").props.onClick(); h.key("c");
    expect(h.props.snapshot.notes).toHaveLength(1);
  });
  it("supports dotted durations and rests without adding silent fake notes", () => {
    const h = harness();
    h.button("Dotted note").props.onClick(); h.button("Eighth rest").props.onClick(); h.place(0);
    expect(h.props.snapshot.notes).toHaveLength(0);
    expect(h.props.snapshot.notation?.rests?.[0]).toMatchObject({ start: 0, length: 90, dotted: true });
    h.button("Eighth note").props.onClick(); h.key("c");
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
  it("activates insertion without rewriting a selected note when choosing a duration", () => {
    const h = harness(true);
    h.selectFirst();
    expect(h.engraving().props.input).toBe(false);
    h.button("Half note").props.onClick();
    expect(h.props.snapshot.notes[0].length).toBe(60);
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
    h.key("y", { ctrlKey: true }); expect(h.props.onRequestRedo).toHaveBeenCalledOnce();
  });
  it("never edits a read-only score", () => {
    const h = harness(true, true);
    h.key("Delete"); h.key("ArrowUp"); h.key("c"); h.place(0);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
    expect(h.button("Eighth note").props.disabled).toBe(true);
    expect(h.engraving().props.onAddBar).toBeUndefined();
  });
  it("adds a bar through the button anchored in the engraved score", () => {
    const h = harness();
    const before = h.engraving().props.score.measures.length;
    h.engraving().props.onAddBar();
    expect(h.engraving().props.score.measures.length).toBe(before + 1);
    expect(h.props.onSnapshotChange).toHaveBeenCalledOnce();
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
    expect(h.engraving().props.guides).toBeUndefined();
    expect(h.button("Note input")).toBeUndefined();
    h.place(240);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
  });
  it("keeps the editing toolbar sticky inside its track and omits it in reading mode", () => {
    const h = harness();
    const toolbar = h.nodes().find((node) => node.props["data-gte-notation-toolbar"]);
    expect(toolbar.props.className).toContain("sticky");
    expect(toolbar.props.style.top).toBe(8);
    Object.assign(h.props, { practiceMode: true });
    expect(h.nodes().find((node) => node.props["data-gte-notation-toolbar"])).toBeUndefined();
  });
  it("replaces or extends box selection without changing notes", () => {
    const h = harness(); h.key("c"); h.key("e");
    const events = notation.scoreEvents(h.props.snapshot);
    h.props.onSnapshotChange.mockClear();
    h.engraving().props.onBoxSelect([events[0]], false);
    expect(h.engraving().props.selection.noteIds).toEqual([events[0].noteId]);
    h.engraving().props.onBoxSelect([events[1], events[0]], true);
    expect(h.engraving().props.selection.noteIds).toEqual([events[0].noteId, events[1].noteId]);
    h.engraving().props.onBoxSelect([], false);
    expect(h.engraving().props.selection.noteIds).toEqual([]);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
  });
  it("selects and shift-toggles individual simultaneous chord tones without changing music", () => {
    const h = harness();
    h.props.snapshot.chords = [{ id: 8, startTime: 0, length: 120, originalMidi: [60,64,67], currentTabs: [[0,0],[0,0],[0,0]], ogTabs: [] }];
    const events = notation.scoreEvents(h.props.snapshot);
    h.engraving().props.onSelect(events[1], false);
    expect(h.engraving().props.selection).toMatchObject({ noteIds: [], chordIds: [], eventKeys: ["c:8:1"] });
    h.engraving().props.onSelect(events[2], true);
    expect(h.engraving().props.selection.eventKeys).toEqual(["c:8:1","c:8:2"]);
    h.engraving().props.onSelect(events[1], true);
    expect(h.engraving().props.selection.eventKeys).toEqual(["c:8:2"]);
    expect(h.props.onSnapshotChange).not.toHaveBeenCalled();
    h.key("Delete");
    expect(notation.scoreEvents(h.props.snapshot).map(note => note.midi)).toEqual([60,64]);
  });
  it("shows musical values without note-tool shortcuts, keeping only the Escape key", () => {
    const h = harness();
    const expand = (node: any): any[] => Array.isArray(node) ? node.flatMap(expand) : node?.props
      ? [node, ...expand(typeof node.type === "function" ? node.type(node.props) : node.props.children)] : [];
    for (const [label, value, shortcut, glyph] of [
      ["Whole note", 1, "7", Glyphs.noteWhole], ["Half note", 2, "6", Glyphs.noteHalfUp],
      ["Quarter note", 4, "5", Glyphs.noteQuarterUp], ["Eighth note", 8, "4", Glyphs.note8thUp],
      ["Sixteenth note", 16, "3", Glyphs.note16thUp], ["Thirty-second note", 32, "2", Glyphs.note32ndUp],
      ["Sixty-fourth note", 64, "1", Glyphs.note64thUp],
    ] as const) {
      const button = h.button(label), nodes = expand(button);
      expect(button.props["aria-keyshortcuts"]).toBeUndefined();
      expect(button.props.title).toContain(label);
      expect(nodes.find((node) => node.type === "text").props.children).toBe(glyph);
      expect(nodes.find((node) => node.type === "kbd")).toBeUndefined();
      expect(nodes.some((node) => node.type === "span" && node.props.children === (value === 1 ? "1" : `1/${value}`))).toBe(true);
    }
    h.key("Escape");
    expect(h.engraving().props.input).toBe(false);
    expect(h.button("Eighth note").props["aria-pressed"]).toBe(false);
    expect(h.button("Select")).toBeUndefined();
    expect(h.button("Snap selection to key")).toBeDefined();
    expect(h.button("Note input")).toBeUndefined();
    expect(h.button("Beat guides")).toBeUndefined();
  });
});
